-- Migration: 20261104120700_ensure_users_read_own_policy.sql
-- Ensure authenticated users can read their own user record for role resolution

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own" ON public.users;
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.powerplus_is_staff(false));

NOTIFY pgrst, 'reload schema';

