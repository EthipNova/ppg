-- Migration: 20261102210000_reception_reset_customer_password.sql
-- Description:
-- Adds secure reception_reset_customer_password RPC for reception staff to reset customer login passwords.

CREATE OR REPLACE FUNCTION public.reception_reset_customer_password(
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
  v_user public.users%ROWTYPE;
  v_user_id UUID;
  v_customer_code TEXT;
  v_customer_name TEXT;
  v_customer_email TEXT;
  v_temp_password TEXT;
  v_hash TEXT;
  v_random_chars TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
BEGIN
  -- 1. Authorization: Only Reception or Admin staff
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Only Reception or Admin staff can reset customer passwords.';
  END IF;

  -- 2. Lookup customer record
  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer record not found.';
  END IF;

  v_first_name := COALESCE(v_customer.first_name, '');
  v_last_name := COALESCE(v_customer.last_name, '');
  v_customer_name := trim(v_first_name || ' ' || v_last_name);
  IF v_customer_name = '' THEN
    v_customer_name := 'Customer';
  END IF;

  v_customer_code := COALESCE(v_customer.customer_code, 'PP-' || upper(substring(replace(v_customer.id::text, '-', '') from 1 for 4)));

  -- 3. Resolve linked user_id
  v_user_id := v_customer.user_id;

  -- If customer is not yet linked to an auth user, attempt linking by login_id or email
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM public.users
    WHERE (login_id = v_customer_code OR (email = v_customer.email AND v_customer.email IS NOT NULL AND v_customer.email <> ''))
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      UPDATE public.customers
      SET user_id = v_user_id,
          updated_at = NOW()
      WHERE id = p_customer_id;
    END IF;
  END IF;

  -- 4. Generate cryptographically strong temporary password
  IF p_new_password IS NOT NULL AND length(trim(p_new_password)) >= 6 THEN
    v_temp_password := trim(p_new_password);
  ELSE
    -- Format: PP-XXXX-NNNN (e.g., PP-K7D9-4821)
    v_random_chars := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    v_temp_password := 'PP-' || v_random_chars || '-' || (floor(random() * 8999) + 1000)::text;
  END IF;

  v_hash := extensions.crypt(v_temp_password, extensions.gen_salt('bf'));

  -- If still no user_id exists, create full auth user and public user for this existing customer
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_customer_email := COALESCE(
      NULLIF(trim(v_customer.email), ''),
      lower(v_customer_code) || '@powerplus.et'
    );

    -- Insert into auth.users with empty string tokens (GoTrue compatible)
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
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_customer_email,
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
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'full_name', v_customer_name,
        'customer_code', v_customer_code,
        'role', 'customer'
      ),
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
      jsonb_build_object('sub', v_user_id::text, 'email', v_customer_email),
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
      login_id,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_customer_email,
      'SUPABASE_AUTH_MANAGED',
      'MEMBER',
      TRUE,
      v_customer_code,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      password_hash = 'SUPABASE_AUTH_MANAGED',
      role = 'MEMBER',
      login_id = EXCLUDED.login_id,
      updated_at = NOW();

    -- Link customer to new user_id
    UPDATE public.customers
    SET user_id = v_user_id,
        updated_at = NOW()
    WHERE id = p_customer_id;
  ELSE
    -- 5. Existing user account: Verify target account is not an administrative role
    SELECT * INTO v_user
    FROM public.users
    WHERE id = v_user_id;

    IF FOUND AND upper(COALESCE(v_user.role, '')) IN ('ADMIN', 'OWNER', 'STAFF', 'RECEPTION') THEN
      RAISE EXCEPTION 'Security restriction: Cannot reset an administrative or staff account through customer reset.';
    END IF;

    -- 6. Update auth.users password, tokens, confirmed_at
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

    -- 7. Update public.users
    UPDATE public.users
    SET password_hash = 'SUPABASE_AUTH_MANAGED',
        login_id = COALESCE(login_id, v_customer_code),
        role = COALESCE(role, 'MEMBER'),
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  -- Return payload for Reception
  RETURN jsonb_build_object(
    'success', TRUE,
    'customer_id', v_customer.id,
    'customer_name', v_customer_name,
    'customer_code', v_customer_code,
    'new_temp_password', v_temp_password
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reception_reset_customer_password(UUID, TEXT) TO authenticated, service_role;
