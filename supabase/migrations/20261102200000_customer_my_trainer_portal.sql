-- ============================================================================
-- Migration: 20261102200000_customer_my_trainer_portal.sql
-- Description:
-- 1. Adds customer_id to public.exercise_videos (nullable) for targeted video assignments.
-- 2. Adds customer SELECT policy on trainer_coaching_notes so members can see notes from their assigned trainer.
-- 3. Updates exercise_videos_read RLS policy for strict customer access.
-- 4. Creates get_customer_active_trainer RPC for secure conditional navigation.
-- 5. Creates get_customer_my_trainer_bundle RPC for atomic, fast retrieval of all training plans, meals, videos, and notes.
-- ============================================================================

BEGIN;

-- 1. Add customer_id column to exercise_videos if not exists
ALTER TABLE public.exercise_videos
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_exercise_videos_customer ON public.exercise_videos(customer_id);

-- 2. Ensure customers can read coaching notes addressed to them
DROP POLICY IF EXISTS "trainer_coaching_notes_customer_select" ON public.trainer_coaching_notes;
CREATE POLICY "trainer_coaching_notes_customer_select" ON public.trainer_coaching_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = trainer_coaching_notes.customer_id
        AND c.user_id = auth.uid()
    )
  );

-- 3. Update exercise_videos RLS policy
DROP POLICY IF EXISTS "exercise_videos_read" ON public.exercise_videos;
CREATE POLICY "exercise_videos_read" ON public.exercise_videos
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR trainer_id = public.get_auth_trainer_profile_id()
    OR (
      EXISTS (
        SELECT 1 FROM public.trainer_assignments ta
        JOIN public.customers c ON c.id = ta.customer_id
        WHERE ta.trainer_id = exercise_videos.trainer_id
          AND c.user_id = auth.uid()
          AND ta.status = 'ACTIVE'
      )
      AND (
        exercise_videos.customer_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.customers c
          WHERE c.id = exercise_videos.customer_id
            AND c.user_id = auth.uid()
        )
      )
    )
  );

-- 4. Function: get_customer_active_trainer
CREATE OR REPLACE FUNCTION public.get_customer_active_trainer(p_customer_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_customer_id UUID := p_customer_id;
  v_assignment RECORD;
  v_trainer RECORD;
  v_user RECORD;
BEGIN
  -- If p_customer_id is null, resolve from authenticated session
  IF v_customer_id IS NULL THEN
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE user_id = auth.uid()
    LIMIT 1;
  ELSE
    -- If p_customer_id is provided, verify caller is staff OR the matching customer
    IF NOT (
      public.powerplus_is_staff(FALSE)
      OR EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer_id AND user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Cannot view another member''s trainer assignment.';
    END IF;
  END IF;

  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object('has_active_trainer', FALSE);
  END IF;

  -- Find active assignment
  SELECT * INTO v_assignment
  FROM public.trainer_assignments
  WHERE customer_id = v_customer_id AND status = 'ACTIVE'
  ORDER BY start_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_active_trainer', FALSE);
  END IF;

  -- Find trainer profile
  SELECT * INTO v_trainer
  FROM public.trainer_profiles
  WHERE id = v_assignment.trainer_id;

  -- Find trainer user
  SELECT * INTO v_user
  FROM public.users
  WHERE id = v_trainer.user_id;

  RETURN jsonb_build_object(
    'has_active_trainer', TRUE,
    'assignment_id', v_assignment.id,
    'customer_id', v_customer_id,
    'trainer_id', v_trainer.id,
    'full_name', trim(COALESCE(v_trainer.first_name, '') || ' ' || COALESCE(v_trainer.last_name, '')),
    'first_name', v_trainer.first_name,
    'last_name', v_trainer.last_name,
    'phone', COALESCE(v_trainer.phone, ''),
    'email', v_user.email,
    'login_id', v_user.login_id,
    'specialization', COALESCE(v_trainer.specialization, 'Personal Fitness Trainer'),
    'status', v_assignment.status,
    'start_date', v_assignment.start_date,
    'end_date', v_assignment.end_date,
    'monthly_fee', COALESCE(v_assignment.monthly_fee_at_assignment, 0),
    'notes', v_assignment.notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_active_trainer(UUID) TO anon, authenticated, service_role;

-- 5. Function: get_customer_my_trainer_bundle
CREATE OR REPLACE FUNCTION public.get_customer_my_trainer_bundle(p_customer_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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

  -- 1. Workout Plans for this customer
  SELECT COALESCE(jsonb_agg(wp ORDER BY (wp->>'created_at') DESC), '[]'::jsonb)
  INTO v_workout_plans
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'customer_id', p.customer_id,
      'trainer_id', p.trainer_id,
      'title', p.title,
      'description', p.description,
      'start_date', p.start_date,
      'end_date', p.end_date,
      'status', p.status,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'exercises', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', e.id,
          'day_of_week', e.day_of_week,
          'exercise_name', e.exercise_name,
          'sets', e.sets,
          'reps', e.reps,
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

COMMIT;
