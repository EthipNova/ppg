-- ============================================================================
-- PowerPlus Gym: Trainer Weekly Workout Schedule & Multi-Set Performance
-- Migration: 20261109224500_trainer_weekly_schedule_and_sets.sql
-- ============================================================================

-- 1. Ensure is_active exists on customer_categories
ALTER TABLE public.customer_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Member Weekly Workout Schedules
CREATE TABLE IF NOT EXISTS public.member_workout_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  trainer_id UUID REFERENCES public.trainer_profiles(id) ON DELETE SET NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  workout_title TEXT NOT NULL,
  is_rest_day BOOLEAN NOT NULL DEFAULT FALSE,
  focus_area TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_member_schedule_day UNIQUE (customer_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_member_workout_schedules_cust ON public.member_workout_schedules(customer_id);
CREATE INDEX IF NOT EXISTS idx_member_workout_schedules_trainer ON public.member_workout_schedules(trainer_id);

-- RLS on member_workout_schedules
ALTER TABLE public.member_workout_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_workout_schedules_read" ON public.member_workout_schedules;
CREATE POLICY "member_workout_schedules_read" ON public.member_workout_schedules
  FOR SELECT TO authenticated, anon
  USING (
    customer_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.customers c WHERE c.id = member_workout_schedules.customer_id AND c.user_id = auth.uid())
      OR public.powerplus_is_staff(FALSE)
      OR EXISTS (SELECT 1 FROM public.trainer_profiles tp WHERE tp.user_id = auth.uid())
      OR auth.uid() IS NULL
    )
  );

DROP POLICY IF EXISTS "member_workout_schedules_manage" ON public.member_workout_schedules;
CREATE POLICY "member_workout_schedules_manage" ON public.member_workout_schedules
  FOR ALL TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (SELECT 1 FROM public.trainer_profiles tp WHERE tp.user_id = auth.uid())
  )
  WITH CHECK (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (SELECT 1 FROM public.trainer_profiles tp WHERE tp.user_id = auth.uid())
  );

-- 3. Multi-set storage on workout_exercises
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS sets_data JSONB DEFAULT '[]'::jsonb;

-- Backfill sets_data from existing single set columns if empty
UPDATE public.workout_exercises
SET sets_data = jsonb_build_array(
  jsonb_build_object(
    'set_number', 1,
    'planned_reps', COALESCE(planned_reps, reps, 10),
    'planned_weight_kg', planned_weight_kg,
    'actual_reps', actual_reps,
    'actual_weight_kg', actual_weight_kg,
    'is_completed', is_completed
  )
)
WHERE sets_data IS NULL OR sets_data = '[]'::jsonb;

