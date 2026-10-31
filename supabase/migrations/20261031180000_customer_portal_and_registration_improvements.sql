-- ============================================================================
-- Migration: 20261031180000_customer_portal_and_registration_improvements.sql
-- Description:
-- 1. Adds photo_url column to public.customers and creates profile-photos bucket in storage.
-- 2. Sets student_verification_status = 'VERIFIED' for student customers upon registration.
-- 3. Adds p_gender to register_member_by_reception RPC to store customer gender upon registration.
-- 4. Creates update_customer_profile_photo RPC so authenticated customers can safely update only their profile photo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema: Add photo_url to customers table
-- ----------------------------------------------------------------------------
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- 2. Storage: Configure profile-photos bucket and RLS policies
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage policies for profile-photos
DO $$
BEGIN
  -- 1. Public read policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'profile_photos_public_read'
  ) THEN
    CREATE POLICY "profile_photos_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'profile-photos');
  END IF;

  -- 2. Authenticated user upload policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'profile_photos_authenticated_insert'
  ) THEN
    CREATE POLICY "profile_photos_authenticated_insert" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'profile-photos'
      AND auth.role() = 'authenticated'
    );
  END IF;

  -- 3. Authenticated user update policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'profile_photos_authenticated_update'
  ) THEN
    CREATE POLICY "profile_photos_authenticated_update" ON storage.objects
    FOR UPDATE USING (
      bucket_id = 'profile-photos'
      AND auth.role() = 'authenticated'
    );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Function: update_customer_profile_photo (Customer Self-Service)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_customer_profile_photo(p_photo_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_customer_id UUID;
  v_clean_url TEXT := trim(coalesce(p_photo_url, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to update profile photo';
  END IF;

  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE user_id = auth.uid();

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'No customer profile linked to the signed-in account';
  END IF;

  IF length(v_clean_url) = 0 THEN
    RAISE EXCEPTION 'Photo URL or reference is required';
  END IF;

  UPDATE public.customers
  SET photo_url = v_clean_url,
      updated_at = NOW()
  WHERE id = v_customer_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'customer_id', v_customer_id,
    'photo_url', v_clean_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_customer_profile_photo(TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Function: register_member_by_reception (Updated with Gender & Student Access)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT);
DROP FUNCTION IF EXISTS public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.register_member_by_reception(
  p_name TEXT,
  p_phone TEXT,
  p_category TEXT,
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
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_first_name TEXT;
  v_last_name TEXT;
  v_customer_id UUID;
  v_customer_code TEXT;
  v_plan public.plans%ROWTYPE;
  v_membership_id UUID;
  v_payment_id UUID;
  v_assignment_id UUID;
  v_user_record_id UUID;
  v_max_code_num INT;
  v_duration_days INT := 30;
  v_plan_price NUMERIC := 0;
  v_trainer_fee NUMERIC := 0;
  v_total_amount NUMERIC := 0;
  v_method TEXT;
  v_clean_proof TEXT;
  v_trainer_exists BOOLEAN := FALSE;
  v_trainer_name TEXT;
  v_notes TEXT;
  v_member_user_id UUID;
  v_member_email TEXT;
  v_temp_password TEXT;
  v_hash TEXT;
  v_normalized_gender TEXT;
  v_student_verification_status TEXT;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required to register members';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Member name is required';
  END IF;
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  -- Normalize gender if provided
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

  v_method := upper(trim(coalesce(p_payment_method, 'CASH')));
  IF v_method NOT IN ('CASH', 'TELEBIRR', 'CBE_BIRR') THEN
    RAISE EXCEPTION 'Invalid payment method: %, must be Cash, Telebirr, or CBE Birr', p_payment_method;
  END IF;

  v_clean_proof := nullif(trim(coalesce(p_proof_path, '')), '');

  IF v_method = 'CASH' THEN
    v_clean_proof := NULL;
  ELSE
    IF v_clean_proof IS NULL THEN
      RAISE EXCEPTION 'Payment proof photo is required for % payments', v_method;
    END IF;
  END IF;

  -- Check duplicate phone
  IF EXISTS (SELECT 1 FROM public.customers WHERE phone = trim(p_phone)) THEN
    RAISE EXCEPTION 'A customer with phone % is already registered', trim(p_phone);
  END IF;

  -- Resolve plan
  IF p_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id AND is_active = TRUE;
  END IF;

  IF v_plan.id IS NULL AND p_plan_name IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE lower(trim(name)) = lower(trim(p_plan_name)) AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_plan.id IS NOT NULL THEN
    v_duration_days := coalesce(v_plan.duration_days, 30);
    v_plan_price := v_plan.price;
  ELSE
    v_duration_days := 30;
    v_plan_price := 2500;
  END IF;

  -- Handle Personal Training option
  IF p_needs_trainer THEN
    IF p_trainer_id IS NULL THEN
      RAISE EXCEPTION 'Please select an available personal trainer.';
    END IF;

    SELECT
      TRUE,
      trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_trainer_exists, v_trainer_name
    FROM public.trainer_profiles
    WHERE id = p_trainer_id AND is_active = TRUE;

    IF NOT v_trainer_exists THEN
      RAISE EXCEPTION 'The selected trainer is currently unavailable or inactive.';
    END IF;

    -- Retrieve configured fee from settings
    SELECT COALESCE(monthly_trainer_fee, 500) INTO v_trainer_fee
    FROM public.settings
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_trainer_fee IS NULL OR v_trainer_fee <= 0 THEN
      RAISE EXCEPTION 'Personal trainer monthly fee is not configured in settings.';
    END IF;

    v_total_amount := v_plan_price + v_trainer_fee;
    v_notes := 'Member registration payment recorded by Reception (' || v_method || ') with Personal Trainer [' ||
               v_trainer_name || ']. Breakdown: Membership: ' || v_plan_price || ' ETB + Monthly Trainer Fee: ' || v_trainer_fee || ' ETB.';
  ELSE
    v_trainer_fee := 0;
    v_total_amount := v_plan_price;
    v_notes := 'In-person member registration payment recorded by Reception (' || v_method || ')';
  END IF;

  -- Name parsing
  v_first_name := split_part(trim(p_name), ' ', 1);
  v_last_name := nullif(btrim(substr(trim(p_name), length(v_first_name) + 1)), '');
  IF v_last_name IS NULL THEN
    v_last_name := v_first_name;
  END IF;

  -- Compute next sequential customer code
  SELECT coalesce(max(substring(customer_code FROM '^PP-([0-9]{1,6})$')::BIGINT), 0) + 1
  INTO v_max_code_num
  FROM public.customers
  WHERE customer_code ~ '^PP-[0-9]{1,6}$';

  v_customer_code := 'PP-' || lpad(v_max_code_num::TEXT, 3, '0');

  -- Generate temporary password
  IF p_temp_password IS NOT NULL AND length(trim(p_temp_password)) >= 6 THEN
    v_temp_password := trim(p_temp_password);
  ELSE
    v_temp_password := 'PP-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4)) || '-' || (floor(random() * 8999) + 1000)::text;
  END IF;

  v_hash := extensions.crypt(v_temp_password, extensions.gen_salt('bf'));
  v_member_user_id := gen_random_uuid();
  v_member_email := lower(replace(v_customer_code, '-', '')) || '@powerplus.et';

  -- Create auth.users account with standard empty tokens
  INSERT INTO auth.users (
    id,
    instance_id,
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
    aud,
    role,
    created_at,
    updated_at
  ) VALUES (
    v_member_user_id,
    '00000000-0000-0000-0000-000000000000',
    v_member_email,
    v_hash,
    NOW(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', trim(p_name),
      'phone', trim(p_phone),
      'role', 'MEMBER',
      'login_id', v_customer_code,
      'gender', v_normalized_gender
    ),
    'authenticated',
    'authenticated',
    NOW(),
    NOW()
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
    jsonb_build_object('sub', v_member_user_id, 'email', v_member_email),
    'email',
    v_member_user_id::text,
    NOW(),
    NOW(),
    NOW()
  );

  -- Create public.users entry
  INSERT INTO public.users (
    id,
    email,
    password_hash,
    role,
    is_active,
    login_id
  ) VALUES (
    v_member_user_id,
    v_member_email,
    'SUPABASE_AUTH_MANAGED',
    'MEMBER',
    TRUE,
    v_customer_code
  );

  -- Student verification status: When reception registers a student, status is immediately VERIFIED
  IF p_category = 'STUDENT' THEN
    v_student_verification_status := 'VERIFIED';
  ELSE
    v_student_verification_status := 'NOT_REQUIRED';
  END IF;

  -- Insert customer linked to v_member_user_id
  INSERT INTO public.customers (
    user_id,
    customer_code,
    first_name,
    last_name,
    phone,
    gender,
    join_date,
    status,
    customer_type,
    student_id,
    institution,
    student_verification_status,
    student_verified_at,
    assigned_trainer_id,
    created_at,
    updated_at
  ) VALUES (
    v_member_user_id,
    v_customer_code,
    v_first_name,
    v_last_name,
    trim(p_phone),
    v_normalized_gender,
    CURRENT_DATE,
    'ACTIVE',
    coalesce(p_category, 'REGULAR'),
    CASE WHEN p_category = 'STUDENT' THEN nullif(trim(p_student_id), '') END,
    CASE WHEN p_category = 'STUDENT' THEN nullif(trim(p_institution), '') END,
    v_student_verification_status,
    CASE WHEN p_category = 'STUDENT' THEN now() ELSE NULL END,
    CASE WHEN p_needs_trainer THEN p_trainer_id ELSE NULL END,
    now(),
    now()
  ) RETURNING id INTO v_customer_id;

  -- Insert membership if plan exists
  IF v_plan.id IS NOT NULL THEN
    INSERT INTO public.memberships (
      customer_id,
      plan_id,
      start_date,
      end_date,
      status,
      price_at_purchase,
      auto_renew,
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
      FALSE,
      auth.uid(),
      now(),
      now()
    ) RETURNING id INTO v_membership_id;
  END IF;

  -- Insert authoritative payment record
  SELECT id INTO v_user_record_id FROM public.users WHERE id = auth.uid();

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

  -- If Personal Trainer requested, record active assignment
  IF p_needs_trainer AND p_trainer_id IS NOT NULL THEN
    INSERT INTO public.trainer_assignments (
      trainer_id,
      customer_id,
      membership_id,
      assigned_by,
      notes,
      is_active,
      assigned_at,
      created_at,
      updated_at
    ) VALUES (
      p_trainer_id,
      v_customer_id,
      v_membership_id,
      v_user_record_id,
      'Assigned during customer registration by Reception. Monthly trainer fee: ' || v_trainer_fee || ' ETB.',
      TRUE,
      now(),
      now(),
      now()
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

-- Provide 12-argument backward compatibility overload
CREATE OR REPLACE FUNCTION public.register_member_by_reception(
  p_name TEXT,
  p_phone TEXT,
  p_category TEXT,
  p_plan_id UUID DEFAULT NULL,
  p_plan_name TEXT DEFAULT NULL,
  p_proof_path TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'CASH',
  p_student_id TEXT DEFAULT NULL,
  p_institution TEXT DEFAULT NULL,
  p_needs_trainer BOOLEAN DEFAULT FALSE,
  p_trainer_id UUID DEFAULT NULL,
  p_temp_password TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT public.register_member_by_reception(
    p_name,
    p_phone,
    p_category,
    p_plan_id,
    p_plan_name,
    p_proof_path,
    p_payment_method,
    p_student_id,
    p_institution,
    p_needs_trainer,
    p_trainer_id,
    p_temp_password,
    NULL::TEXT
  );
$$;

GRANT EXECUTE ON FUNCTION public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Data Fix: Ensure existing students are marked as VERIFIED
-- ----------------------------------------------------------------------------
UPDATE public.customers
SET student_verification_status = 'VERIFIED',
    student_verified_at = coalesce(student_verified_at, now()),
    updated_at = now()
WHERE customer_type = 'STUDENT'
  AND student_verification_status <> 'VERIFIED';
