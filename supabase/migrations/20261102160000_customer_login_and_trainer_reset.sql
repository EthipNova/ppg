-- Migration: 20261102160000_customer_login_and_trainer_reset.sql
-- Description:
-- 1. Backfills auth.users token columns to '' so GoTrue can scan users without 500 error.
-- 2. Updates register_member_by_reception to insert empty string tokens into auth.users.
-- 3. Creates reception_reset_trainer_password RPC for reception staff to securely reset trainer passwords.
-- 4. Creates get_reception_trainers_directory RPC for reception portal trainer & assigned members listing.

-- ============================================================================
-- 1. Backfill auth.users token columns
-- ============================================================================
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE 
  confirmation_token IS NULL
  OR recovery_token IS NULL
  OR email_change IS NULL
  OR email_change_token_current IS NULL
  OR email_change_token_new IS NULL
  OR phone_change IS NULL
  OR phone_change_token IS NULL
  OR reauthentication_token IS NULL;

-- ============================================================================
-- 2. Update register_member_by_reception to ensure valid GoTrue account fields
-- ============================================================================
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

  -- Create auth.users account with EMPTY STRING tokens (CRITICAL for GoTrue scan)
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_current,
    email_change_token_new,
    phone_change,
    phone_change_token,
    reauthentication_token,
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
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
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

  -- Create auth.identities
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
    jsonb_build_object(
      'sub', v_member_user_id::text, 
      'email', v_member_email,
      'email_verified', false,
      'phone_verified', false
    ),
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

  -- Record active assignment in trainer_assignments if requested
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
) TO authenticated, service_role, anon;

-- ============================================================================
-- 3. Reception Reset Trainer Password RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reception_reset_trainer_password(
  p_trainer_id UUID,
  p_new_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_trainer public.trainer_profiles%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_user_id UUID;
  v_login_id TEXT;
  v_temp_password TEXT;
  v_hash TEXT;
  v_full_name TEXT;
BEGIN
  -- 1. Authorization: Reception or Admin
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Only Reception or Admin staff can reset trainer passwords.';
  END IF;

  -- 2. Lookup trainer profile
  SELECT * INTO v_trainer
  FROM public.trainer_profiles
  WHERE id = p_trainer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trainer profile not found.';
  END IF;

  v_user_id := v_trainer.user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Trainer is not linked to any user account.';
  END IF;

  -- 3. Verify target account belongs to a TRAINER role
  SELECT * INTO v_user
  FROM public.users
  WHERE id = v_user_id;

  IF NOT FOUND OR upper(coalesce(v_user.role, '')) <> 'TRAINER' THEN
    RAISE EXCEPTION 'Target user is not registered as a Trainer.';
  END IF;

  v_full_name := trim(COALESCE(v_trainer.first_name, '') || ' ' || COALESCE(v_trainer.last_name, ''));
  v_login_id := COALESCE(v_user.login_id, 'TRN-' || upper(substring(replace(v_trainer.id::text, '-', '') from 1 for 4)));

  -- 4. Generate or validate temporary password
  IF p_new_password IS NOT NULL AND length(trim(p_new_password)) >= 6 THEN
    v_temp_password := trim(p_new_password);
  ELSE
    v_temp_password := 'TRN-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4)) || '-' || (floor(random() * 8999) + 1000)::text;
  END IF;

  v_hash := extensions.crypt(v_temp_password, extensions.gen_salt('bf'));

  -- 5. Update auth.users with secure password hash, set empty string tokens, confirm email
  UPDATE auth.users
  SET encrypted_password = v_hash,
      updated_at = NOW(),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      phone_change = COALESCE(phone_change, ''),
      phone_change_token = COALESCE(phone_change_token, ''),
      reauthentication_token = COALESCE(reauthentication_token, '')
  WHERE id = v_user_id;

  -- 6. Ensure public.users password_hash and login_id are consistent
  UPDATE public.users
  SET password_hash = 'SUPABASE_AUTH_MANAGED',
      login_id = COALESCE(login_id, v_login_id),
      updated_at = NOW()
  WHERE id = v_user_id;

  -- Return result
  RETURN jsonb_build_object(
    'success', TRUE,
    'trainer_id', v_trainer.id,
    'trainer_name', v_full_name,
    'login_id', v_login_id,
    'new_temp_password', v_temp_password
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reception_reset_trainer_password(UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 4. Reception Trainers Directory RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_reception_trainers_directory()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_trainers JSONB;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Only Reception or Admin staff can view trainer directory.';
  END IF;

  SELECT jsonb_agg(tr) INTO v_trainers
  FROM (
    SELECT
      tp.id,
      tp.user_id,
      trim(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')) AS full_name,
      COALESCE(tp.phone, '') AS phone,
      COALESCE(tp.specialization, 'Fitness Trainer') AS specialization,
      tp.is_active,
      u.login_id,
      u.email,
      COUNT(DISTINCT CASE WHEN ta.status = 'ACTIVE' THEN ta.customer_id END) AS active_members_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', ta_sub.id,
          'customer_id', c.id,
          'customer_code', c.customer_code,
          'customer_name', trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')),
          'phone', COALESCE(c.phone, ''),
          'category', COALESCE(c.customer_type, 'REGULAR'),
          'customer_status', c.status,
          'assignment_status', ta_sub.status,
          'start_date', ta_sub.start_date,
          'end_date', ta_sub.end_date,
          'plan_name', COALESCE(pl.name, 'Standard Plan'),
          'membership_status', COALESCE(m.status, 'INACTIVE'),
          'membership_end', m.end_date
        ) ORDER BY ta_sub.start_date DESC)
        FROM (
          -- Pick the most relevant assignment per customer to avoid duplicates
          SELECT DISTINCT ON (customer_id) *
          FROM public.trainer_assignments
          WHERE trainer_id = tp.id
          ORDER BY customer_id, (CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END), start_date DESC
        ) ta_sub
        JOIN public.customers c ON c.id = ta_sub.customer_id
        LEFT JOIN LATERAL (
          SELECT m_inner.status, m_inner.end_date, m_inner.plan_id
          FROM public.memberships m_inner
          WHERE m_inner.customer_id = c.id
          ORDER BY m_inner.created_at DESC
          LIMIT 1
        ) m ON TRUE
        LEFT JOIN public.plans pl ON pl.id = m.plan_id
      ), '[]'::jsonb) AS assigned_members
    FROM public.trainer_profiles tp
    LEFT JOIN public.users u ON u.id = tp.user_id
    LEFT JOIN public.trainer_assignments ta ON ta.trainer_id = tp.id
    GROUP BY tp.id, tp.user_id, tp.first_name, tp.last_name, tp.phone, tp.specialization, tp.is_active, u.login_id, u.email
    ORDER BY tp.is_active DESC, tp.first_name ASC
  ) tr;

  RETURN jsonb_build_object(
    'trainers', COALESCE(v_trainers, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reception_trainers_directory() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
