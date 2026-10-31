-- ============================================================================
-- Migration: 20261030130000_fix_reception_checkin_and_lockers.sql
-- Fixes Reception Check-in attendance recording and Locker visual inventory,
-- management (Add/Edit/Delete), assignment, and return tracking.
-- ============================================================================

BEGIN;

-- 1. Table Grants to authenticated --------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lockers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locker_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.attendance TO authenticated;
GRANT SELECT ON public.customers TO authenticated;
GRANT SELECT ON public.memberships TO authenticated;
GRANT SELECT ON public.plans TO authenticated;

-- 2. RLS on public.attendance -------------------------------------------------
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_staff_select ON public.attendance;
DROP POLICY IF EXISTS attendance_staff_or_customer_read ON public.attendance;
CREATE POLICY attendance_staff_select ON public.attendance
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = attendance.customer_id AND c.user_id = auth.uid()
    )
  );

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

-- 3. RLS on public.lockers ----------------------------------------------------
ALTER TABLE public.lockers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lockers_staff_and_member_read ON public.lockers;
DROP POLICY IF EXISTS lockers_member_assigned_read ON public.lockers;
DROP POLICY IF EXISTS lockers_authorized_read ON public.lockers;
DROP POLICY IF EXISTS lockers_staff_select ON public.lockers;
CREATE POLICY lockers_staff_and_member_read ON public.lockers
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.locker_assignments la
      JOIN public.customers c ON c.id = la.customer_id
      WHERE la.locker_id = lockers.id AND la.status = 'ACTIVE' AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lockers_staff_insert ON public.lockers;
CREATE POLICY lockers_staff_insert ON public.lockers
  FOR INSERT TO authenticated
  WITH CHECK (public.powerplus_is_staff(FALSE));

DROP POLICY IF EXISTS lockers_staff_update ON public.lockers;
CREATE POLICY lockers_staff_update ON public.lockers
  FOR UPDATE TO authenticated
  USING (public.powerplus_is_staff(FALSE))
  WITH CHECK (public.powerplus_is_staff(FALSE));

DROP POLICY IF EXISTS lockers_staff_delete ON public.lockers;
CREATE POLICY lockers_staff_delete ON public.lockers
  FOR DELETE TO authenticated
  USING (public.powerplus_is_staff(FALSE));

-- 4. RLS on public.locker_assignments -----------------------------------------
ALTER TABLE public.locker_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS locker_assignments_staff_select ON public.locker_assignments;
DROP POLICY IF EXISTS locker_assignments_member_read ON public.locker_assignments;
CREATE POLICY locker_assignments_staff_select ON public.locker_assignments
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = locker_assignments.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS locker_assignments_staff_insert ON public.locker_assignments;
CREATE POLICY locker_assignments_staff_insert ON public.locker_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.powerplus_is_staff(FALSE));

DROP POLICY IF EXISTS locker_assignments_staff_update ON public.locker_assignments;
CREATE POLICY locker_assignments_staff_update ON public.locker_assignments
  FOR UPDATE TO authenticated
  USING (public.powerplus_is_staff(FALSE))
  WITH CHECK (public.powerplus_is_staff(FALSE));

