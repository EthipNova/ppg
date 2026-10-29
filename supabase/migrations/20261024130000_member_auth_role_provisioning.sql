-- Keep Supabase Auth customer signups compatible with the legacy role table.
-- The placeholder password value is never used for authentication; Supabase
-- Auth remains the only credential provider for these accounts.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_member_role_from_auth_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
BEGIN
  IF COALESCE(NEW.raw_user_meta_data ->> 'registration_flow', '') IN ('student', 'customer') THEN
    INSERT INTO public.users (id, email, password_hash, role, is_active)
    VALUES (NEW.id, lower(NEW.email), 'SUPABASE_AUTH_MANAGED', 'MEMBER', TRUE)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_member_role_from_auth_signup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS create_member_role_before_auth_signup ON auth.users;
CREATE TRIGGER create_member_role_before_auth_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_member_role_from_auth_signup();

COMMIT;
