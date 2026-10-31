-- ============================================================================
-- Migration: 20261031160000_digital_personal_trainer_workflow.sql
-- Description:
-- Complete Digital Personal Trainer Workflow implementation:
-- 1. Adds monthly_trainer_fee to public.settings.
-- 2. Adds trainer_fee and trainer_id to public.payments.
-- 3. Adds assigned_trainer_id to public.customers.
-- 4. Creates public.trainer_assignments table with single-active partial unique index.
-- 5. Creates workout_plans, workout_exercises, meal_plans, meal_items, exercise_videos,
--    member_progress_records, and personal_training_sessions tables.
-- 6. Configures storage bucket trainer-videos for exercise demonstration videos.
-- 7. Implements Row Level Security (RLS) policies for trainers, members, and staff.
-- 8. Updates helper function is_authorized_trainer_for_customer.
-- 9. Provides RPC functions:
--    - get_monthly_trainer_fee
--    - admin_set_monthly_trainer_fee
--    - get_active_trainers_list
--    - register_member_by_reception (overloaded with trainer support)
--    - change_customer_personal_trainer
--    - stop_customer_personal_training
--    - record_personal_training_session
--    - get_trainer_dashboard_overview
--    - get_admin_trainer_monitoring_data
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Schema Extensions on public.settings, public.payments, public.customers
-- ----------------------------------------------------------------------------

-- Add monthly_trainer_fee to public.settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS monthly_trainer_fee NUMERIC NOT NULL DEFAULT 500
  CHECK (monthly_trainer_fee > 0);

-- Backfill any existing rows to 500 if zero or null
UPDATE public.settings
SET monthly_trainer_fee = 500
WHERE monthly_trainer_fee IS NULL OR monthly_trainer_fee <= 0;

-- Add trainer_fee and trainer_id to public.payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS trainer_fee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES public.trainer_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_trainer_id ON public.payments(trainer_id);
CREATE INDEX IF NOT EXISTS idx_payments_trainer_fee ON public.payments(trainer_fee) WHERE trainer_fee > 0;

-- Add assigned_trainer_id to public.customers for fast indexed lookups
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS assigned_trainer_id UUID REFERENCES public.trainer_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_assigned_trainer ON public.customers(assigned_trainer_id);

