-- Read-only audit for Student and Trainer dashboard data/API exposure.
-- Run after `npx supabase link --project-ref <project-ref>` with:
--   npx supabase db query --linked --file supabase/audits/dashboard_access_audit.sql

-- 1. Confirm row-level security state for dashboard tables.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('customers', 'payments', 'attendance', 'memberships', 'plans', 'session_attendance',
                    'locker_assignments', 'class_bookings', 'class_schedules', 'classes')
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- 2. Show direct table grants; PUBLIC grants are important because anon can inherit them.
SELECT table_schema,
       table_name,
       grantee,
       privilege_type,
       is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('customers', 'payments', 'attendance', 'memberships', 'plans', 'session_attendance',
                     'locker_assignments', 'class_bookings', 'class_schedules', 'classes')
  AND grantee IN ('anon', 'authenticated', 'service_role', 'postgres', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

-- 3. Inspect all policies, including permissive policies that may combine with intended ones.
SELECT schemaname,
       tablename,
       policyname,
       permissive,
       roles,
       cmd,
       qual,
       with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('customers', 'payments', 'attendance', 'memberships', 'plans', 'session_attendance',
                    'locker_assignments', 'class_bookings', 'class_schedules', 'classes')
ORDER BY tablename, policyname;

-- 4. Show public views/materialized views that depend on dashboard tables.
SELECT DISTINCT view_ns.nspname AS view_schema,
       view_class.relname AS view_name,
       view_class.relkind AS view_kind,
       pg_get_viewdef(view_class.oid, TRUE) AS definition
FROM pg_class view_class
JOIN pg_namespace view_ns ON view_ns.oid = view_class.relnamespace
JOIN pg_rewrite rewrite ON rewrite.ev_class = view_class.oid
JOIN pg_depend dependency ON dependency.objid = rewrite.oid
JOIN pg_class source_class ON source_class.oid = dependency.refobjid
JOIN pg_namespace source_ns ON source_ns.oid = source_class.relnamespace
WHERE view_ns.nspname = 'public'
  AND view_class.relkind IN ('v', 'm')
  AND source_ns.nspname = 'public'
  AND source_class.relname IN ('customers', 'payments', 'attendance', 'memberships', 'plans', 'session_attendance',
                               'locker_assignments', 'class_bookings', 'class_schedules', 'classes')
ORDER BY view_name;

-- 5. Confirm expected RPC signatures and whether anon/authenticated can execute them.
SELECT p.oid::regprocedure AS function_signature,
       pg_get_function_result(p.oid) AS result_type,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       p.proacl AS explicit_acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('student_portal_class_schedule', 'trainer_portal_dashboard',
                    'trainer_portal_profile_id', 'trainer_portal_roster',
                    'trainer_update_own_profile', 'trainer_cancel_own_schedule',
                    'trainer_record_class_attendance', 'powerplus_is_staff', 'is_staff_or_owner')
ORDER BY p.proname, p.oid::regprocedure::text;

-- 6. Confirm the Student plan column/constraints and relevant foreign keys exist.
SELECT table_name,
       column_name,
       data_type,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'plans' AND column_name IN ('applicable_categories', 'is_active'))
    OR (table_name = 'customers' AND column_name IN ('user_id', 'customer_type', 'requested_plan_id'))
    OR (table_name = 'class_bookings' AND column_name IN ('customer_id', 'class_schedule_id', 'status'))
    OR (table_name = 'class_schedules' AND column_name IN ('class_id', 'trainer_id', 'start_at', 'end_at', 'status')))
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS table_name,
       conname AS constraint_name,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid = ANY (ARRAY[
    to_regclass('public.plans'),
    to_regclass('public.customers'),
    to_regclass('public.class_bookings'),
    to_regclass('public.class_schedules')
  ])
ORDER BY table_name, constraint_name;
