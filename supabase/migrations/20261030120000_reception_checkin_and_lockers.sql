-- ============================================================================
-- PowerPlus Gym: Reception Dashboard Integration (Check-in & Lockers)
-- Migration: 20261030120000_reception_checkin_and_lockers.sql
-- Enables receptionist attendance check-in, visual locker inventory management,
-- customer assignment with gender validation, and locker return tracking.
-- Idempotent, non-destructive, and compliant with existing Supabase RLS.
-- ============================================================================

BEGIN;

-- 1. Ensure Attendance RLS permits receptionist recording -------------------

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Allow receptionists/staff to select attendance records
DROP POLICY IF EXISTS attendance_staff_select ON public.attendance;
CREATE POLICY attendance_staff_select ON public.attendance
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = attendance.customer_id AND c.user_id = auth.uid()
    )
  );

-- Allow receptionists/staff to insert check-in records
DROP POLICY IF EXISTS attendance_staff_insert ON public.attendance;
CREATE POLICY attendance_staff_insert ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id AND c.user_id = auth.uid()
    )
  );

-- 2. Ensure Lockers & Locker Assignments RLS policies for reception ----------

ALTER TABLE public.lockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locker_assignments ENABLE ROW LEVEL SECURITY;

-- Allow staff to select all locker records
DROP POLICY IF EXISTS lockers_staff_select ON public.lockers;
CREATE POLICY lockers_staff_select ON public.lockers
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.locker_assignments la
      JOIN public.customers c ON c.id = la.customer_id
      WHERE la.locker_id = lockers.id AND la.status = 'active' AND c.user_id = auth.uid()
    )
  );

-- Allow staff to update locker status (AVAILABLE <-> IN_USE)
DROP POLICY IF EXISTS lockers_staff_update ON public.lockers;
CREATE POLICY lockers_staff_update ON public.lockers
  FOR UPDATE TO authenticated
  USING (public.powerplus_is_staff(FALSE))
  WITH CHECK (public.powerplus_is_staff(FALSE));

-- Allow staff to insert new locker assignments
DROP POLICY IF EXISTS locker_assignments_staff_insert ON public.locker_assignments;
CREATE POLICY locker_assignments_staff_insert ON public.locker_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.powerplus_is_staff(FALSE));

-- Allow staff to update assignments (e.g. mark returned)
DROP POLICY IF EXISTS locker_assignments_staff_update ON public.locker_assignments;
CREATE POLICY locker_assignments_staff_update ON public.locker_assignments
  FOR UPDATE TO authenticated
  USING (public.powerplus_is_staff(FALSE))
  WITH CHECK (public.powerplus_is_staff(FALSE));

-- Allow staff or customer to select their own assignments
DROP POLICY IF EXISTS locker_assignments_staff_select ON public.locker_assignments;
CREATE POLICY locker_assignments_staff_select ON public.locker_assignments
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = locker_assignments.customer_id AND c.user_id = auth.uid()
    )
  );

-- 3. Concurrency Guards: Unique indexes on active assignments ---------------

-- A locker can have at most ONE active customer
CREATE UNIQUE INDEX IF NOT EXISTS uidx_locker_assignments_active_locker
  ON public.locker_assignments (locker_id)
  WHERE status = 'active';

-- A customer can have at most ONE active locker
CREATE UNIQUE INDEX IF NOT EXISTS uidx_locker_assignments_active_customer
  ON public.locker_assignments (customer_id)
  WHERE status = 'active';

-- 4. Initial Locker Inventory Seed (idempotent, only inserts missing) ---------

