-- Migration: 20261104120200_inspect_admin_and_auth.sql
-- Inspect all accounts for poweplus100@gmail.com and henth2030@gmail.com

CREATE OR REPLACE FUNCTION public.get_admin_account_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth JSONB;
  v_public JSONB;
  v_identities JSONB;
BEGIN
  SELECT jsonb_agg(to_jsonb(u)) INTO v_auth
  FROM (
    SELECT id, email, email_confirmed_at, email_change, created_at, updated_at
    FROM auth.users
    WHERE id IN ('b4fe64fe-d0c3-4746-a2b2-7bea47baecbb', '58122e97-7799-4e05-a8c1-a63e8573cc19')
       OR lower(email) IN ('poweplus100@gmail.com', 'henth2030@gmail.com')
  ) u;

  SELECT jsonb_agg(to_jsonb(pu)) INTO v_public
  FROM (
    SELECT id, email, role, is_active, created_at, updated_at
    FROM public.users
    WHERE id IN ('b4fe64fe-d0c3-4746-a2b2-7bea47baecbb', '58122e97-7799-4e05-a8c1-a63e8573cc19')
       OR lower(email) IN ('poweplus100@gmail.com', 'henth2030@gmail.com')
  ) pu;

  SELECT jsonb_agg(to_jsonb(i)) INTO v_identities
  FROM (
    SELECT id, user_id, provider, identity_data, created_at, updated_at
    FROM auth.identities
    WHERE user_id IN ('b4fe64fe-d0c3-4746-a2b2-7bea47baecbb', '58122e97-7799-4e05-a8c1-a63e8573cc19')
  ) i;

  RETURN jsonb_build_object(
    'auth_users', COALESCE(v_auth, '[]'::jsonb),
    'public_users', COALESCE(v_public, '[]'::jsonb),
    'identities', COALESCE(v_identities, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_account_status() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

