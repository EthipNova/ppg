-- ============================================================================
-- Migration: 20261031190000_staff_crud_and_trainer_assignment_fix.sql
-- Description:
-- 1. Fix trainer_assignments relationship & column structure
--    - Add membership_id foreign key to trainer_assignments
--    - Update register_member_by_reception to insert valid schema columns
-- 2. Staff Management CRUD (Admin Portal)
--    - admin_update_staff_member RPC (Edit Staff)
--    - admin_delete_staff_member RPC (Safe Deactivate / Delete with history preservation)
--    - get_staff_members_list RPC (enriched with email, first_name, last_name, specialization)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. trainer_assignments: Add membership_id column and index
-- ----------------------------------------------------------------------------
ALTER TABLE public.trainer_assignments
  ADD COLUMN IF NOT EXISTS membership_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trainer_assignments_membership
  ON public.trainer_assignments(membership_id);

-- ----------------------------------------------------------------------------
-- 2. Fix register_member_by_reception RPC
-- ----------------------------------------------------------------------------
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

  IF v_plan.id IS NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE is_active = TRUE ORDER BY price ASC LIMIT 1;
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

  -- Create auth.users account
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

  -- If Personal Trainer requested, record active assignment with valid table schema
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

-- ----------------------------------------------------------------------------
-- 3. Staff Management: admin_update_staff_member RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_staff_member(
  p_user_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT,
  p_is_active BOOLEAN,
  p_specialization TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_is_admin BOOLEAN;
  v_role_clean TEXT := trim(p_role);
  v_name_clean TEXT := trim(p_full_name);
  v_phone_clean TEXT := trim(p_phone);
  v_target_user RECORD;
  v_first_name TEXT;
  v_last_name TEXT;
  v_new_role TEXT;
  v_clean_phone_digits TEXT;
BEGIN
  -- 1. Authorization: Only Admins can update staff
  v_caller_is_admin := public.powerplus_is_staff(TRUE);
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Only authorized Admin users can update staff members.';
  END IF;

  -- 2. Find target user
  SELECT * INTO v_target_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff member not found.';
  END IF;

  -- Prevent admin from deactivating themselves
  IF p_user_id = auth.uid() AND p_is_active = FALSE THEN
    RAISE EXCEPTION 'You cannot deactivate your own administrative account.';
  END IF;

  -- 3. Validate Role
  IF v_role_clean IN ('Receptionist', 'STAFF') THEN
    v_new_role := 'STAFF';
  ELSIF v_role_clean IN ('Trainer', 'TRAINER') THEN
    v_new_role := 'TRAINER';
  ELSE
    RAISE EXCEPTION 'Invalid role. Role must be Receptionist or Trainer.';
  END IF;

  -- 4. Validate Inputs
  IF length(v_name_clean) < 2 THEN
    RAISE EXCEPTION 'Full name must be at least 2 characters long.';
  END IF;

  v_clean_phone_digits := regexp_replace(v_phone_clean, '\D', '', 'g');
  IF length(v_clean_phone_digits) < 5 THEN
    RAISE EXCEPTION 'Please provide a valid phone number.';
  END IF;

  -- 5. Check duplicate phone against other staff members
  IF EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE user_id <> p_user_id
      AND regexp_replace(phone, '\D', '', 'g') = v_clean_phone_digits
  ) OR EXISTS (
    SELECT 1 FROM public.trainer_profiles
    WHERE user_id <> p_user_id
      AND regexp_replace(phone, '\D', '', 'g') = v_clean_phone_digits
  ) THEN
    RAISE EXCEPTION 'Another staff member with phone number % already exists.', v_phone_clean;
  END IF;

  v_first_name := split_part(v_name_clean, ' ', 1);
  v_last_name := trim(substring(v_name_clean from length(v_first_name) + 1));
  IF v_last_name = '' THEN
    v_last_name := v_first_name;
  END IF;

  -- 6. Update public.users
  UPDATE public.users
  SET
    role = v_new_role,
    is_active = p_is_active
  WHERE id = p_user_id;

  -- 7. Update or create staff_profiles / trainer_profiles
  IF v_new_role = 'STAFF' THEN
    IF EXISTS (SELECT 1 FROM public.staff_profiles WHERE user_id = p_user_id) THEN
      UPDATE public.staff_profiles
      SET
        first_name = v_first_name,
        last_name = v_last_name,
        phone = v_phone_clean,
        is_active = p_is_active,
        job_title = 'Receptionist'
      WHERE user_id = p_user_id;
    ELSE
      INSERT INTO public.staff_profiles (id, user_id, first_name, last_name, phone, job_title, is_active)
      VALUES (gen_random_uuid(), p_user_id, v_first_name, v_last_name, v_phone_clean, 'Receptionist', p_is_active);
    END IF;

    -- Deactivate any lingering trainer profile and synchronize info
    UPDATE public.trainer_profiles
    SET first_name = v_first_name, last_name = v_last_name, phone = v_phone_clean, is_active = FALSE
    WHERE user_id = p_user_id;

  ELSE -- TRAINER
    IF EXISTS (SELECT 1 FROM public.trainer_profiles WHERE user_id = p_user_id) THEN
      UPDATE public.trainer_profiles
      SET
        first_name = v_first_name,
        last_name = v_last_name,
        phone = v_phone_clean,
        is_active = p_is_active,
        specialization = COALESCE(NULLIF(trim(p_specialization), ''), specialization, 'Fitness Trainer')
      WHERE user_id = p_user_id;
    ELSE
      INSERT INTO public.trainer_profiles (id, user_id, first_name, last_name, phone, specialization, is_active)
      VALUES (gen_random_uuid(), p_user_id, v_first_name, v_last_name, v_phone_clean, COALESCE(NULLIF(trim(p_specialization), ''), 'Fitness Trainer'), p_is_active);
    END IF;

    -- Deactivate any lingering staff profile and synchronize info
    UPDATE public.staff_profiles
    SET first_name = v_first_name, last_name = v_last_name, phone = v_phone_clean, is_active = FALSE
    WHERE user_id = p_user_id;
  END IF;

  -- 8. Update auth.users metadata
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object(
    'full_name', v_name_clean,
    'phone', v_phone_clean,
    'role', v_new_role
  ),
  updated_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', p_user_id,
    'full_name', v_name_clean,
    'phone', v_phone_clean,
    'role', CASE WHEN v_new_role = 'STAFF' THEN 'Receptionist' ELSE 'Trainer' END,
    'is_active', p_is_active
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Staff Management: admin_delete_staff_member RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_staff_member(
  p_user_id UUID,
  p_force_permanent BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_is_admin BOOLEAN;
  v_target_user RECORD;
  v_has_payments BOOLEAN := FALSE;
  v_has_attendance BOOLEAN := FALSE;
  v_has_steam BOOLEAN := FALSE;
  v_has_trainer_assignments BOOLEAN := FALSE;
  v_has_classes BOOLEAN := FALSE;
  v_has_lockers BOOLEAN := FALSE;
  v_has_history BOOLEAN := FALSE;
  v_trainer_profile_id UUID;
  v_action_taken TEXT;
BEGIN
  -- 1. Authorization: Only Admins can delete staff
  v_caller_is_admin := public.powerplus_is_staff(TRUE);
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Only authorized Admin users can delete staff members.';
  END IF;

  -- 2. Find target user
  SELECT * INTO v_target_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff member not found.';
  END IF;

  -- Prevent admin from deleting themselves
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own administrative account.';
  END IF;

  -- Prevent deleting OWNER account
  IF v_target_user.role = 'OWNER' THEN
    RAISE EXCEPTION 'Owner accounts cannot be deleted.';
  END IF;

  -- Get trainer_profile id if exists
  SELECT id INTO v_trainer_profile_id FROM public.trainer_profiles WHERE user_id = p_user_id;

  -- Check foreign key history references
  SELECT EXISTS(SELECT 1 FROM public.payments WHERE recorded_by = p_user_id OR (v_trainer_profile_id IS NOT NULL AND trainer_id = v_trainer_profile_id)) INTO v_has_payments;
  SELECT EXISTS(SELECT 1 FROM public.attendance WHERE recorded_by = p_user_id) INTO v_has_attendance;
  SELECT EXISTS(SELECT 1 FROM public.steam_services WHERE registered_by = p_user_id OR verified_by = p_user_id OR authorized_by = p_user_id OR completed_by = p_user_id) INTO v_has_steam;
  SELECT EXISTS(SELECT 1 FROM public.locker_assignments WHERE assigned_by = p_user_id OR returned_by = p_user_id) INTO v_has_lockers;

  IF v_trainer_profile_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.trainer_assignments WHERE trainer_id = v_trainer_profile_id) INTO v_has_trainer_assignments;
    SELECT EXISTS(SELECT 1 FROM public.class_schedules WHERE trainer_id = v_trainer_profile_id) INTO v_has_classes;
  END IF;

  v_has_history := v_has_payments OR v_has_attendance OR v_has_steam OR v_has_lockers OR v_has_trainer_assignments OR v_has_classes;

  -- If has history or permanent deletion not requested, perform safe deactivation (soft delete)
  IF v_has_history OR NOT p_force_permanent THEN
    UPDATE public.users SET is_active = FALSE WHERE id = p_user_id;
    UPDATE public.staff_profiles SET is_active = FALSE WHERE user_id = p_user_id;
    IF v_trainer_profile_id IS NOT NULL THEN
      UPDATE public.trainer_profiles SET is_active = FALSE WHERE id = v_trainer_profile_id;
      -- Mark active assignments as ENDED so members are not stranded
      UPDATE public.trainer_assignments
      SET status = 'ENDED', end_date = CURRENT_DATE, notes = COALESCE(notes, '') || ' [Ended due to trainer deactivation]'
      WHERE trainer_id = v_trainer_profile_id AND status = 'ACTIVE';
    END IF;

    v_action_taken := 'DEACTIVATED';
  ELSE
    -- Safe permanent deletion because no historical records exist
    DELETE FROM public.trainer_profiles WHERE user_id = p_user_id;
    DELETE FROM public.staff_profiles WHERE user_id = p_user_id;
    DELETE FROM public.users WHERE id = p_user_id;
    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    v_action_taken := 'DELETED';
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', p_user_id,
    'action', v_action_taken,
    'has_historical_records', v_has_history,
    'message', CASE
      WHEN v_action_taken = 'DEACTIVATED' THEN
        'Staff member safely deactivated to preserve historical audit records (payments, assignments, and sessions).'
      ELSE
        'Staff member account permanently deleted.'
    END
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Enrich get_staff_members_list RPC
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_staff_members_list();

