-- ============================================================================
-- Migration: 20261104120600_update_admin_email_to_henth2030.sql
-- Description: Updates existing Admin/Owner account (b4fe64fe-d0c3-4746-a2b2-7bea47baecbb)
--              from poweplus100@gmail.com to henth2030@gmail.com while:
--              1. Preserving exact Supabase Auth UUID (b4fe64fe-d0c3-4746-a2b2-7bea47baecbb)
--              2. Preserving password hash and credentials
--              3. Preserving OWNER role and permissions
--              4. Updating auth.users, auth.identities, and public.users
--              5. Reassigning old test staff user holding henth2030@gmail.com to reception.staff@powerplus.et
-- ============================================================================

BEGIN;

-- 1. Free up henth2030@gmail.com on the previous test staff account
UPDATE auth.users
SET 
  email = 'reception.staff@powerplus.et',
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"email": "reception.staff@powerplus.et"}'::jsonb,
  updated_at = now()
WHERE id = '58122e97-7799-4e05-a8c1-a63e8573cc19';

UPDATE auth.identities
SET 
  identity_data = jsonb_set(COALESCE(identity_data, '{}'::jsonb), '{email}', '"reception.staff@powerplus.et"'),
  updated_at = now()
WHERE user_id = '58122e97-7799-4e05-a8c1-a63e8573cc19' AND provider = 'email';

UPDATE public.users
SET 
  email = 'reception.staff@powerplus.et',
  updated_at = now()
WHERE id = '58122e97-7799-4e05-a8c1-a63e8573cc19';

-- 2. Update existing Admin/Owner account to henth2030@gmail.com
UPDATE auth.users
SET 
  email = 'henth2030@gmail.com',
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"email": "henth2030@gmail.com"}'::jsonb,
  email_change = '',
  email_change_token_new = '',
  email_change_token_current = '',
  email_change_confirm_status = 0,
  updated_at = now()
WHERE id = 'b4fe64fe-d0c3-4746-a2b2-7bea47baecbb';

UPDATE auth.identities
SET 
  identity_data = jsonb_set(COALESCE(identity_data, '{}'::jsonb), '{email}', '"henth2030@gmail.com"'),
  updated_at = now()
WHERE user_id = 'b4fe64fe-d0c3-4746-a2b2-7bea47baecbb' AND provider = 'email';

UPDATE public.users
SET 
  email = 'henth2030@gmail.com',
  role = 'OWNER',
  is_active = TRUE,
  updated_at = now()
WHERE id = 'b4fe64fe-d0c3-4746-a2b2-7bea47baecbb';

NOTIFY pgrst, 'reload schema';

COMMIT;

