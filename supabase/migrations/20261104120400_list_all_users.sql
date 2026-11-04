-- Migration: 20261104120400_list_all_users.sql

CREATE OR REPLACE FUNCTION public.list_all_system_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_users JSONB;
BEGIN
  SELECT jsonb_agg(to_jsonb(row)) INTO v_users
  FROM (
    SELECT 
      u.id, 
      u.email, 
      u.role, 
      u.login_id,
      u.is_active,
      au.email as auth_email,
      au.email_confirmed_at
    FROM public.users u
    LEFT JOIN auth.users au ON au.id = u.id
    ORDER BY u.created_at ASC
  ) row;

  RETURN COALESCE(v_users, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_all_system_users() TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

