-- Distinguish unauthenticated, non-trainer, inactive, and missing-profile failures.
-- auth.uid() is resolved through the project's existing public.users.id relationship.
CREATE OR REPLACE FUNCTION public.trainer_portal_profile_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_user_role TEXT;
  v_user_active BOOLEAN;
  v_profile_id UUID;
  v_profile_active BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_UNAUTHENTICATED';
  END IF;

  SELECT u.role::TEXT, u.is_active
    INTO v_user_role, v_user_active
    FROM public.users u
    WHERE u.id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_USER_MAPPING_MISSING';
  END IF;
  IF v_user_role IS DISTINCT FROM 'TRAINER' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_ROLE_REQUIRED';
  END IF;
  IF v_user_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_ACCOUNT_INACTIVE';
  END IF;

  SELECT tp.id, tp.is_active
    INTO v_profile_id, v_profile_active
    FROM public.trainer_profiles tp
    WHERE tp.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_PROFILE_MISSING';
  END IF;
  IF v_profile_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_ACCOUNT_INACTIVE';
  END IF;

  RETURN v_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_portal_profile_id() FROM PUBLIC, anon;
NOTIFY pgrst, 'reload schema';
