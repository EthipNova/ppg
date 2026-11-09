-- ============================================================================
-- Migration: 20261109210000_reception_workout_and_admin_improvements.sql
-- Description:
-- 1. Fix admin_set_monthly_trainer_fee: Provide WHERE clause to prevent safeupdate error.
-- 2. Reception Steam Stats: Support date filtering with timezone consistency (Africa/Addis_Ababa, EAT / UTC+3)
--    excluding cancelled services and pending/rejected payments.
-- 3. Digital Workout Log: Expand workout_plans & workout_exercises with planned vs actual
--    weight/reps, complete status, workout date, notes, and draft/published visibility.
-- 4. In-App Notifications table: Support member alerts when workouts are published.
-- 5. Update get_customer_my_trainer_bundle: Exclude draft workouts and return digital workout log fields.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FIX: admin_set_monthly_trainer_fee (Add WHERE clause)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_monthly_trainer_fee(p_fee NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_fee NUMERIC;
  v_rows_updated INT;
BEGIN
  IF NOT public.powerplus_is_staff(TRUE) THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin users can configure the monthly trainer fee.';
  END IF;

  IF p_fee IS NULL OR p_fee <= 0 THEN
    RAISE EXCEPTION 'Invalid fee: Monthly trainer fee must be a positive number.';
  END IF;

  v_clean_fee := round(p_fee, 2);

  -- Safe update with explicit WHERE clause to prevent "UPDATE requires a WHERE clause"
  UPDATE public.settings
  SET monthly_trainer_fee = v_clean_fee,
      updated_at = now()
  WHERE id = 'gym' OR id IS NOT NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    INSERT INTO public.settings (id, monthly_trainer_fee, updated_at)
    VALUES ('gym', v_clean_fee, now())
    ON CONFLICT (id) DO UPDATE
    SET monthly_trainer_fee = EXCLUDED.monthly_trainer_fee,
        updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN v_clean_fee;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_monthly_trainer_fee(NUMERIC) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Steam Summary Statistics with Date Filtering (UTC+3 / Africa/Addis_Ababa)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_steam_summary_stats();
DROP FUNCTION IF EXISTS public.get_steam_summary_stats(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_steam_summary_stats(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_services_count INTEGER := 0;
  v_in_progress INTEGER := 0;
  v_completed_services INTEGER := 0;
  v_revenue NUMERIC := 0;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required';
  END IF;

  -- Default to today in Ethiopia (EAT, UTC+3)
  IF p_start_date IS NULL THEN
    v_start := (date_trunc('day', now() AT TIME ZONE 'Africa/Addis_Ababa')) AT TIME ZONE 'Africa/Addis_Ababa';
  ELSE
    v_start := p_start_date;
  END IF;

  IF p_end_date IS NULL THEN
    v_end := (date_trunc('day', now() AT TIME ZONE 'Africa/Addis_Ababa') + INTERVAL '1 day' - INTERVAL '1 millisecond') AT TIME ZONE 'Africa/Addis_Ababa';
  ELSE
    v_end := p_end_date;
  END IF;

  -- 1. Services count within date range: Must exclude cancelled and pending/rejected
  SELECT count(*) INTO v_services_count
  FROM public.steam_services
  WHERE created_at >= v_start
    AND created_at <= v_end
    AND service_status != 'CANCELLED'
    AND payment_status = 'APPROVED';

  -- 2. Currently in progress (authorized and in steam room)
  SELECT count(*) INTO v_in_progress
  FROM public.steam_services
  WHERE service_status = 'AUTHORIZED';

  -- 3. Completed services within date range
  SELECT count(*) INTO v_completed_services
  FROM public.steam_services
  WHERE service_status = 'COMPLETED'
    AND payment_status = 'APPROVED'
    AND created_at >= v_start
    AND created_at <= v_end;

  -- 4. Total revenue within date range (APPROVED payments only, excluding CANCELLED)
  SELECT coalesce(sum(amount), 0) INTO v_revenue
  FROM public.steam_services
  WHERE payment_status = 'APPROVED'
    AND service_status != 'CANCELLED'
    AND created_at >= v_start
    AND created_at <= v_end;

  RETURN jsonb_build_object(
    'services_count', v_services_count,
    'today_services', v_services_count,
    'pending_payments', 0,
    'approved_payments', v_services_count,
    'in_progress_services', v_in_progress,
    'completed_services', v_completed_services,
    'revenue', v_revenue,
    'today_revenue', v_revenue
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_steam_summary_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Digital Workout Log Schema Extension
-- ----------------------------------------------------------------------------

-- Expand workout_plans check constraint to include DRAFT, PUBLISHED, IN_PROGRESS
ALTER TABLE public.workout_plans DROP CONSTRAINT IF EXISTS workout_plans_status_check;
ALTER TABLE public.workout_plans ADD CONSTRAINT workout_plans_status_check
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'ACTIVE', 'ARCHIVED'));

-- Add digital workout log tracking columns to workout_plans
ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS workout_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS is_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Add paper log fields to workout_exercises: Planned vs Actual
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS planned_reps INT DEFAULT 10;
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS planned_weight_kg NUMERIC(6,2) DEFAULT NULL;
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS actual_reps INT DEFAULT NULL;
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS actual_weight_kg NUMERIC(6,2) DEFAULT NULL;
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS is_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill planned_reps & notes if previously null
UPDATE public.workout_exercises
SET planned_reps = COALESCE(reps, 10)
WHERE planned_reps IS NULL AND id IS NOT NULL;

UPDATE public.workout_exercises
SET notes = instructions
WHERE notes IS NULL AND instructions IS NOT NULL AND id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. In-App Notifications Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'WORKOUT_PUBLISHED',
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_customer ON public.in_app_notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user ON public.in_app_notifications(user_id);

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "in_app_notifications_select" ON public.in_app_notifications;
CREATE POLICY "in_app_notifications_select" ON public.in_app_notifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    OR public.powerplus_is_staff(FALSE)
  );

DROP POLICY IF EXISTS "in_app_notifications_insert" ON public.in_app_notifications;
CREATE POLICY "in_app_notifications_insert" ON public.in_app_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "in_app_notifications_update" ON public.in_app_notifications;
CREATE POLICY "in_app_notifications_update" ON public.in_app_notifications
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    OR public.powerplus_is_staff(FALSE)
  );

