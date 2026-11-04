-- ============================================================================
-- Migration: 20261102140000_fix_trainer_assignment_registration.sql
-- Description: Fix trainer assignment schema alignment in register_member_by_reception
-- Resolves:
--   1. "column 'assigned_at' of relation 'trainer_assignments' does not exist"
--   2. "column 'membership_id' of relation 'trainer_assignments' does not exist"
-- Matches public.trainer_assignments schema:
--   - customer_id (UUID NOT NULL)
--   - trainer_id (UUID NOT NULL)
--   - membership_id (UUID)
--   - assigned_by (UUID)
--   - status (TEXT NOT NULL DEFAULT 'ACTIVE')
--   - monthly_fee_at_assignment (NUMERIC NOT NULL DEFAULT 0)
--   - start_date (DATE NOT NULL DEFAULT CURRENT_DATE)
--   - notes (TEXT)
-- ============================================================================

-- 1. Ensure membership_id column exists on trainer_assignments
ALTER TABLE public.trainer_assignments
  ADD COLUMN IF NOT EXISTS membership_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trainer_assignments_membership
  ON public.trainer_assignments(membership_id);

-- 2. Replace register_member_by_reception with schema-accurate trainer_assignments insert
CREATE OR REPLACE FUNCTION public.register_member_by_reception(
  p_name TEXT,
  p_phone TEXT,
  p_category TEXT DEFAULT 'REGULAR',
  p_plan_id UUID DEFAULT NULL,
  p_plan_name TEXT DEFAULT NULL,
  p_proof_path TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'CASH',
  p_student_id TEXT DEFAULT NULL,
  p_institution TEXT DEFAULT NULL,
  p_needs_trainer BOOLEAN DEFAULT FALSE,
  p_trainer_id UUID DEFAULT NULL,
  p_temp_password TEXT DEFAULT NULL,
  p_gender TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_method TEXT := upper(coalesce(p_payment_method, 'CASH'));
  v_clean_proof TEXT;
  v_plan public.plans%ROWTYPE;
  v_duration_days INT := 30;
  v_plan_price NUMERIC := 2500;
  v_trainer_fee NUMERIC := 0;
  v_total_amount NUMERIC := 2500;
  v_notes TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_customer_code TEXT;
  v_max_code_num BIGINT;
  v_temp_password TEXT;
  v_hash TEXT;
  v_member_user_id UUID;
  v_member_email TEXT;
  v_customer_id UUID;
  v_membership_id UUID;
  v_payment_id UUID;
  v_assignment_id UUID;
  v_trainer_exists BOOLEAN := FALSE;
  v_trainer_name TEXT;
  v_user_record_id UUID;
  v_normalized_gender TEXT;
  v_student_verification_status TEXT;
BEGIN
  -- 0. Authorization check: Reception or Admin only
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Only Reception or Admin staff can register members';
  END IF;

  -- Validate and normalize gender
  IF p_gender IS NOT NULL AND trim(p_gender) <> '' THEN
    IF lower(trim(p_gender)) IN ('male', 'm') THEN
      v_normalized_gender := 'Male';
    ELSIF lower(trim(p_gender)) IN ('female', 'f') THEN
      v_normalized_gender := 'Female';
    ELSE
      v_normalized_gender := trim(p_gender);
    END IF;
  ELSE
    v_normalized_gender := NULL;
  END IF;

  -- Validate payment method
  IF v_method NOT IN ('CASH', 'TELEBIRR', 'CBE_BIRR', 'CBE BIRR') THEN
    RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
  END IF;

  v_clean_proof := nullif(trim(coalesce(p_proof_path, '')), '');
  IF v_method <> 'CASH' AND v_clean_proof IS NULL THEN
    RAISE EXCEPTION 'Payment proof is required for % payments', v_method;
  END IF;

  -- Verify staff user id for foreign keys
  SELECT id INTO v_user_record_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;

  -- Validate plan
  IF p_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id AND is_active = TRUE;
  END IF;

  IF v_plan.id IS NULL AND p_plan_name IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE lower(trim(name)) = lower(trim(p_plan_name)) AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_plan.id IS NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE is_active = TRUE ORDER BY price ASC LIMIT 1;
  END IF;

  IF v_plan.id IS NOT NULL THEN
    v_plan_price := coalesce(v_plan.price, 0);
    v_duration_days := coalesce(v_plan.duration_days, 30);
  END IF;

  -- Trainer Fee Calculation
  IF p_needs_trainer THEN
    IF p_trainer_id IS NULL THEN
      RAISE EXCEPTION 'Trainer selection is required when personal training is enabled';
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.trainer_profiles tp
      WHERE tp.id = p_trainer_id AND tp.is_active = TRUE
    ), (
      SELECT trim(coalesce(tp.first_name, '') || ' ' || coalesce(tp.last_name, ''))
      FROM public.trainer_profiles tp WHERE tp.id = p_trainer_id LIMIT 1
    ) INTO v_trainer_exists, v_trainer_name;

    IF NOT v_trainer_exists THEN
      RAISE EXCEPTION 'Selected trainer does not exist or is inactive';
    END IF;

    SELECT coalesce(s.monthly_trainer_fee, 0) INTO v_trainer_fee
    FROM public.settings s
    LIMIT 1;

    IF v_trainer_fee <= 0 THEN
      v_trainer_fee := 1000;
    END IF;
  ELSE
    v_trainer_fee := 0;
  END IF;

  v_total_amount := v_plan_price + v_trainer_fee;

  -- Parse First and Last Name
  v_first_name := split_part(trim(p_name), ' ', 1);
  v_last_name := trim(substr(trim(p_name), length(v_first_name) + 1));
  IF v_last_name = '' THEN
    v_last_name := 'Member';
  END IF;

  -- Generate Next Customer Code P-XXXX
  SELECT COALESCE(MAX(
    CASE
      WHEN customer_code ~ '^P-[0-9]+$' THEN SUBSTRING(customer_code FROM 3)::BIGINT
      ELSE 0
    END
  ), 0) + 1
  INTO v_max_code_num
  FROM public.customers;

  v_customer_code := 'P-' || LPAD(v_max_code_num::TEXT, 4, '0');

  -- Generate or use temporary password
  IF p_temp_password IS NOT NULL AND length(trim(p_temp_password)) >= 6 THEN
    v_temp_password := trim(p_temp_password);
  ELSE
    v_temp_password := 'GYM-' || LPAD(FLOOR(random() * 10000)::TEXT, 4, '0');
  END IF;

  v_hash := crypt(v_temp_password, gen_salt('bf', 10));
  v_member_user_id := gen_random_uuid();
  v_member_email := lower(replace(v_customer_code, '-', '')) || '@powerplus.et';

  -- Create auth.users account
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    v_member_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_member_email,
    v_hash,
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object(
      'full_name', trim(p_name),
      'first_name', v_first_name,
      'last_name', v_last_name,
      'customer_code', v_customer_code,
      'category', coalesce(p_category, 'REGULAR'),
      'role', 'customer',
      'gender', v_normalized_gender
    ),
    now(),
    now()
  );

  -- Create auth.identities (email is a generated column from identity_data->>'email')
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_member_user_id,
    jsonb_build_object('sub', v_member_user_id::text, 'email', v_member_email),
    'email',
    v_member_user_id::text,
    now(),
    now(),
    now()
  );

  -- Create public.users entry with correct role 'MEMBER' and password_hash
  INSERT INTO public.users (
    id,
    email,
    password_hash,
    role,
    is_active,
    login_id,
    created_at,
    updated_at
  ) VALUES (
    v_member_user_id,
    v_member_email,
    'SUPABASE_AUTH_MANAGED',
    'MEMBER',
    TRUE,
    v_customer_code,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    password_hash = 'SUPABASE_AUTH_MANAGED',
    role = 'MEMBER',
    is_active = TRUE,
    login_id = EXCLUDED.login_id,
    updated_at = now();

  -- Student verification status: NOT NULL check constraint
  IF coalesce(p_category, 'REGULAR') = 'STUDENT' THEN
    v_student_verification_status := 'VERIFIED';
  ELSE
    v_student_verification_status := 'NOT_REQUIRED';
  END IF;

  -- Create public.customers entry
  INSERT INTO public.customers (
    user_id,
    customer_code,
    first_name,
    last_name,
    phone,
    email,
    customer_type,
    status,
    student_id,
    institution,
    student_verification_status,
    assigned_trainer_id,
    gender,
    created_at,
    updated_at
  ) VALUES (
    v_member_user_id,
    v_customer_code,
    v_first_name,
    v_last_name,
    trim(p_phone),
    v_member_email,
    coalesce(p_category, 'REGULAR'),
    'ACTIVE',
    p_student_id,
    p_institution,
    v_student_verification_status,
    CASE WHEN p_needs_trainer THEN p_trainer_id ELSE NULL END,
    v_normalized_gender,
    now(),
    now()
  ) RETURNING id INTO v_customer_id;

  -- Create public.memberships entry with required price_at_purchase
  INSERT INTO public.memberships (
    customer_id,
    plan_id,
    start_date,
    end_date,
    status,
    price_at_purchase,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_customer_id,
    v_plan.id,
    CURRENT_DATE,
    CURRENT_DATE + v_duration_days,
    'ACTIVE',
    v_plan_price,
    v_user_record_id,
    now(),
    now()
  ) RETURNING id INTO v_membership_id;

  -- Notes for payment audit
  IF p_needs_trainer THEN
    v_notes := 'Plan: ' || coalesce(v_plan.name, 'Membership') || ' (' || v_plan_price || ' ETB) + Trainer: ' || coalesce(v_trainer_name, 'Assigned Trainer') || ' (' || v_trainer_fee || ' ETB).';
  ELSE
    v_notes := 'Plan: ' || coalesce(v_plan.name, 'Membership') || ' (' || v_plan_price || ' ETB).';
  END IF;

  -- Create public.payments entry
  INSERT INTO public.payments (
    customer_id,
    membership_id,
    amount,
    trainer_fee,
    trainer_id,
    payment_method,
    payment_status,
    transaction_reference,
    paid_at,
    recorded_by,
    notes,
    service_type,
    created_at
  ) VALUES (
    v_customer_id,
    v_membership_id,
    v_total_amount,
    v_trainer_fee,
    CASE WHEN p_needs_trainer THEN p_trainer_id ELSE NULL END,
    v_method,
    'PAID',
    v_clean_proof,
    now(),
    v_user_record_id,
    v_notes,
    'MEMBERSHIP',
    now()
  ) RETURNING id INTO v_payment_id;

  -- If Personal Trainer requested, record active assignment with valid table schema:
  -- (customer_id, trainer_id, membership_id, assigned_by, status, monthly_fee_at_assignment, start_date, notes)
  IF p_needs_trainer AND p_trainer_id IS NOT NULL THEN
    INSERT INTO public.trainer_assignments (
      customer_id,
      trainer_id,
      membership_id,
      assigned_by,
      status,
      monthly_fee_at_assignment,
      start_date,
      notes
    ) VALUES (
      v_customer_id,
      p_trainer_id,
      v_membership_id,
      v_user_record_id,
      'ACTIVE',
      v_trainer_fee,
      CURRENT_DATE,
      'Assigned during customer registration by Reception. Monthly trainer fee: ' || v_trainer_fee || ' ETB.'
    ) RETURNING id INTO v_assignment_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'customer_id', v_customer_id,
    'customer_code', v_customer_code,
    'login_id', v_customer_code,
    'temp_password', v_temp_password,
    'membership_id', v_membership_id,
    'payment_id', v_payment_id,
    'expiry_date', (CURRENT_DATE + v_duration_days)::TEXT,
    'trainer_assigned', p_needs_trainer,
    'trainer_id', CASE WHEN p_needs_trainer THEN p_trainer_id ELSE NULL END,
    'trainer_fee', v_trainer_fee,
    'total_amount', v_total_amount,
    'gender', v_normalized_gender
  );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.register_member_by_reception(
  TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT
) TO authenticated, anon;