INSERT INTO public.lockers (locker_number, location, key_number, status, active, notes)
VALUES
  -- Men's Locker Room
  ('M-01', 'Men', 'K-M01', 'AVAILABLE', true, 'Top tier'),
  ('M-02', 'Men', 'K-M02', 'AVAILABLE', true, 'Top tier'),
  ('M-03', 'Men', 'K-M03', 'AVAILABLE', true, 'Top tier'),
  ('M-04', 'Men', 'K-M04', 'AVAILABLE', true, 'Top tier'),
  ('M-05', 'Men', 'K-M05', 'AVAILABLE', true, 'Bottom tier'),
  ('M-06', 'Men', 'K-M06', 'AVAILABLE', true, 'Bottom tier'),
  ('M-07', 'Men', 'K-M07', 'AVAILABLE', true, 'Bottom tier'),
  ('M-08', 'Men', 'K-M08', 'AVAILABLE', true, 'Bottom tier'),
  ('M-09', 'Men', 'K-M09', 'AVAILABLE', true, 'Corner unit'),
  ('M-10', 'Men', 'K-M10', 'AVAILABLE', true, 'Corner unit'),
  ('M-11', 'Men', 'K-M11', 'AVAILABLE', true, 'Standard'),
  ('M-12', 'Men', 'K-M12', 'AVAILABLE', true, 'Standard'),

  -- Women's Locker Room
  ('W-01', 'Women', 'K-W01', 'AVAILABLE', true, 'Top tier'),
  ('W-02', 'Women', 'K-W02', 'AVAILABLE', true, 'Top tier'),
  ('W-03', 'Women', 'K-W03', 'AVAILABLE', true, 'Top tier'),
  ('W-04', 'Women', 'K-W04', 'AVAILABLE', true, 'Top tier'),
  ('W-05', 'Women', 'K-W05', 'AVAILABLE', true, 'Bottom tier'),
  ('W-06', 'Women', 'K-W06', 'AVAILABLE', true, 'Bottom tier'),
  ('W-07', 'Women', 'K-W07', 'AVAILABLE', true, 'Bottom tier'),
  ('W-08', 'Women', 'K-W08', 'AVAILABLE', true, 'Bottom tier'),
  ('W-09', 'Women', 'K-W09', 'AVAILABLE', true, 'Corner unit'),
  ('W-10', 'Women', 'K-W10', 'AVAILABLE', true, 'Corner unit'),
  ('W-11', 'Women', 'K-W11', 'AVAILABLE', true, 'Standard'),
  ('W-12', 'Women', 'K-W12', 'AVAILABLE', true, 'Standard')
ON CONFLICT DO NOTHING;

-- 5. Safe Atomic Stored Procedures for Reception Workflows -------------------

-- Atomic Reception Check-in with Duplicate Prevention
CREATE OR REPLACE FUNCTION public.record_reception_checkin(
  p_customer_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_is_override BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attendance_id UUID;
  v_status TEXT;
  v_customer_type TEXT;
  v_end_date DATE;
  v_today_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'Africa/Addis_Ababa');
BEGIN
  -- Verify staff authorization
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Reception staff authorization required';
  END IF;

  -- Verify customer exists and get status
  SELECT status, customer_type INTO v_status, v_customer_type
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found in database';
  END IF;

  IF upper(v_status) = 'BLOCKED' THEN
    RAISE EXCEPTION 'Customer account is blocked by management';
  END IF;

  -- Check membership expiration
  SELECT max(end_date) INTO v_end_date
  FROM public.memberships
  WHERE customer_id = p_customer_id AND upper(status) = 'ACTIVE';

  IF (v_end_date IS NULL OR v_end_date < CURRENT_DATE) AND NOT p_is_override THEN
    RAISE EXCEPTION 'Customer membership is expired or inactive; receptionist override required';
  END IF;

  -- Prevent duplicate check-in today
  IF EXISTS (
    SELECT 1 FROM public.attendance
    WHERE customer_id = p_customer_id
      AND checked_in_at >= v_today_start
  ) THEN
    RAISE EXCEPTION 'Customer has already checked in today';
  END IF;

  -- Record attendance
  INSERT INTO public.attendance (
    customer_id,
    checked_in_at,
    check_in_method,
    notes,
    recorded_by
  )
  VALUES (
    p_customer_id,
    now(),
    'RECEPTION',
    coalesce(p_notes, 'Reception check-in'),
    auth.uid()
  )
  RETURNING id INTO v_attendance_id;

  RETURN v_attendance_id;
