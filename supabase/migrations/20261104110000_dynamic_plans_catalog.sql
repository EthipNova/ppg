-- ============================================================================
-- PowerPlus Gym: Dynamic Plans Catalog & Custom Categories Compatibility
-- Migration: 20261104110000_dynamic_plans_catalog.sql
-- ============================================================================

BEGIN;

-- 1. Remove the restrictive check constraint that only allowed 4 hardcoded categories
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_applicable_categories_check;

-- 2. Ensure default UUID generation and column defaults
ALTER TABLE public.plans ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.plans ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE public.plans ALTER COLUMN applicable_categories SET DEFAULT '{}';

-- 3. Grants for anon and authenticated clients
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO anon, authenticated;

-- 4. Ensure RLS is enabled and configure policies
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_select_all" ON public.plans;
DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
DROP POLICY IF EXISTS "plans_staff_manage" ON public.plans;
DROP POLICY IF EXISTS "plans_insert_policy" ON public.plans;
DROP POLICY IF EXISTS "plans_update_policy" ON public.plans;
DROP POLICY IF EXISTS "plans_delete_policy" ON public.plans;

-- Allow public read access to all plans
CREATE POLICY "plans_select_all" ON public.plans
  FOR SELECT TO anon, authenticated
  USING (true);

-- Allow insert with basic validation
CREATE POLICY "plans_insert_policy" ON public.plans
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    name IS NOT NULL AND trim(name) <> '' AND
    price >= 0
  );

-- Allow update with basic validation
CREATE POLICY "plans_update_policy" ON public.plans
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (
    name IS NOT NULL AND trim(name) <> '' AND
    price >= 0
  );

-- Allow delete
CREATE POLICY "plans_delete_policy" ON public.plans
  FOR DELETE TO anon, authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';

COMMIT;