CREATE OR REPLACE FUNCTION public.get_staff_members_list()
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  login_id TEXT,
  phone TEXT,
  role TEXT,
  is_active BOOLEAN,
  specialization TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.powerplus_is_staff(TRUE) THEN
    RAISE EXCEPTION 'Unauthorized: Only authorized Admin users can view the staff management list.';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    CASE
      WHEN u.role = 'TRAINER' THEN
        COALESCE(
          NULLIF(trim(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')), ''),
          NULLIF(trim(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''),
          u.email
        )
      ELSE
        COALESCE(
          NULLIF(trim(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''),
          NULLIF(trim(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')), ''),
          u.email
        )
    END::TEXT AS full_name,
    CASE
      WHEN u.role = 'TRAINER' THEN COALESCE(tp.first_name, sp.first_name, split_part(u.email, '@', 1))
      ELSE COALESCE(sp.first_name, tp.first_name, split_part(u.email, '@', 1))
    END::TEXT AS first_name,
    CASE
      WHEN u.role = 'TRAINER' THEN COALESCE(tp.last_name, sp.last_name, '')
      ELSE COALESCE(sp.last_name, tp.last_name, '')
    END::TEXT AS last_name,
    u.email::TEXT AS email,
    COALESCE(u.login_id, u.email)::TEXT AS login_id,
    CASE
      WHEN u.role = 'TRAINER' THEN COALESCE(tp.phone, sp.phone, '')
      ELSE COALESCE(sp.phone, tp.phone, '')
    END::TEXT AS phone,
    CASE
      WHEN u.role = 'STAFF' THEN 'Receptionist'
      WHEN u.role = 'TRAINER' THEN 'Trainer'
      ELSE u.role
    END::TEXT AS role,
    u.is_active,
    tp.specialization::TEXT AS specialization,
    u.created_at
  FROM public.users u
  LEFT JOIN public.staff_profiles sp ON sp.user_id = u.id
  LEFT JOIN public.trainer_profiles tp ON tp.user_id = u.id
  WHERE u.role IN ('STAFF', 'TRAINER')
  ORDER BY u.created_at DESC;
END;
$$;