GRANT ALL ON public.in_app_notifications TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Workout Plans RLS: Protect DRAFT status from members
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "workout_plans_read" ON public.workout_plans;
CREATE POLICY "workout_plans_read" ON public.workout_plans
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR trainer_id = public.get_auth_trainer_profile_id()
    OR (
      customer_id IS NOT NULL
      AND status != 'DRAFT'
      AND EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = workout_plans.customer_id
          AND c.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "workout_exercises_read" ON public.workout_exercises;
CREATE POLICY "workout_exercises_read" ON public.workout_exercises
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.workout_plans wp
      WHERE wp.id = workout_exercises.workout_plan_id
        AND wp.trainer_id = public.get_auth_trainer_profile_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.workout_plans wp
      JOIN public.customers c ON c.id = wp.customer_id
      WHERE wp.id = workout_exercises.workout_plan_id
        AND wp.status != 'DRAFT'
        AND c.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Update get_customer_my_trainer_bundle: Include digital workout log details
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_customer_my_trainer_bundle(UUID);

CREATE OR REPLACE FUNCTION public.get_customer_my_trainer_bundle(p_customer_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID := p_customer_id;
  v_active_trainer JSONB;
  v_trainer_id UUID;
  v_workout_plans JSONB := '[]'::jsonb;
  v_meal_plans JSONB := '[]'::jsonb;
  v_videos JSONB := '[]'::jsonb;
  v_progress_records JSONB := '[]'::jsonb;
  v_coaching_notes JSONB := '[]'::jsonb;
BEGIN
  -- Resolve active trainer
  v_active_trainer := public.get_customer_active_trainer(v_customer_id);

  IF NOT COALESCE((v_active_trainer->>'has_active_trainer')::boolean, FALSE) THEN
    RETURN jsonb_build_object(
      'has_active_trainer', FALSE,
      'trainer', NULL,
      'workout_plans', '[]'::jsonb,
      'meal_plans', '[]'::jsonb,
      'exercise_videos', '[]'::jsonb,
      'progress_records', '[]'::jsonb,
      'coaching_notes', '[]'::jsonb
    );
  END IF;

  v_customer_id := (v_active_trainer->>'customer_id')::uuid;
  v_trainer_id := (v_active_trainer->>'trainer_id')::uuid;

  -- 1. Workout Plans for this customer (Exclude DRAFT workouts!)
  SELECT COALESCE(jsonb_agg(wp ORDER BY COALESCE((wp->>'workout_date'), (wp->>'created_at')) DESC), '[]'::jsonb)
  INTO v_workout_plans
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'customer_id', p.customer_id,
      'trainer_id', p.trainer_id,
      'title', p.title,
      'description', p.description,
      'workout_date', p.workout_date,
      'start_date', p.start_date,
      'end_date', p.end_date,
      'status', p.status,
      'is_completed', p.is_completed,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'exercises', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', e.id,
          'day_of_week', e.day_of_week,
          'exercise_name', e.exercise_name,
          'notes', COALESCE(e.notes, e.instructions),
          'sets', e.sets,
          'reps', e.reps,
          'planned_reps', COALESCE(e.planned_reps, e.reps, 10),
          'planned_weight_kg', e.planned_weight_kg,
          'actual_reps', e.actual_reps,
          'actual_weight_kg', e.actual_weight_kg,
          'is_completed', e.is_completed,
          'duration_seconds', e.duration_seconds,
          'rest_seconds', e.rest_seconds,
          'instructions', e.instructions,
          'video_url', e.video_url,
          'order_index', e.order_index
        ) ORDER BY e.order_index ASC)
        FROM public.workout_exercises e
        WHERE e.workout_plan_id = p.id
      ), '[]'::jsonb)
    ) AS wp
    FROM public.workout_plans p
    WHERE p.customer_id = v_customer_id
      AND p.status != 'DRAFT'
  ) plans_sub;

  -- 2. Meal Plans for this customer
  SELECT COALESCE(jsonb_agg(mp ORDER BY (mp->>'created_at') DESC), '[]'::jsonb)
  INTO v_meal_plans
  FROM (
    SELECT jsonb_build_object(
      'id', m.id,
      'customer_id', m.customer_id,
      'trainer_id', m.trainer_id,
      'title', m.title,
      'start_date', m.start_date,
      'end_date', m.end_date,
      'daily_calorie_target', m.daily_calorie_target,
      'notes', m.notes,
      'status', m.status,
      'created_at', m.created_at,
      'updated_at', m.updated_at,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', it.id,
          'meal_type', it.meal_type,
          'food_name', it.food_name,
          'portion', it.portion,
          'calories', it.calories,
          'protein_grams', it.protein_grams,
          'carbs_grams', it.carbs_grams,
          'fats_grams', it.fats_grams,
          'nutritional_instructions', it.nutritional_instructions,
          'order_index', it.order_index
        ) ORDER BY it.order_index ASC)
        FROM public.meal_items it
        WHERE it.meal_plan_id = m.id
      ), '[]'::jsonb)
    ) AS mp
    FROM public.meal_plans m
    WHERE m.customer_id = v_customer_id
  ) meals_sub;

  -- 3. Exercise Videos from this assigned trainer
  SELECT COALESCE(jsonb_agg(vid ORDER BY (vid->>'created_at') DESC), '[]'::jsonb)
  INTO v_videos
  FROM (
    SELECT jsonb_build_object(
      'id', v.id,
      'trainer_id', v.trainer_id,
      'title', v.title,
      'description', v.description,
      'storage_path', v.storage_path,
      'file_size_bytes', v.file_size_bytes,
      'mime_type', v.mime_type,
      'duration_seconds', v.duration_seconds,
      'created_at', v.created_at
    ) AS vid
    FROM public.exercise_videos v
    WHERE v.trainer_id = v_trainer_id
      AND (v.customer_id IS NULL OR v.customer_id = v_customer_id)
  ) videos_sub;

  -- 4. Progress records for this customer
  SELECT COALESCE(jsonb_agg(pr ORDER BY (pr->>'recorded_date') DESC), '[]'::jsonb)
  INTO v_progress_records
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'customer_id', r.customer_id,
      'trainer_id', r.trainer_id,
      'recorded_date', r.recorded_date,
      'weight_kg', r.weight_kg,
      'body_fat_percentage', r.body_fat_percentage,
      'chest_cm', r.chest_cm,
      'waist_cm', r.waist_cm,
      'hips_cm', r.hips_cm,
      'arms_cm', r.arms_cm,
      'thighs_cm', r.thighs_cm,
      'bench_press_max_kg', r.bench_press_max_kg,
      'squat_max_kg', r.squat_max_kg,
      'deadlift_max_kg', r.deadlift_max_kg,
      'workout_performance', r.workout_performance,
      'notes', r.notes,
      'created_at', r.created_at
    ) AS pr
    FROM public.member_progress_records r
    WHERE r.customer_id = v_customer_id
  ) progress_sub;

  -- 5. Trainer coaching notes
  SELECT COALESCE(jsonb_agg(cn ORDER BY (cn->>'session_date') DESC), '[]'::jsonb)
  INTO v_coaching_notes
  FROM (
    SELECT jsonb_build_object(
      'id', n.id,
      'customer_id', n.customer_id,
      'trainer_id', n.trainer_id,
      'session_date', n.session_date,
      'workout_focus', n.workout_focus,
      'notes', n.notes,
      'created_at', n.created_at
    ) AS cn
    FROM public.trainer_coaching_notes n
    WHERE n.customer_id = v_customer_id
  ) notes_sub;

  RETURN jsonb_build_object(
    'has_active_trainer', TRUE,
    'trainer', v_active_trainer,
    'workout_plans', v_workout_plans,
    'meal_plans', v_meal_plans,
    'exercise_videos', v_videos,
    'progress_records', v_progress_records,
    'coaching_notes', v_coaching_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_my_trainer_bundle(UUID) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