-- 4. Update get_customer_my_trainer_bundle RPC to return weekly_schedule and sets_data
CREATE OR REPLACE FUNCTION public.get_customer_my_trainer_bundle(p_customer_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_customer_id UUID;
  v_assigned_trainer_id UUID;
  v_active_trainer JSONB := NULL;
  v_weekly_schedule JSONB := '[]'::jsonb;
  v_workout_plans JSONB := '[]'::jsonb;
  v_meal_plans JSONB := '[]'::jsonb;
  v_videos JSONB := '[]'::jsonb;
  v_progress_records JSONB := '[]'::jsonb;
  v_coaching_notes JSONB := '[]'::jsonb;
BEGIN
  -- Resolve customer_id
  IF p_customer_id IS NOT NULL THEN
    v_customer_id := p_customer_id;
  ELSE
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object(
      'has_active_trainer', FALSE,
      'trainer', NULL,
      'weekly_schedule', '[]'::jsonb,
      'workout_plans', '[]'::jsonb,
      'meal_plans', '[]'::jsonb,
      'exercise_videos', '[]'::jsonb,
      'progress_records', '[]'::jsonb,
      'coaching_notes', '[]'::jsonb
    );
  END IF;

  -- Active Trainer Assignment
  SELECT assigned_trainer_id INTO v_assigned_trainer_id
  FROM public.customers
  WHERE id = v_customer_id;

  IF v_assigned_trainer_id IS NULL THEN
    SELECT trainer_id INTO v_assigned_trainer_id
    FROM public.trainer_assignments
    WHERE customer_id = v_customer_id
      AND status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_assigned_trainer_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', tp.id,
      'first_name', tp.first_name,
      'last_name', tp.last_name,
      'full_name', trim(coalesce(tp.first_name, '') || ' ' || coalesce(tp.last_name, '')),
      'specialties', tp.specialties,
      'bio', tp.bio,
      'rating', tp.rating,
      'photo_url', tp.photo_url,
      'phone', tp.phone
    ) INTO v_active_trainer
    FROM public.trainer_profiles tp
    WHERE tp.id = v_assigned_trainer_id;
  END IF;

  -- Weekly Workout Schedule
  SELECT COALESCE(jsonb_agg(ws ORDER BY CASE ws->>'day_of_week'
    WHEN 'Monday' THEN 1
    WHEN 'Tuesday' THEN 2
    WHEN 'Wednesday' THEN 3
    WHEN 'Thursday' THEN 4
    WHEN 'Friday' THEN 5
    WHEN 'Saturday' THEN 6
    WHEN 'Sunday' THEN 7
    ELSE 8 END), '[]'::jsonb)
  INTO v_weekly_schedule
  FROM (
    SELECT jsonb_build_object(
      'id', s.id,
      'customer_id', s.customer_id,
      'trainer_id', s.trainer_id,
      'day_of_week', s.day_of_week,
      'workout_title', s.workout_title,
      'is_rest_day', s.is_rest_day,
      'focus_area', s.focus_area,
      'notes', s.notes,
      'exercises', s.exercises
    ) AS ws
    FROM public.member_workout_schedules s
    WHERE s.customer_id = v_customer_id
  ) sched_sub;

  -- Workout Plans for this customer (Exclude DRAFT workouts!)
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
          'sets_data', COALESCE(e.sets_data, '[]'::jsonb),
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

  -- Meal Plans for this customer
  SELECT COALESCE(jsonb_agg(mp ORDER BY (mp->>'created_at') DESC), '[]'::jsonb)
  INTO v_meal_plans
  FROM (
    SELECT jsonb_build_object(
      'id', m.id,
      'customer_id', m.customer_id,
      'trainer_id', m.trainer_id,
      'title', m.title,
      'notes', m.notes,
      'daily_calories', m.daily_calories,
      'start_date', m.start_date,
      'status', m.status,
      'created_at', m.created_at,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', mi.id,
          'meal_type', mi.meal_type,
          'food_name', mi.food_name,
          'portion', mi.portion,
          'calories', mi.calories,
          'protein_grams', mi.protein_grams,
          'carbs_grams', mi.carbs_grams,
          'fat_grams', mi.fat_grams,
          'instructions', mi.instructions,
          'order_index', mi.order_index
        ) ORDER BY mi.order_index ASC)
        FROM public.meal_items mi
        WHERE mi.meal_plan_id = m.id
      ), '[]'::jsonb)
    ) AS mp
    FROM public.meal_plans m
    WHERE m.customer_id = v_customer_id
  ) meals_sub;

  -- Exercise Videos
  SELECT COALESCE(jsonb_agg(ev ORDER BY (ev->>'created_at') DESC), '[]'::jsonb)
  INTO v_videos
  FROM (
    SELECT jsonb_build_object(
      'id', v.id,
      'title', v.title,
      'description', v.description,
      'video_url', v.video_url,
      'thumbnail_url', v.thumbnail_url,
      'duration_seconds', v.duration_seconds,
      'category', v.category,
      'trainer_id', v.trainer_id,
      'trainer_name', trim(coalesce(tp.first_name, '') || ' ' || coalesce(tp.last_name, '')),
      'created_at', v.created_at
    ) AS ev
    FROM public.exercise_videos v
    LEFT JOIN public.trainer_profiles tp ON tp.id = v.trainer_id
    WHERE v.customer_id IS NULL OR v.customer_id = v_customer_id
  ) videos_sub;

  -- Progress Records
  SELECT COALESCE(jsonb_agg(pr ORDER BY (pr->>'created_at') DESC), '[]'::jsonb)
  INTO v_progress_records
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'customer_id', r.customer_id,
      'trainer_id', r.trainer_id,
      'weight_kg', r.weight_kg,
      'body_fat_percentage', r.body_fat_percentage,
      'chest_cm', r.chest_cm,
      'waist_cm', r.waist_cm,
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
  ) prog_sub;

  -- Trainer Coaching Notes
  SELECT COALESCE(jsonb_agg(cn ORDER BY (cn->>'created_at') DESC), '[]'::jsonb)
  INTO v_coaching_notes
  FROM (
    SELECT jsonb_build_object(
      'id', n.id,
      'customer_id', n.customer_id,
      'trainer_id', n.trainer_id,
      'session_date', n.session_date,
      'session_focus', n.session_focus,
      'workout_focus', n.workout_focus,
      'performance_notes', n.performance_notes,
      'created_at', n.created_at
    ) AS cn
    FROM public.trainer_coaching_notes n
    WHERE n.customer_id = v_customer_id
  ) notes_sub;

  RETURN jsonb_build_object(
    'has_active_trainer', TRUE,
    'trainer', v_active_trainer,
    'weekly_schedule', v_weekly_schedule,
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