-- 5. Concurrency Safeguards: Unique active assignments ------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uidx_locker_assignments_active_locker
  ON public.locker_assignments (locker_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS uidx_locker_assignments_active_customer
  ON public.locker_assignments (customer_id)
  WHERE status = 'ACTIVE';

-- 6. Initial Locker Inventory Seed (16 Men + 16 Women) ------------------------
INSERT INTO public.lockers (locker_number, location, key_number, status, active, notes)
VALUES
  -- Men's Lockers
  ('M-01', 'Men', 'K-M01', 'AVAILABLE', true, 'Row 1 Top'),
  ('M-02', 'Men', 'K-M02', 'AVAILABLE', true, 'Row 1 Top'),
  ('M-03', 'Men', 'K-M03', 'AVAILABLE', true, 'Row 1 Top'),
  ('M-04', 'Men', 'K-M04', 'AVAILABLE', true, 'Row 1 Top'),
  ('M-05', 'Men', 'K-M05', 'AVAILABLE', true, 'Row 2 Bottom'),
  ('M-06', 'Men', 'K-M06', 'AVAILABLE', true, 'Row 2 Bottom'),
  ('M-07', 'Men', 'K-M07', 'AVAILABLE', true, 'Row 2 Bottom'),
  ('M-08', 'Men', 'K-M08', 'AVAILABLE', true, 'Row 2 Bottom'),
  ('M-09', 'Men', 'K-M09', 'AVAILABLE', true, 'Row 3 Top'),
  ('M-10', 'Men', 'K-M10', 'AVAILABLE', true, 'Row 3 Top'),
  ('M-11', 'Men', 'K-M11', 'AVAILABLE', true, 'Row 3 Top'),
  ('M-12', 'Men', 'K-M12', 'AVAILABLE', true, 'Row 3 Top'),
  ('M-13', 'Men', 'K-M13', 'AVAILABLE', true, 'Row 4 Bottom'),
  ('M-14', 'Men', 'K-M14', 'AVAILABLE', true, 'Row 4 Bottom'),
  ('M-15', 'Men', 'K-M15', 'AVAILABLE', true, 'Row 4 Bottom'),
  ('M-16', 'Men', 'K-M16', 'AVAILABLE', true, 'Row 4 Bottom'),

  -- Women's Lockers
  ('W-01', 'Women', 'K-W01', 'AVAILABLE', true, 'Row 1 Top'),
  ('W-02', 'Women', 'K-W02', 'AVAILABLE', true, 'Row 1 Top'),
  ('W-03', 'Women', 'K-W03', 'AVAILABLE', true, 'Row 1 Top'),
  ('W-04', 'Women', 'K-W04', 'AVAILABLE', true, 'Row 1 Top'),
  ('W-05', 'Women', 'K-W05', 'AVAILABLE', true, 'Row 2 Bottom'),
  ('W-06', 'Women', 'K-W06', 'AVAILABLE', true, 'Row 2 Bottom'),
  ('W-07', 'Women', 'K-W07', 'AVAILABLE', true, 'Row 2 Bottom'),
  ('W-08', 'Women', 'K-W08', 'AVAILABLE', true, 'Row 2 Bottom'),
  ('W-09', 'Women', 'K-W09', 'AVAILABLE', true, 'Row 3 Top'),
  ('W-10', 'Women', 'K-W10', 'AVAILABLE', true, 'Row 3 Top'),
  ('W-11', 'Women', 'K-W11', 'AVAILABLE', true, 'Row 3 Top'),
  ('W-12', 'Women', 'K-W12', 'AVAILABLE', true, 'Row 3 Top'),
  ('W-13', 'Women', 'K-W13', 'AVAILABLE', true, 'Row 4 Bottom'),
  ('W-14', 'Women', 'K-W14', 'AVAILABLE', true, 'Row 4 Bottom'),
  ('W-15', 'Women', 'K-W15', 'AVAILABLE', true, 'Row 4 Bottom'),
  ('W-16', 'Women', 'K-W16', 'AVAILABLE', true, 'Row 4 Bottom')
ON CONFLICT (locker_number) DO UPDATE
SET location = EXCLUDED.location,
    key_number = COALESCE(lockers.key_number, EXCLUDED.key_number),
    active = true;

-- 7. Atomic Stored Procedures -------------------------------------------------

-- 7.1 Record Reception Check-in
CREATE OR REPLACE FUNCTION public.record_reception_checkin(
  p_customer_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_is_override BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_status VARCHAR;
  v_customer_code VARCHAR;
  v_customer_name TEXT;
  v_has_active_membership BOOLEAN;
  v_already_checked_in BOOLEAN;
  v_attendance_id UUID;
  v_today_start TIMESTAMPTZ;
BEGIN
  -- Verify receptionist authorization
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Reception staff access required.';
  END IF;

  -- 1. Check customer existence
  SELECT status, customer_code, btrim(first_name || ' ' || last_name)
  INTO v_customer_status, v_customer_code, v_customer_name
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found (ID: %)', p_customer_id;
  END IF;

  IF v_customer_status = 'BLOCKED' THEN
    RAISE EXCEPTION 'Customer % (%) is BLOCKED by management.', v_customer_name, v_customer_code;
  END IF;

  -- 2. Duplicate check for today (UTC+3 business day)
  v_today_start := date_trunc('day', timezone('Africa/Addis_Ababa', now()));

  SELECT EXISTS (
    SELECT 1 FROM public.attendance
    WHERE customer_id = p_customer_id
      AND timezone('Africa/Addis_Ababa', checked_in_at) >= v_today_start
  ) INTO v_already_checked_in;

  IF v_already_checked_in THEN
    RAISE EXCEPTION 'Duplicate check-in: Customer % has already checked in today.', v_customer_name;
  END IF;

  -- 3. Membership status check
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE customer_id = p_customer_id
      AND status = 'ACTIVE'
      AND end_date >= CURRENT_DATE
  ) INTO v_has_active_membership;

  IF NOT v_has_active_membership AND NOT p_is_override THEN
    RAISE EXCEPTION 'Membership expired or inactive for customer %. Reception override required.', v_customer_name;
  END IF;

  -- 4. Record attendance
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
    'MANUAL',
    COALESCE(p_notes, CASE WHEN p_is_override THEN 'Reception Override' ELSE 'Reception Check-in' END),
    auth.uid()
  )
  RETURNING id INTO v_attendance_id;

  RETURN v_attendance_id;
