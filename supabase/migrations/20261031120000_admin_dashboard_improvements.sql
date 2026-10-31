-- ============================================================================
-- PowerPlus Gym: Admin Dashboard Improvements
-- Migration: 20261031120000_admin_dashboard_improvements.sql
-- 1. Create public.customer_categories table with standard seeds and RLS
-- 2. Configure public.expenses RLS policies for Admin/Owner access
-- 3. Configure public.services RLS UPDATE policy for Admin price management
-- 4. Allow staff/admin to view user emails for audit and locker assignment display
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Customer Categories Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_categories_key ON public.customer_categories (key);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_customer_categories_updated_at ON public.customer_categories;
    CREATE TRIGGER trg_customer_categories_updated_at
      BEFORE UPDATE ON public.customer_categories
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.customer_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_categories_select" ON public.customer_categories;
CREATE POLICY "customer_categories_select" ON public.customer_categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "customer_categories_insert" ON public.customer_categories;
CREATE POLICY "customer_categories_insert" ON public.customer_categories
  FOR INSERT TO authenticated WITH CHECK (
    powerplus_is_staff(true) AND
    label IS NOT NULL AND trim(label) <> '' AND
    key IS NOT NULL AND trim(key) <> ''
  );

DROP POLICY IF EXISTS "customer_categories_update" ON public.customer_categories;
CREATE POLICY "customer_categories_update" ON public.customer_categories
  FOR UPDATE TO authenticated USING (powerplus_is_staff(true)) WITH CHECK (powerplus_is_staff(true));

DROP POLICY IF EXISTS "customer_categories_delete" ON public.customer_categories;
CREATE POLICY "customer_categories_delete" ON public.customer_categories
  FOR DELETE TO authenticated USING (powerplus_is_staff(true) AND is_system = false);

-- Seed default canonical categories
INSERT INTO public.customer_categories (key, label, description, is_system)
VALUES 
  ('REGULAR', 'Standard', 'Full gym access during opening hours.', true),
  ('STUDENT', 'Student', 'Reduced rate with a valid student ID. Off-peak access (before 4:00 PM) + weekends.', true),
  ('MUSLIM', 'Women''s Hours (Muslim)', 'Access reserved for the women''s hours from 9:00 AM to 4:00 PM, main hall privatized.', true),
  ('AEROBICS', 'Aerobics & Dance', 'Access during aerobics and dance class slots (5:00 PM – 9:00 PM).', true)
ON CONFLICT (key) DO UPDATE
SET 
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system;

-- ----------------------------------------------------------------------------
-- 2. Expenses RLS Policies & Defaults
-- ----------------------------------------------------------------------------
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ALTER COLUMN recorded_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "expenses_staff_admin_select" ON public.expenses;
DROP POLICY IF EXISTS "expenses_admin_select" ON public.expenses;
CREATE POLICY "expenses_admin_select" ON public.expenses
  FOR SELECT TO authenticated
  USING (powerplus_is_staff(true));

DROP POLICY IF EXISTS "expenses_staff_admin_insert" ON public.expenses;
DROP POLICY IF EXISTS "expenses_admin_insert" ON public.expenses;
CREATE POLICY "expenses_admin_insert" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    powerplus_is_staff(true)
    AND (recorded_by IS NULL OR recorded_by = auth.uid())
  );

DROP POLICY IF EXISTS "expenses_admin_update" ON public.expenses;
CREATE POLICY "expenses_admin_update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (powerplus_is_staff(true))
  WITH CHECK (powerplus_is_staff(true));

DROP POLICY IF EXISTS "expenses_admin_delete" ON public.expenses;
CREATE POLICY "expenses_admin_delete" ON public.expenses
  FOR DELETE TO authenticated
  USING (powerplus_is_staff(true));

-- ----------------------------------------------------------------------------
-- 3. Services RLS UPDATE Policy for Admin Price Management
-- ----------------------------------------------------------------------------
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_price_check;
ALTER TABLE public.services ADD CONSTRAINT services_price_check CHECK (price > 0);

DROP POLICY IF EXISTS "services_admin_update" ON public.services;
CREATE POLICY "services_admin_update" ON public.services
  FOR UPDATE TO authenticated
  USING (powerplus_is_staff(true))
  WITH CHECK (powerplus_is_staff(true) AND price > 0);

-- ----------------------------------------------------------------------------
-- 4. Staff Users Read Policy for Accountability / Activity Display
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_staff_read" ON public.users;
CREATE POLICY "users_staff_read" ON public.users
  FOR SELECT TO authenticated
  USING (powerplus_is_staff(false));