-- ----------------------------------------------------------------------------
-- 2. Trainer Assignments Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trainer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES public.trainer_profiles(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED', 'CANCELLED')),
  monthly_fee_at_assignment NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most ONE active assignment per member at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_assignments_single_active
  ON public.trainer_assignments(customer_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_trainer_assignments_trainer_status
  ON public.trainer_assignments(trainer_id, status);

CREATE INDEX IF NOT EXISTS idx_trainer_assignments_customer_history
  ON public.trainer_assignments(customer_id, created_at DESC);

-- Trigger to keep customers.assigned_trainer_id synchronized
CREATE OR REPLACE FUNCTION public.sync_customer_assigned_trainer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.status = 'ACTIVE' THEN
      UPDATE public.customers
      SET assigned_trainer_id = NEW.trainer_id, updated_at = now()
      WHERE id = NEW.customer_id;
    ELSIF NEW.status IN ('ENDED', 'CANCELLED') THEN
      -- If the ended assignment matches the current assigned trainer, clear it
      UPDATE public.customers
      SET assigned_trainer_id = NULL, updated_at = now()
      WHERE id = NEW.customer_id AND assigned_trainer_id = NEW.trainer_id;
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.customers
    SET assigned_trainer_id = NULL, updated_at = now()
    WHERE id = OLD.customer_id AND assigned_trainer_id = OLD.trainer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_assigned_trainer ON public.trainer_assignments;
CREATE TRIGGER trg_sync_customer_assigned_trainer
  AFTER INSERT OR UPDATE OR DELETE ON public.trainer_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_assigned_trainer();

-- ----------------------------------------------------------------------------
-- 3. Workout Plans & Exercises Tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES public.trainer_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
  is_template BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_plans_customer ON public.workout_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_trainer ON public.workout_plans(trainer_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_templates ON public.workout_plans(trainer_id) WHERE is_template = TRUE;

CREATE TABLE IF NOT EXISTS public.workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_plan_id UUID NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL DEFAULT 'Day 1',
  exercise_name TEXT NOT NULL,
  sets INT NOT NULL DEFAULT 3,
  reps INT NOT NULL DEFAULT 10,
  duration_seconds INT DEFAULT 0,
  rest_seconds INT DEFAULT 60,
  instructions TEXT,
  video_url TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_exercises_plan ON public.workout_exercises(workout_plan_id, order_index);

-- ----------------------------------------------------------------------------
-- 4. Meal Plans & Meal Items Tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES public.trainer_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  daily_calorie_target INT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
  is_template BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_customer ON public.meal_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_trainer ON public.meal_plans(trainer_id);

CREATE TABLE IF NOT EXISTS public.meal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK')),
  food_name TEXT NOT NULL,
  portion TEXT,
  calories INT,
  protein_grams NUMERIC,
  carbs_grams NUMERIC,
  fats_grams NUMERIC,
  nutritional_instructions TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_items_plan ON public.meal_items(meal_plan_id, order_index);

-- ----------------------------------------------------------------------------
-- 5. Exercise Videos Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.exercise_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES public.trainer_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  duration_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercise_videos_trainer ON public.exercise_videos(trainer_id);

-- ----------------------------------------------------------------------------
-- 6. Member Progress Records Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.member_progress_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES public.trainer_profiles(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC,
  body_fat_percentage NUMERIC,
  chest_cm NUMERIC,
  waist_cm NUMERIC,
  hips_cm NUMERIC,
  arms_cm NUMERIC,
  thighs_cm NUMERIC,
  bench_press_max_kg NUMERIC,
  squat_max_kg NUMERIC,
  deadlift_max_kg NUMERIC,
  workout_performance TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_progress_customer ON public.member_progress_records(customer_id, recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_member_progress_trainer ON public.member_progress_records(trainer_id);

-- ----------------------------------------------------------------------------
-- 7. Personal Training Sessions Table (Completed 1-on-1 Sessions)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.personal_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES public.trainer_profiles(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME,
  end_time TIME,
  duration_minutes INT NOT NULL DEFAULT 60,
  session_focus TEXT NOT NULL,
  performance_notes TEXT,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pt_sessions_customer ON public.personal_training_sessions(customer_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_trainer ON public.personal_training_sessions(trainer_id, session_date DESC);

-- ----------------------------------------------------------------------------
-- 8. Storage Bucket: trainer-videos
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trainer-videos',
  'trainer-videos',
  false,
  52428800, -- 50 MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 9. Helper Auth & Authorization Functions
-- ----------------------------------------------------------------------------

-- Helper: Get authenticated user's trainer_profile_id
CREATE OR REPLACE FUNCTION public.get_auth_trainer_profile_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tp.id
  FROM public.users u
  JOIN public.trainer_profiles tp ON tp.user_id = u.id
  WHERE u.id = auth.uid()
    AND u.is_active = TRUE
    AND tp.is_active = TRUE
    AND u.role = 'TRAINER'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_trainer_profile_id() TO authenticated;

-- Helper: Check if auth user is the assigned trainer for a customer
CREATE OR REPLACE FUNCTION public.is_assigned_trainer_for_customer(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trainer_assignments ta
    JOIN public.trainer_profiles tp ON tp.id = ta.trainer_id
    WHERE ta.customer_id = p_customer_id
      AND tp.user_id = auth.uid()
      AND ta.status = 'ACTIVE'
      AND tp.is_active = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_assigned_trainer_for_customer(UUID) TO authenticated;

-- Update canonical is_authorized_trainer_for_customer
CREATE OR REPLACE FUNCTION public.is_authorized_trainer_for_customer(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT (
    public.powerplus_is_staff(FALSE)
    OR public.is_assigned_trainer_for_customer(p_customer_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_authorized_trainer_for_customer(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. Row Level Security Policies
-- ----------------------------------------------------------------------------

-- Enable RLS on all new tables
ALTER TABLE public.trainer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_progress_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_training_sessions ENABLE ROW LEVEL SECURITY;

-- trainer_assignments RLS
DROP POLICY IF EXISTS "trainer_assignments_staff_manage" ON public.trainer_assignments;
CREATE POLICY "trainer_assignments_staff_manage" ON public.trainer_assignments
  FOR ALL TO authenticated
  USING (public.powerplus_is_staff(FALSE))
  WITH CHECK (public.powerplus_is_staff(FALSE));

DROP POLICY IF EXISTS "trainer_assignments_trainer_select" ON public.trainer_assignments;
CREATE POLICY "trainer_assignments_trainer_select" ON public.trainer_assignments
  FOR SELECT TO authenticated
  USING (
    trainer_id = public.get_auth_trainer_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = trainer_assignments.customer_id AND c.user_id = auth.uid()
    )
  );

-- Customers RLS: Allow trainers to read their assigned customers
DROP POLICY IF EXISTS "trainers_assigned_customers_select" ON public.customers;
CREATE POLICY "trainers_assigned_customers_select" ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.is_assigned_trainer_for_customer(id)
  );

-- Attendance RLS: Allow trainers to read attendance of their assigned customers
DROP POLICY IF EXISTS "trainers_assigned_attendance_select" ON public.attendance;
CREATE POLICY "trainers_assigned_attendance_select" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    public.is_assigned_trainer_for_customer(customer_id)
  );

-- Memberships RLS: Allow trainers to read memberships of assigned customers
DROP POLICY IF EXISTS "trainers_assigned_memberships_select" ON public.memberships;
CREATE POLICY "trainers_assigned_memberships_select" ON public.memberships
  FOR SELECT TO authenticated
  USING (
    public.is_assigned_trainer_for_customer(customer_id)
  );

-- Workout Plans RLS
DROP POLICY IF EXISTS "workout_plans_read" ON public.workout_plans;
CREATE POLICY "workout_plans_read" ON public.workout_plans
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR trainer_id = public.get_auth_trainer_profile_id()
    OR (customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = workout_plans.customer_id AND c.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "workout_plans_trainer_manage" ON public.workout_plans;
CREATE POLICY "workout_plans_trainer_manage" ON public.workout_plans
  FOR ALL TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR (
      trainer_id = public.get_auth_trainer_profile_id()
      AND (customer_id IS NULL OR is_template = TRUE OR public.is_assigned_trainer_for_customer(customer_id))
    )
  )
  WITH CHECK (
    public.powerplus_is_staff(FALSE)
    OR (
      trainer_id = public.get_auth_trainer_profile_id()
      AND (customer_id IS NULL OR is_template = TRUE OR public.is_assigned_trainer_for_customer(customer_id))
    )
  );

-- Workout Exercises RLS
DROP POLICY IF EXISTS "workout_exercises_read" ON public.workout_exercises;
CREATE POLICY "workout_exercises_read" ON public.workout_exercises
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_plans wp
      WHERE wp.id = workout_exercises.workout_plan_id
        AND (
          public.powerplus_is_staff(FALSE)
          OR wp.trainer_id = public.get_auth_trainer_profile_id()
          OR (wp.customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = wp.customer_id AND c.user_id = auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS "workout_exercises_trainer_manage" ON public.workout_exercises;
CREATE POLICY "workout_exercises_trainer_manage" ON public.workout_exercises
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_plans wp
      WHERE wp.id = workout_exercises.workout_plan_id
        AND (
          public.powerplus_is_staff(FALSE)
          OR wp.trainer_id = public.get_auth_trainer_profile_id()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_plans wp
      WHERE wp.id = workout_exercises.workout_plan_id
        AND (
          public.powerplus_is_staff(FALSE)
          OR wp.trainer_id = public.get_auth_trainer_profile_id()
        )
    )
  );

-- Meal Plans RLS
DROP POLICY IF EXISTS "meal_plans_read" ON public.meal_plans;
CREATE POLICY "meal_plans_read" ON public.meal_plans
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR trainer_id = public.get_auth_trainer_profile_id()
    OR (customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = meal_plans.customer_id AND c.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "meal_plans_trainer_manage" ON public.meal_plans;
CREATE POLICY "meal_plans_trainer_manage" ON public.meal_plans
  FOR ALL TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR (
      trainer_id = public.get_auth_trainer_profile_id()
      AND (customer_id IS NULL OR is_template = TRUE OR public.is_assigned_trainer_for_customer(customer_id))
    )
  )
  WITH CHECK (
    public.powerplus_is_staff(FALSE)
    OR (
      trainer_id = public.get_auth_trainer_profile_id()
      AND (customer_id IS NULL OR is_template = TRUE OR public.is_assigned_trainer_for_customer(customer_id))
    )
  );

-- Meal Items RLS
DROP POLICY IF EXISTS "meal_items_read" ON public.meal_items;
CREATE POLICY "meal_items_read" ON public.meal_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_plans mp
      WHERE mp.id = meal_items.meal_plan_id
        AND (
          public.powerplus_is_staff(FALSE)
          OR mp.trainer_id = public.get_auth_trainer_profile_id()
          OR (mp.customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = mp.customer_id AND c.user_id = auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS "meal_items_trainer_manage" ON public.meal_items;
CREATE POLICY "meal_items_trainer_manage" ON public.meal_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_plans mp
      WHERE mp.id = meal_items.meal_plan_id
        AND (
          public.powerplus_is_staff(FALSE)
          OR mp.trainer_id = public.get_auth_trainer_profile_id()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meal_plans mp
      WHERE mp.id = meal_items.meal_plan_id
        AND (
          public.powerplus_is_staff(FALSE)
          OR mp.trainer_id = public.get_auth_trainer_profile_id()
        )
    )
  );

-- Exercise Videos RLS
DROP POLICY IF EXISTS "exercise_videos_read" ON public.exercise_videos;
CREATE POLICY "exercise_videos_read" ON public.exercise_videos
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR trainer_id = public.get_auth_trainer_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.trainer_assignments ta
      JOIN public.customers c ON c.id = ta.customer_id
      WHERE ta.trainer_id = exercise_videos.trainer_id
        AND c.user_id = auth.uid()
        AND ta.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "exercise_videos_trainer_manage" ON public.exercise_videos;
CREATE POLICY "exercise_videos_trainer_manage" ON public.exercise_videos
  FOR ALL TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR trainer_id = public.get_auth_trainer_profile_id()
  )
  WITH CHECK (
    public.powerplus_is_staff(FALSE)
    OR trainer_id = public.get_auth_trainer_profile_id()
  );

-- Member Progress Records RLS
DROP POLICY IF EXISTS "member_progress_read" ON public.member_progress_records;
CREATE POLICY "member_progress_read" ON public.member_progress_records
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR public.is_assigned_trainer_for_customer(customer_id)
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = member_progress_records.customer_id AND c.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "member_progress_manage" ON public.member_progress_records;
CREATE POLICY "member_progress_manage" ON public.member_progress_records
  FOR ALL TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR (trainer_id = public.get_auth_trainer_profile_id() AND public.is_assigned_trainer_for_customer(customer_id))
  )
  WITH CHECK (
    public.powerplus_is_staff(FALSE)
    OR (trainer_id = public.get_auth_trainer_profile_id() AND public.is_assigned_trainer_for_customer(customer_id))
  );

-- Personal Training Sessions RLS
DROP POLICY IF EXISTS "pt_sessions_read" ON public.personal_training_sessions;
CREATE POLICY "pt_sessions_read" ON public.personal_training_sessions
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR public.is_assigned_trainer_for_customer(customer_id)
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = personal_training_sessions.customer_id AND c.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "pt_sessions_manage" ON public.personal_training_sessions;
CREATE POLICY "pt_sessions_manage" ON public.personal_training_sessions
  FOR ALL TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR (trainer_id = public.get_auth_trainer_profile_id() AND public.is_assigned_trainer_for_customer(customer_id))
  )
  WITH CHECK (
    public.powerplus_is_staff(FALSE)
    OR (trainer_id = public.get_auth_trainer_profile_id() AND public.is_assigned_trainer_for_customer(customer_id))
  );

-- Storage Objects Policies for trainer-videos bucket
DROP POLICY IF EXISTS "trainer_videos_upload" ON storage.objects;
CREATE POLICY "trainer_videos_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trainer-videos'
    AND (
      public.powerplus_is_staff(FALSE)
      OR public.powerplus_is_staff(TRUE)
      OR public.get_auth_trainer_profile_id() IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "trainer_videos_read" ON storage.objects;
CREATE POLICY "trainer_videos_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'trainer-videos');

DROP POLICY IF EXISTS "trainer_videos_delete" ON storage.objects;
CREATE POLICY "trainer_videos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'trainer-videos'
    AND (
      public.powerplus_is_staff(FALSE)
      OR public.get_auth_trainer_profile_id() IS NOT NULL
    )
  );

-- ----------------------------------------------------------------------------
-- 11. RPC: Monthly Personal Trainer Fee Management
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_monthly_trainer_fee()
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(monthly_trainer_fee, 500)
  FROM public.settings
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_trainer_fee() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_monthly_trainer_fee(p_fee NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_fee NUMERIC;
BEGIN
  IF NOT public.powerplus_is_staff(TRUE) THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin users can configure the monthly trainer fee.';
  END IF;

  IF p_fee IS NULL OR p_fee <= 0 THEN
    RAISE EXCEPTION 'Invalid fee: Monthly trainer fee must be a positive number.';
  END IF;

  v_clean_fee := round(p_fee, 2);

  UPDATE public.settings
  SET monthly_trainer_fee = v_clean_fee,
      updated_at = now();

  RETURN v_clean_fee;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_monthly_trainer_fee(NUMERIC) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12. RPC: Retrieve Active and Available Trainers List
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_active_trainers_list()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  full_name TEXT,
  phone TEXT,
  specialization TEXT,
  is_active BOOLEAN,
  active_members_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    tp.id,
    tp.user_id,
    trim(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, ''))::TEXT AS full_name,
    COALESCE(tp.phone, '')::TEXT AS phone,
    COALESCE(tp.specialization, 'Fitness Trainer')::TEXT AS specialization,
    tp.is_active,
    (
      SELECT count(*)
      FROM public.trainer_assignments ta
      WHERE ta.trainer_id = tp.id AND ta.status = 'ACTIVE'
    ) AS active_members_count
  FROM public.trainer_profiles tp
  WHERE tp.is_active = TRUE
  ORDER BY tp.first_name ASC, tp.last_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_trainers_list() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 13. RPC: Enhanced Member Registration with Trainer Option
-- ----------------------------------------------------------------------------

-- Drop 9-param legacy signature so we have a unified signature with defaults
DROP FUNCTION IF EXISTS public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID);

CREATE OR REPLACE FUNCTION public.register_member_by_reception(
  p_name TEXT,
  p_phone TEXT,
  p_category TEXT,
  p_plan_id UUID DEFAULT NULL,
  p_plan_name TEXT DEFAULT NULL,
  p_proof_path TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'CASH',
  p_student_id TEXT DEFAULT NULL,
  p_institution TEXT DEFAULT NULL,
  p_needs_trainer BOOLEAN DEFAULT FALSE,
  p_trainer_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT;
  v_last_name TEXT;
  v_customer_id UUID;
  v_customer_code TEXT;
  v_plan public.plans%ROWTYPE;
  v_membership_id UUID;
  v_payment_id UUID;
  v_assignment_id UUID;
  v_user_record_id UUID;
  v_max_code_num INT;
  v_duration_days INT := 30;
  v_plan_price NUMERIC := 0;
  v_trainer_fee NUMERIC := 0;
  v_total_amount NUMERIC := 0;
  v_method TEXT;
  v_clean_proof TEXT;
  v_trainer_exists BOOLEAN := FALSE;
  v_trainer_name TEXT;
  v_notes TEXT;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required to register members';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Member name is required';
  END IF;
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  v_method := upper(trim(coalesce(p_payment_method, 'CASH')));
  IF v_method NOT IN ('CASH', 'TELEBIRR', 'CBE_BIRR') THEN
    RAISE EXCEPTION 'Invalid payment method: %, must be Cash, Telebirr, or CBE Birr', p_payment_method;
  END IF;

  v_clean_proof := nullif(trim(coalesce(p_proof_path, '')), '');

  IF v_method = 'CASH' THEN
    v_clean_proof := NULL;
  ELSE
    IF v_clean_proof IS NULL THEN
      RAISE EXCEPTION 'Payment proof photo is required for % payments', v_method;
    END IF;
  END IF;

  -- Check duplicate phone
  IF EXISTS (SELECT 1 FROM public.customers WHERE phone = trim(p_phone)) THEN
    RAISE EXCEPTION 'A customer with phone % is already registered', trim(p_phone);
  END IF;

  -- Resolve plan
  IF p_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id AND is_active = TRUE;
  END IF;

  IF v_plan.id IS NULL AND p_plan_name IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE lower(trim(name)) = lower(trim(p_plan_name)) AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_plan.id IS NOT NULL THEN
    v_duration_days := coalesce(v_plan.duration_days, 30);
    v_plan_price := v_plan.price;
  ELSE
    v_duration_days := 30;
    v_plan_price := 2500;
  END IF;

  -- Handle Personal Training option
  IF p_needs_trainer THEN
    IF p_trainer_id IS NULL THEN
      RAISE EXCEPTION 'Please select an available personal trainer.';
    END IF;

    SELECT
      TRUE,
      trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_trainer_exists, v_trainer_name
    FROM public.trainer_profiles
    WHERE id = p_trainer_id AND is_active = TRUE;

    IF NOT v_trainer_exists THEN
      RAISE EXCEPTION 'The selected trainer is currently unavailable or inactive.';
    END IF;

    -- Retrieve trusted database fee
    SELECT COALESCE(monthly_trainer_fee, 500) INTO v_trainer_fee
    FROM public.settings
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_trainer_fee IS NULL OR v_trainer_fee <= 0 THEN
      RAISE EXCEPTION 'Personal trainer monthly fee is not configured in settings.';
    END IF;

    v_total_amount := v_plan_price + v_trainer_fee;
    v_notes := 'Member registration payment recorded by Reception (' || v_method || ') with Personal Trainer [' ||
               v_trainer_name || ']. Breakdown: Membership: ' || v_plan_price || ' ETB + Monthly Trainer Fee: ' || v_trainer_fee || ' ETB.';
  ELSE
    v_trainer_fee := 0;
    v_total_amount := v_plan_price;
    v_notes := 'In-person member registration payment recorded by Reception (' || v_method || ')';
  END IF;

  -- Name parsing
  v_first_name := split_part(trim(p_name), ' ', 1);
  v_last_name := nullif(btrim(substr(trim(p_name), length(v_first_name) + 1)), '');
  IF v_last_name IS NULL THEN
    v_last_name := v_first_name;
  END IF;

  -- Compute next sequential customer code
  SELECT coalesce(max(substring(customer_code FROM '^PP-([0-9]{1,6})$')::BIGINT), 0) + 1
  INTO v_max_code_num
  FROM public.customers
  WHERE customer_code ~ '^PP-[0-9]{1,6}$';

  v_customer_code := 'PP-' || lpad(v_max_code_num::TEXT, 3, '0');

  -- Insert customer
  INSERT INTO public.customers (
    customer_code,
    first_name,
    last_name,
    phone,
    join_date,
    status,
    customer_type,
    student_id,
    institution,
    student_verification_status,
    assigned_trainer_id,
    created_at,
    updated_at
  ) VALUES (
    v_customer_code,
    v_first_name,
    v_last_name,
    trim(p_phone),
    CURRENT_DATE,
    'ACTIVE',
    coalesce(p_category, 'REGULAR'),
    CASE WHEN p_category = 'STUDENT' THEN nullif(trim(p_student_id), '') END,
    CASE WHEN p_category = 'STUDENT' THEN nullif(trim(p_institution), '') END,
    'NOT_REQUIRED',
    CASE WHEN p_needs_trainer THEN p_trainer_id ELSE NULL END,
    now(),
    now()
  ) RETURNING id INTO v_customer_id;

  -- Insert membership if plan exists
  IF v_plan.id IS NOT NULL THEN
    INSERT INTO public.memberships (
      customer_id,
      plan_id,
      start_date,
      end_date,
      status,
      price_at_purchase,
      auto_renew,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      v_customer_id,
      v_plan.id,
      CURRENT_DATE,
      CURRENT_DATE + v_duration_days,
      'ACTIVE',
      v_plan_price,
      FALSE,
      auth.uid(),
      now(),
      now()
    ) RETURNING id INTO v_membership_id;
  END IF;

  -- Insert single, authoritative payment record including trainer fee breakdown
  SELECT id INTO v_user_record_id FROM public.users WHERE id = auth.uid();

  INSERT INTO public.payments (
    customer_id,
    membership_id,
    amount,
    trainer_fee,
    trainer_id,
    payment_method,
    payment_status,
    transaction_reference,
    paid_at,
    recorded_by,
    notes,
    service_type,
    created_at
  ) VALUES (
    v_customer_id,
    v_membership_id,
    v_total_amount,
    v_trainer_fee,
    CASE WHEN p_needs_trainer THEN p_trainer_id ELSE NULL END,
    v_method,
    'PAID',
    v_clean_proof,
    now(),
    v_user_record_id,
    v_notes,
    'MEMBERSHIP',
    now()
  ) RETURNING id INTO v_payment_id;

  -- If Personal Training was chosen, record the initial trainer assignment
  IF p_needs_trainer THEN
    INSERT INTO public.trainer_assignments (
      customer_id,
      trainer_id,
      assigned_by,
      status,
      monthly_fee_at_assignment,
      start_date,
      notes
    ) VALUES (
      v_customer_id,
      p_trainer_id,
      auth.uid(),
      'ACTIVE',
      v_trainer_fee,
      CURRENT_DATE,
      'Initial personal trainer assignment at registration.'
    ) RETURNING id INTO v_assignment_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'customer_id', v_customer_id,
    'customer_code', v_customer_code,
    'membership_id', v_membership_id,
    'payment_id', v_payment_id,
    'assignment_id', v_assignment_id,
    'trainer_assigned', p_needs_trainer,
    'trainer_id', p_trainer_id,
    'trainer_fee', v_trainer_fee,
    'total_amount', v_total_amount,
    'expiry_date', (CURRENT_DATE + v_duration_days)::TEXT
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 14. RPC: Change Personal Trainer Workflow
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.change_customer_personal_trainer(
  p_customer_id UUID,
  p_new_trainer_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_trainer_id UUID;
  v_fee NUMERIC;
  v_new_assignment_id UUID;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Reception or Admin authorization required to change trainers.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.trainer_profiles WHERE id = p_new_trainer_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Target trainer is inactive or does not exist.';
  END IF;

  -- Close existing active assignment
  SELECT trainer_id INTO v_old_trainer_id
  FROM public.trainer_assignments
  WHERE customer_id = p_customer_id AND status = 'ACTIVE'
  LIMIT 1;

  IF v_old_trainer_id = p_new_trainer_id THEN
    RAISE EXCEPTION 'The member is already assigned to this trainer.';
  END IF;

  UPDATE public.trainer_assignments
  SET status = 'ENDED',
      end_date = CURRENT_DATE,
      notes = COALESCE(notes || ' | ', '') || 'Reassigned to another trainer: ' || COALESCE(p_reason, 'No reason specified'),
      updated_at = now()
  WHERE customer_id = p_customer_id AND status = 'ACTIVE';

  -- Retrieve latest configured fee for future periods
  SELECT COALESCE(monthly_trainer_fee, 500) INTO v_fee
  FROM public.settings
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  -- Create new active assignment
  INSERT INTO public.trainer_assignments (
    customer_id,
    trainer_id,
    assigned_by,
    status,
    monthly_fee_at_assignment,
    start_date,
    notes
  ) VALUES (
    p_customer_id,
    p_new_trainer_id,
    auth.uid(),
    'ACTIVE',
    v_fee,
    CURRENT_DATE,
    'Reassigned from trainer ' || COALESCE(v_old_trainer_id::TEXT, 'None') || '. ' || COALESCE(p_reason, '')
  ) RETURNING id INTO v_new_assignment_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'previous_trainer_id', v_old_trainer_id,
    'new_trainer_id', p_new_trainer_id,
    'new_assignment_id', v_new_assignment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_customer_personal_trainer(UUID, UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 15. RPC: Stop Personal Training Workflow
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stop_customer_personal_training(
  p_customer_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ended_count INT;
BEGIN
  -- Permitted for Staff or Member themselves
  IF NOT (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only staff or the member themselves can stop personal training.';
  END IF;

  UPDATE public.trainer_assignments
  SET status = 'ENDED',
      end_date = CURRENT_DATE,
      notes = COALESCE(notes || ' | ', '') || 'Personal training cancelled: ' || COALESCE(p_reason, 'Member requested termination'),
      updated_at = now()
  WHERE customer_id = p_customer_id AND status = 'ACTIVE';

  GET DIAGNOSTICS v_ended_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', TRUE,
    'assignments_ended', v_ended_count,
    'customer_id', p_customer_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.stop_customer_personal_training(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 16. RPC: Record Completed Personal Training Session
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_personal_training_session(
  p_customer_id UUID,
  p_session_date DATE,
  p_session_focus TEXT,
  p_performance_notes TEXT DEFAULT NULL,
  p_duration_minutes INT DEFAULT 60
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trainer_id UUID;
  v_session_id UUID;
BEGIN
  v_trainer_id := public.get_auth_trainer_profile_id();

  IF v_trainer_id IS NULL AND NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Only active personal trainers or staff can record sessions.';
  END IF;

  -- If staff is recording, resolve from active assignment
  IF v_trainer_id IS NULL THEN
    SELECT trainer_id INTO v_trainer_id
    FROM public.trainer_assignments
    WHERE customer_id = p_customer_id AND status = 'ACTIVE'
    LIMIT 1;

    IF v_trainer_id IS NULL THEN
      RAISE EXCEPTION 'This member does not have an active personal trainer assignment.';
    END IF;
  ELSE
    -- Verify trainer is authorized for this member
    IF NOT public.is_assigned_trainer_for_customer(p_customer_id) THEN
      RAISE EXCEPTION 'Unauthorized: You are not the assigned trainer for this member.';
    END IF;
  END IF;

  IF p_session_focus IS NULL OR trim(p_session_focus) = '' THEN
    RAISE EXCEPTION 'Session focus/workout topic is required.';
  END IF;

  INSERT INTO public.personal_training_sessions (
    customer_id,
    trainer_id,
    session_date,
    duration_minutes,
    session_focus,
    performance_notes,
    status
  ) VALUES (
    p_customer_id,
    v_trainer_id,
    COALESCE(p_session_date, CURRENT_DATE),
    COALESCE(p_duration_minutes, 60),
    trim(p_session_focus),
    p_performance_notes,
    'COMPLETED'
  ) RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'session_id', v_session_id,
    'session_date', COALESCE(p_session_date, CURRENT_DATE),
    'trainer_id', v_trainer_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_personal_training_session(UUID, DATE, TEXT, TEXT, INT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 17. RPC: Trainer Dashboard Overview & Member Retrieval
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_trainer_dashboard_overview(p_trainer_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_effective_trainer_id UUID := p_trainer_id;
  v_total_assigned INT := 0;
  v_active_members INT := 0;
  v_expired_members INT := 0;
  v_follow_up_needed INT := 0;
  v_recent_activity JSONB;
BEGIN
  IF v_effective_trainer_id IS NULL THEN
    v_effective_trainer_id := public.get_auth_trainer_profile_id();
  END IF;

  IF v_effective_trainer_id IS NULL THEN
    RAISE EXCEPTION 'Trainer profile not found or user is not a trainer.';
  END IF;

  -- 1. Total assigned
  SELECT COUNT(DISTINCT ta.customer_id) INTO v_total_assigned
  FROM public.trainer_assignments ta
  WHERE ta.trainer_id = v_effective_trainer_id AND ta.status = 'ACTIVE';

  -- 2. Active vs Expired memberships
  SELECT
    COUNT(DISTINCT CASE WHEN m.end_date >= CURRENT_DATE AND m.status = 'ACTIVE' THEN ta.customer_id END),
    COUNT(DISTINCT CASE WHEN m.end_date < CURRENT_DATE OR m.status = 'EXPIRED' THEN ta.customer_id END)
  INTO v_active_members, v_expired_members
  FROM public.trainer_assignments ta
  JOIN public.memberships m ON m.customer_id = ta.customer_id
  WHERE ta.trainer_id = v_effective_trainer_id AND ta.status = 'ACTIVE';

  -- 3. Follow-up needed: Expiring within 5 days OR no gym attendance in last 7 days
  SELECT COUNT(DISTINCT ta.customer_id) INTO v_follow_up_needed
  FROM public.trainer_assignments ta
  LEFT JOIN public.memberships m ON m.customer_id = ta.customer_id AND m.status = 'ACTIVE'
  WHERE ta.trainer_id = v_effective_trainer_id
    AND ta.status = 'ACTIVE'
    AND (
      (m.end_date <= CURRENT_DATE + INTERVAL '5 days')
      OR NOT EXISTS (
        SELECT 1 FROM public.attendance a
        WHERE a.customer_id = ta.customer_id AND a.checked_in_at >= now() - INTERVAL '7 days'
      )
    );

  -- 4. Recent activity: Gym check-ins & completed PT sessions for assigned members
  SELECT COALESCE(jsonb_agg(act), '[]'::jsonb) INTO v_recent_activity
  FROM (
    (
      SELECT
        'GYM_ATTENDANCE' AS activity_type,
        a.id,
        a.customer_id,
        c.first_name || ' ' || c.last_name AS customer_name,
        c.customer_code,
        a.checked_in_at AS activity_timestamp,
        COALESCE(a.notes, 'Gym floor check-in') AS details
      FROM public.attendance a
      JOIN public.trainer_assignments ta ON ta.customer_id = a.customer_id AND ta.status = 'ACTIVE'
      JOIN public.customers c ON c.id = a.customer_id
      WHERE ta.trainer_id = v_effective_trainer_id
      ORDER BY a.checked_in_at DESC
      LIMIT 10
    )
    UNION ALL
    (
      SELECT
        'PT_SESSION' AS activity_type,
        pts.id,
        pts.customer_id,
        c.first_name || ' ' || c.last_name AS customer_name,
        c.customer_code,
        pts.created_at AS activity_timestamp,
        'PT: ' || pts.session_focus || ' (' || pts.duration_minutes || ' min)' AS details
      FROM public.personal_training_sessions pts
      JOIN public.customers c ON c.id = pts.customer_id
      WHERE pts.trainer_id = v_effective_trainer_id
      ORDER BY pts.created_at DESC
      LIMIT 10
    )
    ORDER BY activity_timestamp DESC
    LIMIT 15
  ) act;

  RETURN jsonb_build_object(
    'trainer_id', v_effective_trainer_id,
    'total_assigned', v_total_assigned,
    'active_members', v_active_members,
    'expired_members', v_expired_members,
    'follow_up_needed', v_follow_up_needed,
    'recent_activity', v_recent_activity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trainer_dashboard_overview(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 18. RPC: Admin Trainer Monitoring Data
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_trainer_monitoring_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_trainers JSONB;
  v_summary JSONB;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Only Staff or Admins can view trainer monitoring metrics.';
  END IF;

  SELECT jsonb_agg(tr) INTO v_trainers
  FROM (
    SELECT
      tp.id,
      tp.user_id,
      trim(COALESCE(tp.first_name, '') || ' ' || COALESCE(tp.last_name, '')) AS full_name,
      COALESCE(tp.phone, '') AS phone,
      COALESCE(tp.specialization, 'Fitness Trainer') AS specialization,
      tp.is_active,
      u.login_id,
      u.email,
      COUNT(DISTINCT CASE WHEN ta.status = 'ACTIVE' THEN ta.customer_id END) AS active_members_count,
      COUNT(DISTINCT CASE
        WHEN ta.status = 'ACTIVE' AND (m.end_date < CURRENT_DATE OR m.status = 'EXPIRED') THEN ta.customer_id
      END) AS expired_members_count,
      COALESCE((
        SELECT SUM(p.trainer_fee)
        FROM public.payments p
        WHERE p.trainer_id = tp.id AND p.payment_status = 'PAID'
      ), 0) AS total_trainer_revenue,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'customer_id', c.id,
          'customer_code', c.customer_code,
          'customer_name', c.first_name || ' ' || c.last_name,
          'phone', c.phone,
          'status', ta.status,
          'start_date', ta.start_date,
          'end_date', ta.end_date,
          'plan_name', pl.name,
          'membership_status', m.status,
          'membership_end', m.end_date
        ))
        FROM public.trainer_assignments ta
        JOIN public.customers c ON c.id = ta.customer_id
        LEFT JOIN public.memberships m ON m.customer_id = c.id
        LEFT JOIN public.plans pl ON pl.id = m.plan_id
        WHERE ta.trainer_id = tp.id
      ), '[]'::jsonb) AS assignments
    FROM public.trainer_profiles tp
    LEFT JOIN public.users u ON u.id = tp.user_id
    LEFT JOIN public.trainer_assignments ta ON ta.trainer_id = tp.id
    LEFT JOIN public.memberships m ON m.customer_id = ta.customer_id
    GROUP BY tp.id, tp.user_id, tp.first_name, tp.last_name, tp.phone, tp.specialization, tp.is_active, u.login_id, u.email
    ORDER BY tp.first_name ASC
  ) tr;

  SELECT jsonb_build_object(
    'total_trainers', COUNT(*),
    'active_trainers', COUNT(*) FILTER (WHERE is_active = TRUE),
    'current_trainer_fee', (SELECT COALESCE(monthly_trainer_fee, 500) FROM public.settings LIMIT 1),
    'total_trainer_revenue', COALESCE((SELECT SUM(trainer_fee) FROM public.payments WHERE payment_status = 'PAID'), 0)
  ) INTO v_summary
  FROM public.trainer_profiles;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'trainers', COALESCE(v_trainers, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_trainer_monitoring_data() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 19. Schema Cache Reload
-- ----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMIT;