END;
$$;

-- 7.2 Assign Locker
CREATE OR REPLACE FUNCTION public.assign_locker(
  p_locker_id UUID,
  p_customer_id UUID,
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_locker RECORD;
  v_customer RECORD;
  v_assignment_id UUID;
  v_gender TEXT;
  v_room TEXT;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Reception staff access required.';
  END IF;

  -- Lock row for concurrency safety
  SELECT id, locker_number, location, status, active
  INTO v_locker
  FROM public.lockers
  WHERE id = p_locker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locker not found.';
  END IF;

  IF v_locker.status <> 'AVAILABLE' OR NOT v_locker.active THEN
    RAISE EXCEPTION 'Locker % is not available (Status: %).', v_locker.locker_number, v_locker.status;
  END IF;

  -- Validate customer
  SELECT id, first_name, last_name, customer_code, gender, status
  INTO v_customer
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found.';
  END IF;

  -- Check gender eligibility
  v_gender := lower(COALESCE(v_customer.gender, ''));
  v_room := lower(COALESCE(v_locker.location, ''));

  IF v_gender = '' THEN
    RAISE EXCEPTION 'Customer gender is missing in profile. Cannot safely assign locker room.';
  END IF;

  IF v_room = 'men' AND v_gender NOT IN ('male', 'm') THEN
    RAISE EXCEPTION 'Only male customers may be assigned to Men''s Lockers.';
  END IF;

  IF v_room = 'women' AND v_gender NOT IN ('female', 'f') THEN
    RAISE EXCEPTION 'Only female customers may be assigned to Women''s Lockers.';
  END IF;

  -- Ensure customer does not already have an active locker
  IF EXISTS (
    SELECT 1 FROM public.locker_assignments
    WHERE customer_id = p_customer_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Customer % already has an active locker assignment.', v_customer.customer_code;
  END IF;

  -- Insert assignment
  INSERT INTO public.locker_assignments (
    locker_id,
    customer_id,
    assigned_at,
    due_date,
    status,
    notes,
    assigned_by
  )
  VALUES (
    p_locker_id,
    p_customer_id,
    now(),
    p_due_date,
    'ACTIVE',
    p_notes,
    auth.uid()
  )
  RETURNING id INTO v_assignment_id;

  -- Mark locker OCCUPIED
  UPDATE public.lockers
  SET status = 'OCCUPIED',
      updated_at = now()
  WHERE id = p_locker_id;

  RETURN v_assignment_id;
END;
$$;

-- 7.3 Return Locker
CREATE OR REPLACE FUNCTION public.return_locker(
  p_assignment_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_locker_id UUID;
  v_status VARCHAR;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Reception staff access required.';
  END IF;

  SELECT locker_id, status
  INTO v_locker_id, v_status
  FROM public.locker_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locker assignment not found.';
  END IF;

  IF v_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Assignment is already closed (Status: %).', v_status;
  END IF;

  -- Close assignment
  UPDATE public.locker_assignments
  SET status = 'RETURNED',
      returned_at = now(),
      returned_by = auth.uid(),
      notes = CASE WHEN p_notes IS NOT NULL THEN COALESCE(notes, '') || ' | ' || p_notes ELSE notes END
  WHERE id = p_assignment_id;

  -- Release locker back to AVAILABLE
  UPDATE public.lockers
  SET status = 'AVAILABLE',
      updated_at = now()
  WHERE id = v_locker_id;

  RETURN TRUE;
END;
$$;

-- 7.4 Add Locker
CREATE OR REPLACE FUNCTION public.add_gym_locker(
  p_locker_number TEXT,
  p_location TEXT,
  p_key_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_locker_id UUID;
  v_loc VARCHAR;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Reception staff access required.';
  END IF;

  v_loc := CASE WHEN lower(p_location) LIKE 'wom%' THEN 'Women' ELSE 'Men' END;

  IF EXISTS (SELECT 1 FROM public.lockers WHERE locker_number = btrim(p_locker_number)) THEN
    RAISE EXCEPTION 'Locker % already exists.', btrim(p_locker_number);
  END IF;

  INSERT INTO public.lockers (
    locker_number,
    location,
    key_number,
    status,
    active,
    notes,
    created_by
  )
  VALUES (
    btrim(p_locker_number),
    v_loc,
    btrim(p_key_number),
    'AVAILABLE',
    true,
    p_notes,
    auth.uid()
  )
  RETURNING id INTO v_locker_id;

  RETURN v_locker_id;
END;
$$;

-- 7.5 Edit Locker
CREATE OR REPLACE FUNCTION public.edit_gym_locker(
  p_locker_id UUID,
  p_locker_number TEXT,
  p_location TEXT,
  p_key_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cur RECORD;
  v_new_loc VARCHAR;
  v_has_active_assignment BOOLEAN;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Reception staff access required.';
  END IF;

  SELECT * INTO v_cur FROM public.lockers WHERE id = p_locker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locker not found.';
  END IF;

  v_new_loc := CASE WHEN lower(p_location) LIKE 'wom%' THEN 'Women' ELSE 'Men' END;

  -- Check if changing location with active assignment
  SELECT EXISTS (
    SELECT 1 FROM public.locker_assignments
    WHERE locker_id = p_locker_id AND status = 'ACTIVE'
  ) INTO v_has_active_assignment;

  IF v_has_active_assignment AND v_new_loc <> v_cur.location THEN
    RAISE EXCEPTION 'Cannot change locker room while locker has an active customer assignment.';
  END IF;

  UPDATE public.lockers
  SET locker_number = btrim(p_locker_number),
    location = v_new_loc,
    key_number = btrim(p_key_number),
    notes = p_notes,
    updated_at = now()
  WHERE id = p_locker_id;

  RETURN TRUE;
END;
$$;

-- 7.6 Delete Locker
CREATE OR REPLACE FUNCTION public.delete_gym_locker(
  p_locker_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cur RECORD;
  v_has_active BOOLEAN;
  v_has_history BOOLEAN;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Unauthorized: Reception staff access required.';
  END IF;

  SELECT * INTO v_cur FROM public.lockers WHERE id = p_locker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locker not found.';
  END IF;

  IF v_cur.status = 'OCCUPIED' THEN
    RAISE EXCEPTION 'Cannot delete occupied locker %.', v_cur.locker_number;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.locker_assignments
    WHERE locker_id = p_locker_id AND status = 'ACTIVE'
  ) INTO v_has_active;

  IF v_has_active THEN
    RAISE EXCEPTION 'Cannot delete locker with an active assignment.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.locker_assignments
    WHERE locker_id = p_locker_id
  ) INTO v_has_history;

  IF v_has_history THEN
    -- Soft-delete / deactivate to preserve historical audit trail
    UPDATE public.lockers
    SET active = false,
        status = 'MAINTENANCE',
        notes = COALESCE(notes, '') || ' [Archived]',
        updated_at = now()
    WHERE id = p_locker_id;
  ELSE
    -- Physical delete if never used
    DELETE FROM public.lockers WHERE id = p_locker_id;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_reception_checkin(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_reception_checkin(UUID, TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_locker(UUID, UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_locker(UUID, UUID, DATE, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.return_locker(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_locker(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.add_gym_locker(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_gym_locker(TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.edit_gym_locker(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_gym_locker(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_gym_locker(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_gym_locker(UUID) TO authenticated;

COMMIT;
