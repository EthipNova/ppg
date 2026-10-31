-- ============================================================================
-- Migration: 20261031170000_customer_credentials_and_steam_fixes.sql
-- Description:
-- 1. Updates resolve_login_identifier to resolve customer Login ID (customer_code),
--    phone, and email for member login.
-- 2. Updates register_member_by_reception to provision Supabase auth and public.users
--    member account with secure temporary password, returning credentials to Reception once.
-- 3. Creates admin_reset_customer_credentials RPC for Admin to securely reset member credentials,
--    updating auth.users password hash without storing plaintext passwords in any table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Function: resolve_login_identifier (Updated for Members)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier TEXT)
RETURNS TABLE(email TEXT, role TEXT, login_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_clean TEXT := trim(p_identifier);
BEGIN
  RETURN QUERY
  SELECT u.email::TEXT, u.role::TEXT, COALESCE(u.login_id, c.customer_code)::TEXT
  FROM public.users u
  LEFT JOIN public.staff_profiles sp ON sp.user_id = u.id
  LEFT JOIN public.trainer_profiles tp ON tp.user_id = u.id
  LEFT JOIN public.customers c ON c.user_id = u.id
  WHERE u.is_active = TRUE
    AND (
      upper(COALESCE(u.login_id, '')) = upper(v_clean)
      OR upper(COALESCE(c.customer_code, '')) = upper(v_clean)
      OR lower(u.email) = lower(v_clean)
      OR (c.email IS NOT NULL AND lower(c.email) = lower(v_clean))
      OR (
        length(v_clean) >= 7
        AND (
          regexp_replace(COALESCE(sp.phone, ''), '\D', '', 'g') = regexp_replace(v_clean, '\D', '', 'g')
          OR regexp_replace(COALESCE(tp.phone, ''), '\D', '', 'g') = regexp_replace(v_clean, '\D', '', 'g')
          OR regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') = regexp_replace(v_clean, '\D', '', 'g')
        )
      )
    )
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Function: admin_reset_customer_credentials (Admin Only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reset_customer_credentials(
  p_customer_id UUID,
  p_new_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_user_id UUID;
  v_login_id TEXT;
  v_auth_email TEXT;
  v_temp_password TEXT;
  v_hash TEXT;
  v_full_name TEXT;
BEGIN
  -- 1. Authorization: Admin/Owner only
  IF NOT public.powerplus_is_staff(TRUE) THEN
    RAISE EXCEPTION 'Admin authorization required to reset customer credentials';
  END IF;

  -- 2. Lookup customer
  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  v_full_name := trim(COALESCE(v_customer.first_name, '') || ' ' || COALESCE(v_customer.last_name, ''));
  v_login_id := v_customer.customer_code;

  -- 3. Generate or validate temporary password
  IF p_new_password IS NOT NULL AND length(trim(p_new_password)) >= 6 THEN
    v_temp_password := trim(p_new_password);
  ELSE
    v_temp_password := 'PP-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4)) || '-' || (floor(random() * 8999) + 1000)::text;
  END IF;

  v_hash := extensions.crypt(v_temp_password, extensions.gen_salt('bf'));

  -- 4. Check if customer already has a linked user account
  IF v_customer.user_id IS NOT NULL THEN
    v_user_id := v_customer.user_id;

    -- Update auth.users password hash, re-activate, ensure string tokens, and confirm email
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
        reauthentication_token = COALESCE(reauthentication_token, ''),
        raw_user_meta_data = jsonb_build_object(
          'full_name', v_full_name,
          'phone', v_customer.phone,
          'role', 'MEMBER',
          'login_id', v_login_id
        )
    WHERE id = v_user_id;

    -- Update public.users
    UPDATE public.users
    SET is_active = TRUE,
        login_id = COALESCE(login_id, v_login_id),
        updated_at = NOW()
    WHERE id = v_user_id;
  ELSE
    -- Customer lacks an auth user: provision a new GoTrue account
    v_auth_email := lower(replace(v_login_id, '-', '')) || '@powerplus.et';
    IF v_customer.email IS NOT NULL AND trim(v_customer.email) <> '' THEN
      IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(v_customer.email))) THEN
        v_auth_email := lower(trim(v_customer.email));
      END IF;
    END IF;

    v_user_id := gen_random_uuid();

    -- Insert into auth.users
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
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_auth_email,
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
        'full_name', v_full_name,
        'phone', v_customer.phone,
        'role', 'MEMBER',
        'login_id', v_login_id
      ),
      'authenticated',
      'authenticated',
      NOW(),
      NOW()
    );

    -- Insert into auth.identities
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
      v_user_id,
      jsonb_build_object('sub', v_user_id, 'email', v_auth_email),
      'email',
      v_user_id::text,
      NOW(),
      NOW(),
      NOW()
    );

    -- Insert into public.users
    INSERT INTO public.users (
      id,
      email,
      password_hash,
      role,
      is_active,
      login_id
    ) VALUES (
      v_user_id,
      v_auth_email,
      'SUPABASE_AUTH_MANAGED',
      'MEMBER',
      TRUE,
      v_login_id
    );

    -- Link customer to new user
    UPDATE public.customers
    SET user_id = v_user_id,
        updated_at = NOW()
    WHERE id = v_customer.id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'customer_id', v_customer.id,
    'customer_name', v_full_name,
    'customer_code', v_customer.customer_code,
    'login_id', v_login_id,
    'new_temp_password', v_temp_password
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_customer_credentials(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Function: register_member_by_reception (Updated with Credentials)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID);
DROP FUNCTION IF EXISTS public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT);

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
      'login_id', v_customer_code
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

  -- Insert customer linked to v_member_user_id
  INSERT INTO public.customers (
    user_id,
    customer_code,
    first_name,
    last_name,
    phone,
    join_date,
    status,
    customer_type,
    student_id,
    institution,
    student_verification_status,
    assigned_trainer_id,
    created_at,
    updated_at
  ) VALUES (
    v_member_user_id,
    v_customer_code,
    v_first_name,
    v_last_name,
    trim(p_phone),
    CURRENT_DATE,
    'ACTIVE',
    coalesce(p_category, 'REGULAR'),
    CASE WHEN p_category = 'STUDENT' THEN nullif(trim(p_student_id), '') END,
    CASE WHEN p_category = 'STUDENT' THEN nullif(trim(p_institution), '') END,
    'NOT_REQUIRED',
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

  -- Record initial trainer assignment if chosen
  IF p_needs_trainer THEN
    INSERT INTO public.trainer_assignments (
      customer_id,
      trainer_id,
      assigned_by,
      status,
      monthly_fee_at_assignment,
      start_date,
      notes
    ) VALUES (
      v_customer_id,
      p_trainer_id,
      auth.uid(),
      'ACTIVE',
      v_trainer_fee,
      CURRENT_DATE,
      'Initial personal trainer assignment at registration.'
    ) RETURNING id INTO v_assignment_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'customer_id', v_customer_id,
    'customer_code', v_customer_code,
    'login_id', v_customer_code,
    'temp_password', v_temp_password,
    'user_id', v_member_user_id,
    'membership_id', v_membership_id,
    'payment_id', v_payment_id,
    'assignment_id', v_assignment_id,
    'trainer_assigned', p_needs_trainer,
    'trainer_id', p_trainer_id,
    'trainer_fee', v_trainer_fee,
    'total_amount', v_total_amount,
    'expiry_date', (CURRENT_DATE + v_duration_days)::TEXT
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT) TO authenticated, service_role;
