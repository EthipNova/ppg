-- ============================================================================
-- Migration: 20261031140000_staff_registration_and_steam_config.sql
-- Description:
-- 1. Adds login_id column and staff_login_id_seq to public.users.
-- 2. Creates admin_register_staff_member RPC for creating Receptionist/Trainer accounts.
-- 3. Creates get_staff_members_list RPC for viewing registered staff.
-- 4. Creates resolve_login_identifier RPC for Login ID to email lookup.
-- 5. Consolidates single active Steam service, enforces one-active constraint via partial unique index.
-- 6. Creates get_active_steam_service, save_steam_service_config, delete_steam_service_config RPCs.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Schema Extensions on public.users
-- ----------------------------------------------------------------------------

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_id VARCHAR(50) UNIQUE;

CREATE SEQUENCE IF NOT EXISTS public.staff_login_id_seq START WITH 101;

-- Backfill existing staff users with clean login IDs if null
UPDATE public.users
SET login_id = 'REC-100'
WHERE email = 'reception@powerplus.et' AND (login_id IS NULL OR login_id = '');

UPDATE public.users
SET login_id = 'TRN-100'
WHERE email = 'bethlehem@powerplus.et' AND (login_id IS NULL OR login_id = '');

-- ----------------------------------------------------------------------------
-- 2. Staff Registration Function (Admin Only)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_register_staff_member(
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT,
  p_temp_password TEXT
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
  v_first_name TEXT;
  v_last_name TEXT;
  v_user_role TEXT;
  v_login_id TEXT;
  v_email TEXT;
  v_user_id UUID;
BEGIN
  -- 1. Authorization: Only Admins can register staff
  v_caller_is_admin := public.powerplus_is_staff(TRUE);
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Only authorized Admin users can register staff members.';
  END IF;

  -- 2. Validate Role
  IF v_role_clean = 'Receptionist' THEN
    v_user_role := 'STAFF';
  ELSIF v_role_clean = 'Trainer' THEN
    v_user_role := 'TRAINER';
  ELSE
    RAISE EXCEPTION 'Invalid role. Must be either "Receptionist" or "Trainer".';
  END IF;

  -- 3. Validate Inputs
  IF length(v_name_clean) < 2 THEN
    RAISE EXCEPTION 'Full name must be at least 2 characters long.';
  END IF;

  IF length(v_phone_clean) < 5 THEN
    RAISE EXCEPTION 'Please provide a valid phone number.';
  END IF;

  IF length(COALESCE(p_temp_password, '')) < 6 THEN
    RAISE EXCEPTION 'Temporary password must be at least 6 characters long.';
  END IF;

  -- 4. Check for duplicate phone number
  IF EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone_clean, '\D', '', 'g')
  ) OR EXISTS (
    SELECT 1 FROM public.trainer_profiles
    WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone_clean, '\D', '', 'g')
  ) THEN
    RAISE EXCEPTION 'A staff member with phone number % already exists.', v_phone_clean;
  END IF;

  -- 5. Generate Unique Login ID
  IF v_user_role = 'STAFF' THEN
    v_login_id := 'REC-' || nextval('public.staff_login_id_seq')::TEXT;
  ELSE
    v_login_id := 'TRN-' || nextval('public.staff_login_id_seq')::TEXT;
  END IF;

  -- Ensure collision safety
  WHILE EXISTS (SELECT 1 FROM public.users WHERE login_id = v_login_id) LOOP
    IF v_user_role = 'STAFF' THEN
      v_login_id := 'REC-' || nextval('public.staff_login_id_seq')::TEXT;
    ELSE
      v_login_id := 'TRN-' || nextval('public.staff_login_id_seq')::TEXT;
    END IF;
  END LOOP;

  v_email := lower(v_login_id) || '@powerplus.et';
  v_user_id := gen_random_uuid();

  -- 6. Insert into auth.users with encrypted password
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
    v_email,
    extensions.crypt(p_temp_password, extensions.gen_salt('bf')),
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
      'full_name', v_name_clean,
      'phone', v_phone_clean,
      'role', v_user_role,
      'login_id', v_login_id
    ),
    'authenticated',
    'authenticated',
    NOW(),
    NOW()
  );

  -- 7. Insert into auth.identities
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
    jsonb_build_object('sub', v_user_id, 'email', v_email),
    'email',
    v_user_id::text,
    NOW(),
    NOW(),
    NOW()
  );

  -- 8. Insert into public.users
  INSERT INTO public.users (
    id,
    email,
    password_hash,
    role,
    is_active,
    login_id
  ) VALUES (
    v_user_id,
    v_email,
    'SUPABASE_AUTH_MANAGED',
    v_user_role,
    TRUE,
    v_login_id
  );

  -- 9. Insert into corresponding profile table
  v_first_name := split_part(v_name_clean, ' ', 1);
  v_last_name := trim(substring(v_name_clean from length(v_first_name) + 1));
  IF v_last_name = '' THEN
    v_last_name := v_first_name;
  END IF;

  IF v_user_role = 'STAFF' THEN
    INSERT INTO public.staff_profiles (
      id,
      user_id,
      first_name,
      last_name,
      phone,
      job_title,
      is_active
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      v_first_name,
      v_last_name,
      v_phone_clean,
      'Receptionist',
      TRUE
    );
  ELSE
    INSERT INTO public.trainer_profiles (
      id,
      user_id,
      first_name,
      last_name,
      phone,
      specialization,
      is_active
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      v_first_name,
      v_last_name,
      v_phone_clean,
      'Fitness Trainer',
      TRUE
    );
  END IF;

  -- 10. Return credentials payload
  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_user_id,
    'full_name', v_name_clean,
    'phone', v_phone_clean,
    'role', v_role_clean,
    'login_id', v_login_id,
    'temp_password', p_temp_password,
    'email', v_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_register_staff_member(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Staff List Retrieval Function (Admin Only)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_staff_members_list()
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  login_id TEXT,
  phone TEXT,
  role TEXT,
  is_active BOOLEAN,
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
    COALESCE(
      NULLIF(trim(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''),
      NULLIF(trim(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')), ''),
      u.email
    )::TEXT AS full_name,
    COALESCE(u.login_id, u.email)::TEXT AS login_id,
    COALESCE(sp.phone, tp.phone, '')::TEXT AS phone,
    CASE
      WHEN u.role = 'STAFF' THEN 'Receptionist'
      WHEN u.role = 'TRAINER' THEN 'Trainer'
      ELSE u.role
    END::TEXT AS role,
    u.is_active,
    u.created_at
  FROM public.users u
  LEFT JOIN public.staff_profiles sp ON sp.user_id = u.id
  LEFT JOIN public.trainer_profiles tp ON tp.user_id = u.id
  WHERE u.role IN ('STAFF', 'TRAINER')
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_members_list() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Login Identifier Resolution Function (Public / Login Flow)
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
  SELECT u.email::TEXT, u.role::TEXT, u.login_id::TEXT
  FROM public.users u
  LEFT JOIN public.staff_profiles sp ON sp.user_id = u.id
  LEFT JOIN public.trainer_profiles tp ON tp.user_id = u.id
  WHERE u.is_active = TRUE
    AND (
      upper(u.login_id) = upper(v_clean)
      OR lower(u.email) = lower(v_clean)
      OR (
        length(v_clean) >= 7
        AND (
          regexp_replace(COALESCE(sp.phone, ''), '\D', '', 'g') = regexp_replace(v_clean, '\D', '', 'g')
          OR regexp_replace(COALESCE(tp.phone, ''), '\D', '', 'g') = regexp_replace(v_clean, '\D', '', 'g')
        )
      )
    )
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Steam Service: Consolidate to Single Service & Enforce Constraint
-- ----------------------------------------------------------------------------

-- Deactivate legacy duplicate demo packages
UPDATE public.services
SET is_active = FALSE
WHERE (name ILIKE '%steam%' OR name ILIKE '%sauna%')
  AND id != 'ab6befc2-7477-4c85-8bfd-5df6d6e46e73';

-- Ensure the primary steam service exists and has the standard title
INSERT INTO public.services (id, name, description, price, is_active)
VALUES (
  'ab6befc2-7477-4c85-8bfd-5df6d6e46e73',
  'Steam / Sauna Service',
  'Official PowerPlus Gym Steam & Sauna Session Pass',
  150.00,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  name = 'Steam / Sauna Service',
  description = 'Official PowerPlus Gym Steam & Sauna Session Pass',
  is_active = TRUE;

-- Enforce ONLY ONE active steam service across the database
DROP INDEX IF EXISTS one_active_steam_service_idx;
CREATE UNIQUE INDEX one_active_steam_service_idx
ON public.services ((is_active))
WHERE (is_active = TRUE AND (name ILIKE '%steam%' OR name ILIKE '%sauna%'));

-- ----------------------------------------------------------------------------
-- 6. Steam Configuration Functions
-- ----------------------------------------------------------------------------

-- Retrieve the active Steam service
CREATE OR REPLACE FUNCTION public.get_active_steam_service()
RETURNS TABLE(
  id UUID,
  name VARCHAR,
  description TEXT,
  price NUMERIC,
  is_active BOOLEAN,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, name, description, price, is_active, updated_at
  FROM public.services
  WHERE is_active = TRUE AND (name ILIKE '%steam%' OR name ILIKE '%sauna%')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_steam_service() TO anon, authenticated;

-- Save or update the single Steam service price (Admin only)
CREATE OR REPLACE FUNCTION public.save_steam_service_config(p_price NUMERIC)
RETURNS TABLE(
  id UUID,
  name VARCHAR,
  price NUMERIC,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  IF NOT public.powerplus_is_staff(TRUE) THEN
    RAISE EXCEPTION 'Unauthorized: Only authorized Admin users can configure Steam pricing.';
  END IF;

  IF p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'Steam service price must be a valid positive number greater than 0.';
  END IF;

  -- Target canonical Steam / Sauna Service
  SELECT s.id INTO v_existing_id
  FROM public.services s
  WHERE s.id = 'ab6befc2-7477-4c85-8bfd-5df6d6e46e73' OR s.name = 'Steam / Sauna Service'
  ORDER BY (s.id = 'ab6befc2-7477-4c85-8bfd-5df6d6e46e73') DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.services
    SET
      name = 'Steam / Sauna Service',
      price = p_price,
      is_active = TRUE,
      updated_at = NOW()
    WHERE public.services.id = v_existing_id;
  ELSE
    v_existing_id := 'ab6befc2-7477-4c85-8bfd-5df6d6e46e73';
    INSERT INTO public.services (id, name, description, price, is_active, updated_at)
    VALUES (v_existing_id, 'Steam / Sauna Service', 'Official PowerPlus Gym Steam & Sauna Session Pass', p_price, TRUE, NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = 'Steam / Sauna Service',
      price = p_price,
      is_active = TRUE,
      updated_at = NOW();
  END IF;

  RETURN QUERY
  SELECT s.id, s.name, s.price, s.is_active
  FROM public.services s
  WHERE s.id = v_existing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_steam_service_config(NUMERIC) TO authenticated;

-- Delete (deactivate) the Steam service configuration (Admin only)
CREATE OR REPLACE FUNCTION public.delete_steam_service_config()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.powerplus_is_staff(TRUE) THEN
    RAISE EXCEPTION 'Unauthorized: Only authorized Admin users can delete the Steam configuration.';
  END IF;

  -- Deactivate all steam services (never deletes transaction or payment history)
  UPDATE public.services
  SET
    is_active = FALSE,
    updated_at = NOW()
  WHERE (name ILIKE '%steam%' OR name ILIKE '%sauna%');

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_steam_service_config() TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
