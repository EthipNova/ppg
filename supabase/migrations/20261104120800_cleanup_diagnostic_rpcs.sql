-- Migration: 20261104120800_cleanup_diagnostic_rpcs.sql
-- Remove temporary inspection RPC functions created during account verification

DROP FUNCTION IF EXISTS public.get_admin_account_status();
DROP FUNCTION IF EXISTS public.check_user_references();
DROP FUNCTION IF EXISTS public.list_all_system_users();
DROP FUNCTION IF EXISTS public.search_admin_email_references();

NOTIFY pgrst, 'reload schema';

