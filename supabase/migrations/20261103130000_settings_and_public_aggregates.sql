-- ============================================================================
-- PowerPlus Gym: Gym Information Settings & Public Aggregates
-- Migration: 20261103130000_settings_and_public_aggregates.sql
-- ============================================================================

-- 1. Ensure public.settings table exists and has all required fields
CREATE TABLE IF NOT EXISTS public.settings (
  id TEXT PRIMARY KEY DEFAULT 'gym',
  gym_name TEXT NOT NULL DEFAULT 'Power Plus Gym',
  tagline TEXT DEFAULT 'Train hard. Stay strong.',
  description TEXT DEFAULT 'A premium gym with world-class equipment, expert coaches, and an energetic athletic community.',
  email TEXT DEFAULT 'info@powerplus.et',
  phone TEXT DEFAULT '+251 911 234 567',
  address TEXT DEFAULT 'Bole Road, Addis Ababa, Ethiopia',
  operating_hours TEXT DEFAULT 'Monday to Saturday: 05:00 AM – 11:00 PM | Sunday: 06:00 AM – 09:00 PM',
  inactivity_threshold_days INTEGER NOT NULL DEFAULT 14,
  currency TEXT NOT NULL DEFAULT 'Br',
  steam_enabled BOOLEAN NOT NULL DEFAULT true,
  steam_model TEXT NOT NULL DEFAULT 'both',
  steam_package_price NUMERIC(10,2) NOT NULL DEFAULT 1500,
  steam_package_days INTEGER NOT NULL DEFAULT 30,
  steam_package_visits INTEGER NOT NULL DEFAULT 10,
  steam_per_visit_price NUMERIC(10,2) NOT NULL DEFAULT 300,
  steam_expiring_soon_days INTEGER NOT NULL DEFAULT 5,
  monthly_trainer_fee NUMERIC(10,2) DEFAULT 500,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add any missing columns to existing public.settings table idempotently
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT 'A premium gym with world-class equipment, expert coaches, and an energetic athletic community.';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS operating_hours TEXT DEFAULT 'Monday to Saturday: 05:00 AM – 11:00 PM | Sunday: 06:00 AM – 09:00 PM';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS monthly_trainer_fee NUMERIC(10,2) DEFAULT 500;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure default 'gym' settings record is present
INSERT INTO public.settings (id, gym_name, tagline, description, email, phone, address, operating_hours)
VALUES (
  'gym',
  'Power Plus Gym',
  'Train hard. Stay strong.',
  'A premium gym with world-class equipment, expert coaches, and an energetic athletic community.',
  'info@powerplus.et',
  '+251 911 234 567',
  'Bole Road, Addis Ababa, Ethiopia',
  'Monday to Saturday: 05:00 AM – 11:00 PM | Sunday: 06:00 AM – 09:00 PM'
)
ON CONFLICT (id) DO UPDATE
SET
  gym_name = COALESCE(NULLIF(public.settings.gym_name, ''), EXCLUDED.gym_name),
  description = COALESCE(public.settings.description, EXCLUDED.description),
  operating_hours = COALESCE(public.settings.operating_hours, EXCLUDED.operating_hours),
  updated_at = now();

-- Enable RLS on public.settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access to settings for website and portals
DROP POLICY IF EXISTS "settings_public_read" ON public.settings;
CREATE POLICY "settings_public_read" ON public.settings
  FOR SELECT TO anon, authenticated
  USING (true);

-- Allow authenticated users with admin/owner/staff role to update settings
DROP POLICY IF EXISTS "settings_staff_update" ON public.settings;
CREATE POLICY "settings_staff_update" ON public.settings
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "settings_staff_insert" ON public.settings;
CREATE POLICY "settings_staff_insert" ON public.settings
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. Public aggregate function for real active members count
-- Counts unique customers who have an active, non-expired membership
CREATE OR REPLACE FUNCTION public.get_public_active_members_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count distinct customers who have at least one active membership record that has not expired
  SELECT COUNT(DISTINCT m.customer_id)
  INTO v_count
  FROM public.memberships m
  JOIN public.customers c ON c.id = m.customer_id
  WHERE upper(coalesce(m.status, '')) = 'ACTIVE'
    AND m.end_date >= CURRENT_DATE
    AND upper(coalesce(c.status, '')) = 'ACTIVE';

  RETURN COALESCE(v_count, 0);
END;
$$;

-- Grant execution permissions on public aggregate function
REVOKE ALL ON FUNCTION public.get_public_active_members_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_active_members_count() TO anon, authenticated;

