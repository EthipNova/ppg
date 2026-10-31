-- ============================================================================
-- Migration: 20261030190000_provision_new_admin_user.sql
-- Description: Connects Supabase Auth admin user poweplus100@gmail.com to public.users
--              using the canonical system admin role 'OWNER'.
-- ============================================================================

INSERT INTO public.users (
  id,
  email,
  password_hash,
  role,
  is_active,
  created_at,
  updated_at
) VALUES (
  'b4fe64fe-d0c3-4746-a2b2-7bea47baecbb',
  'poweplus100@gmail.com',
  'SUPABASE_AUTH_MANAGED',
  'OWNER',
  TRUE,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = 'OWNER',
  is_active = TRUE,
  updated_at = now();