END;
$$;

-- Atomic Locker Assignment with Gender and Availability Enforcement
CREATE OR REPLACE FUNCTION public.assign_locker(
  p_locker_id UUID,
  p_customer_id UUID,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locker RECORD;
  v_customer RECORD;
  v_assignment_id UUID;
  v_room_normalized TEXT;
  v_gender_normalized TEXT;
BEGIN
  -- Verify staff authorization
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Reception staff authorization required';
  END IF;

  -- Lock and verify locker availability
  SELECT * INTO v_locker
  FROM public.lockers
  WHERE id = p_locker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locker not found';
  END IF;

  IF v_locker.status <> 'AVAILABLE' OR NOT coalesce(v_locker.active, true) THEN
    RAISE EXCEPTION 'Locker is no longer available';
  END IF;

  -- Verify customer
  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  -- Gender eligibility check
  v_room_normalized := lower(trim(coalesce(v_locker.location, '')));
  v_gender_normalized := lower(trim(coalesce(v_customer.gender, '')));

  IF v_gender_normalized = '' THEN
    RAISE EXCEPTION 'Customer gender information is missing from their profile; unsafe assignment prevented';
  END IF;

  IF v_room_normalized LIKE '%men%' AND v_room_normalized NOT LIKE '%women%' THEN
    IF v_gender_normalized NOT IN ('male', 'm') THEN
      RAISE EXCEPTION 'Ineligible assignment: Female customers cannot be assigned to Men''s Locker Room';
    END IF;
  ELSIF v_room_normalized LIKE '%women%' THEN
    IF v_gender_normalized NOT IN ('female', 'f') THEN
      RAISE EXCEPTION 'Ineligible assignment: Male customers cannot be assigned to Women''s Locker Room';
    END IF;
  END IF;

  -- Verify customer does not already have an active assignment
  IF EXISTS (
    SELECT 1 FROM public.locker_assignments
    WHERE customer_id = p_customer_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Customer already has an active locker assignment; a customer cannot have multiple active lockers';
  END IF;

  -- Insert assignment record
  INSERT INTO public.locker_assignments (
    locker_id,
    customer_id,
    assigned_at,
    due_date,
    status,
    assigned_by,
    notes
  )
  VALUES (
    p_locker_id,
    p_customer_id,
    now(),
    p_due_date,
    'active',
    auth.uid()::text,
    coalesce(p_notes, '')
  )
  RETURNING id INTO v_assignment_id;

  -- Update locker status to IN_USE
  UPDATE public.lockers
  SET status = 'IN_USE'
  WHERE id = p_locker_id;

  RETURN v_assignment_id;
END;
$$;

-- Atomic Locker Return Recording
CREATE OR REPLACE FUNCTION public.return_locker(
  p_assignment_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
BEGIN
  -- Verify staff authorization
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Reception staff authorization required';
  END IF;

  -- Lock and verify assignment
  SELECT * INTO v_assignment
  FROM public.locker_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND OR v_assignment.status <> 'active' THEN
    RAISE EXCEPTION 'Active locker assignment not found';
  END IF;

  -- Close active assignment
  UPDATE public.locker_assignments
  SET
    status = 'returned',
    returned_at = now(),
    returned_by = auth.uid()::text,
    notes = CASE
      WHEN p_notes IS NOT NULL AND trim(p_notes) <> ''
      THEN coalesce(notes || ' | ', '') || 'Return note: ' || trim(p_notes)
      ELSE notes
    END
  WHERE id = p_assignment_id;

  -- Mark locker AVAILABLE
  UPDATE public.lockers
  SET status = 'AVAILABLE'
  WHERE id = v_assignment.locker_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reception_checkin(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_locker(UUID, UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_locker(UUID, TEXT) TO authenticated;

COMMIT;
