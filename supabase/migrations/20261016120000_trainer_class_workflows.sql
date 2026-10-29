-- Secure, database-backed trainer workflows for the existing class schema.
-- Additive only: no tables or historical rows are dropped or recreated.

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS class_booking_id UUID
    REFERENCES public.class_bookings(id) ON DELETE SET NULL;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_class_booking_uidx
  ON public.attendance (class_booking_id) WHERE class_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS class_schedules_trainer_start_at_idx
  ON public.class_schedules (trainer_id, start_at);
CREATE INDEX IF NOT EXISTS class_bookings_schedule_idx
  ON public.class_bookings (class_schedule_id);
CREATE INDEX IF NOT EXISTS attendance_customer_checkin_idx
  ON public.attendance (customer_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx
  ON public.audit_logs (actor_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_session_trainer(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.trainer_profiles tp ON tp.user_id = u.id
    JOIN public.aerobics_sessions s ON s.trainer_id = tp.id OR s.instructor_user_id = u.id
    WHERE u.id = auth.uid() AND u.role = 'TRAINER' AND u.is_active = TRUE AND tp.is_active = TRUE
      AND s.id = p_session_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_authorized_trainer_for_customer(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.trainer_profiles tp ON tp.user_id = u.id
    JOIN public.aerobics_sessions s ON (s.trainer_id = tp.id OR s.instructor_user_id = u.id)
    JOIN public.customers c ON c.aerobics_group_id = s.id
    WHERE u.id = auth.uid() AND u.role = 'TRAINER' AND u.is_active = TRUE AND tp.is_active = TRUE
      AND c.id = p_customer_id
  ) OR EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.trainer_profiles tp ON tp.user_id = u.id
    JOIN public.class_schedules s ON s.trainer_id = tp.id
    JOIN public.class_bookings b ON b.class_schedule_id = s.id
    WHERE u.id = auth.uid() AND u.role = 'TRAINER' AND u.is_active = TRUE AND tp.is_active = TRUE
      AND b.customer_id = p_customer_id AND upper(COALESCE(b.status, 'BOOKED')) NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
  );
$$;

REVOKE ALL ON FUNCTION public.is_session_trainer(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_authorized_trainer_for_customer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_session_trainer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_authorized_trainer_for_customer(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.trainer_portal_profile_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE v_profile_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT tp.id INTO v_profile_id
  FROM public.users u
  JOIN public.trainer_profiles tp ON tp.user_id = u.id
  WHERE u.id = auth.uid() AND u.role = 'TRAINER' AND u.is_active = TRUE AND tp.is_active = TRUE;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'An active trainer account is required'; END IF;
  RETURN v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trainer_portal_dashboard(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE v_profile_id UUID; v_result JSONB;
BEGIN
  v_profile_id := public.trainer_portal_profile_id();
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > INTERVAL '90 days' THEN
    RAISE EXCEPTION 'Invalid schedule date range';
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', tp.id, 'userId', tp.user_id, 'firstName', tp.first_name, 'lastName', tp.last_name,
      'phone', tp.phone, 'specialization', tp.specialization, 'isActive', tp.is_active, 'email', u.email
    ),
    'schedules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'classId', s.class_id, 'name', c.name, 'description', c.description,
        'startAt', s.start_at, 'endAt', s.end_at, 'status', COALESCE(s.status, 'SCHEDULED'),
        'capacity', COALESCE(s.capacity, c.capacity),
        'enrolledCount', (SELECT count(*) FROM public.class_bookings b
          WHERE b.class_schedule_id = s.id AND upper(COALESCE(b.status, 'BOOKED')) NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')),
        'attendanceCount', (SELECT count(*) FROM public.attendance a
          JOIN public.class_bookings b ON b.id = a.class_booking_id
          WHERE b.class_schedule_id = s.id)
      ) ORDER BY s.start_at)
      FROM public.class_schedules s
      JOIN public.classes c ON c.id = s.class_id
      WHERE s.trainer_id = tp.id AND s.start_at >= p_from AND s.start_at < p_to
    ), '[]'::jsonb),
    'activeTrainees', (SELECT count(DISTINCT b.customer_id)
      FROM public.class_schedules s JOIN public.class_bookings b ON b.class_schedule_id = s.id
      WHERE s.trainer_id = tp.id AND s.start_at >= p_from AND s.start_at < p_to
        AND upper(COALESCE(b.status, 'BOOKED')) NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')),
    'trainees', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'bookingId', b.id, 'customerId', c.id, 'customerCode', c.customer_code,
      'firstName', c.first_name, 'lastName', c.last_name,
      'fullName', trim(concat_ws(' ', c.first_name, c.last_name)),
      'bookingStatus', COALESCE(b.status, 'BOOKED'), 'sessionId', s.id, 'sessionName', cl.name,
      'membershipStartDate', m.start_date, 'membershipEndDate', m.end_date,
      'membershipValid', COALESCE(m.start_date <= CURRENT_DATE AND m.end_date >= CURRENT_DATE
        AND upper(COALESCE(m.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'SUSPENDED', 'BLOCKED'), FALSE)
    ) ORDER BY c.last_name, c.first_name)
      FROM public.class_schedules s
      JOIN public.classes cl ON cl.id = s.class_id
      JOIN public.class_bookings b ON b.class_schedule_id = s.id
      JOIN public.customers c ON c.id = b.customer_id
      LEFT JOIN LATERAL (SELECT mb.start_date, mb.end_date, mb.status FROM public.memberships mb
        WHERE mb.customer_id = c.id ORDER BY mb.end_date DESC NULLS LAST LIMIT 1) m ON TRUE
      WHERE s.trainer_id = tp.id AND s.start_at >= p_from AND s.start_at < p_to
        AND upper(COALESCE(b.status, 'BOOKED')) NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')), '[]'::jsonb),
    'attendanceCount', (SELECT count(*) FROM public.attendance a
      JOIN public.class_bookings b ON b.id = a.class_booking_id
      JOIN public.class_schedules s ON s.id = b.class_schedule_id
      WHERE s.trainer_id = tp.id AND s.start_at >= p_from AND s.start_at < p_to),
    'weeklyHours', COALESCE((SELECT round((sum(extract(epoch FROM (s.end_at - s.start_at))) / 3600)::numeric, 1)
      FROM public.class_schedules s WHERE s.trainer_id = tp.id AND s.start_at >= p_from AND s.start_at < p_to), 0)
  ) INTO v_result
  FROM public.trainer_profiles tp JOIN public.users u ON u.id = tp.user_id
  WHERE tp.id = v_profile_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.trainer_portal_roster(p_schedule_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE v_profile_id UUID; v_result JSONB;
BEGIN
  v_profile_id := public.trainer_portal_profile_id();
  IF NOT EXISTS (SELECT 1 FROM public.class_schedules WHERE id = p_schedule_id AND trainer_id = v_profile_id) THEN
    RAISE EXCEPTION 'Schedule not found or not assigned to this trainer';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bookingId', b.id, 'customerId', c.id, 'customerCode', c.customer_code,
    'firstName', c.first_name, 'lastName', c.last_name,
    'fullName', trim(concat_ws(' ', c.first_name, c.last_name)),
    'customerStatus', c.status, 'bookingStatus', COALESCE(b.status, 'BOOKED'), 'bookedAt', b.booked_at,
    'membershipStartDate', m.start_date, 'membershipEndDate', m.end_date,
    'membershipValid', COALESCE(m.start_date <= CURRENT_DATE AND m.end_date >= CURRENT_DATE
      AND upper(COALESCE(m.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'SUSPENDED', 'BLOCKED'), FALSE),
    'checkedInAt', a.checked_in_at, 'attendanceId', a.id
  ) ORDER BY c.last_name, c.first_name), '[]'::jsonb)
  INTO v_result
  FROM public.class_bookings b
  JOIN public.customers c ON c.id = b.customer_id
  LEFT JOIN LATERAL (
    SELECT mb.start_date, mb.end_date, mb.status FROM public.memberships mb
    WHERE mb.customer_id = c.id ORDER BY mb.end_date DESC NULLS LAST LIMIT 1
  ) m ON TRUE
  LEFT JOIN public.attendance a ON a.class_booking_id = b.id
  WHERE b.class_schedule_id = p_schedule_id
    AND upper(COALESCE(b.status, 'BOOKED')) NOT IN ('CANCELLED', 'CANCELED', 'REJECTED');
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.trainer_update_own_profile(
  p_first_name TEXT, p_last_name TEXT, p_phone TEXT, p_specialization TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE v_profile_id UUID; v_result JSONB;
BEGIN
  v_profile_id := public.trainer_portal_profile_id();
  IF length(trim(COALESCE(p_first_name, ''))) NOT BETWEEN 1 AND 100
     OR length(trim(COALESCE(p_last_name, ''))) NOT BETWEEN 1 AND 100
     OR length(trim(COALESCE(p_phone, ''))) > 40
     OR length(trim(COALESCE(p_specialization, ''))) > 200 THEN
    RAISE EXCEPTION 'Invalid trainer profile values';
  END IF;
  UPDATE public.trainer_profiles SET first_name = trim(p_first_name), last_name = trim(p_last_name),
    phone = nullif(trim(COALESCE(p_phone, '')), ''), specialization = nullif(trim(COALESCE(p_specialization, '')), '')
  WHERE id = v_profile_id;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_user_id)
  VALUES ('TRAINER_PROFILE_UPDATED', 'trainer_profile', v_profile_id, auth.uid());
  SELECT jsonb_build_object('id', tp.id, 'userId', tp.user_id, 'firstName', tp.first_name, 'lastName', tp.last_name,
    'phone', tp.phone, 'specialization', tp.specialization, 'isActive', tp.is_active, 'email', u.email)
    INTO v_result FROM public.trainer_profiles tp JOIN public.users u ON u.id = tp.user_id WHERE tp.id = v_profile_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.trainer_cancel_own_schedule(p_schedule_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE v_profile_id UUID; v_status TEXT;
BEGIN
  v_profile_id := public.trainer_portal_profile_id();
  SELECT status INTO v_status FROM public.class_schedules
    WHERE id = p_schedule_id AND trainer_id = v_profile_id AND start_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Future schedule not found or not assigned to this trainer'; END IF;
  IF upper(v_status) IN ('CANCELLED', 'CANCELED') THEN RETURN v_status; END IF;
  IF upper(v_status) IN ('COMPLETED', 'FINISHED') THEN RAISE EXCEPTION 'Completed schedules cannot be cancelled'; END IF;
  UPDATE public.class_schedules SET status = 'CANCELLED'
    WHERE id = p_schedule_id AND trainer_id = v_profile_id;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_user_id)
  VALUES ('TRAINER_SCHEDULE_CANCELLED', 'class_schedule', p_schedule_id, auth.uid());
  RETURN 'CANCELLED';
END;
$$;

CREATE OR REPLACE FUNCTION public.trainer_record_class_attendance(p_booking_id UUID, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE v_profile_id UUID; v_booking public.class_bookings%ROWTYPE; v_customer public.customers%ROWTYPE;
  v_schedule_id UUID; v_attendance_id UUID; v_checked_in_at TIMESTAMPTZ; v_target TEXT;
BEGIN
  v_profile_id := public.trainer_portal_profile_id();
  v_target := upper(trim(COALESCE(p_status, '')));
  IF v_target NOT IN ('ATTENDED', 'NO_SHOW') THEN RAISE EXCEPTION 'Attendance must be ATTENDED or NO_SHOW'; END IF;
  SELECT b.* INTO v_booking FROM public.class_bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class booking not found'; END IF;
  SELECT s.id INTO v_schedule_id FROM public.class_schedules s
    WHERE s.id = v_booking.class_schedule_id AND s.trainer_id = v_profile_id;
  IF v_schedule_id IS NULL THEN RAISE EXCEPTION 'Booking is not in a schedule assigned to this trainer'; END IF;
  SELECT id, checked_in_at INTO v_attendance_id, v_checked_in_at
    FROM public.attendance WHERE class_booking_id = p_booking_id;
  IF upper(v_booking.status) IN ('CANCELLED', 'CANCELED', 'REJECTED') THEN
    RAISE EXCEPTION 'Cancelled bookings cannot receive attendance';
  END IF;
  IF upper(v_booking.status) IN ('ATTENDED', 'NO_SHOW') THEN
    IF upper(v_booking.status) = v_target THEN
      RETURN jsonb_build_object('bookingId', p_booking_id, 'attendanceId', v_attendance_id,
        'status', v_target, 'checkedInAt', v_checked_in_at, 'replayed', TRUE);
    END IF;
    RAISE EXCEPTION 'Attendance has already been finalized for this booking';
  END IF;

  SELECT * INTO v_customer FROM public.customers WHERE id = v_booking.customer_id;
  IF upper(COALESCE(v_customer.status, '')) IN ('BLOCKED', 'SUSPENDED') THEN
    RAISE EXCEPTION 'Blocked or suspended customers cannot be checked in';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.customer_id = v_customer.id
    AND m.start_date <= CURRENT_DATE AND m.end_date >= CURRENT_DATE
    AND upper(COALESCE(m.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'SUSPENDED', 'BLOCKED')) THEN
    RAISE EXCEPTION 'Customer does not have a currently valid membership';
  END IF;

  UPDATE public.class_bookings SET status = v_target WHERE id = p_booking_id;
  IF v_target = 'ATTENDED' THEN
    INSERT INTO public.attendance (class_booking_id, customer_id, checked_in_at, check_in_method, recorded_by, notes)
    VALUES (p_booking_id, v_customer.id, now(), 'MANUAL', auth.uid(), 'Trainer class attendance')
    ON CONFLICT (class_booking_id) WHERE class_booking_id IS NOT NULL DO NOTHING;
    SELECT id, checked_in_at INTO v_attendance_id, v_checked_in_at
      FROM public.attendance WHERE class_booking_id = p_booking_id;
  END IF;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_user_id)
  VALUES ('CLASS_BOOKING_' || v_target, 'class_booking', p_booking_id, auth.uid());
  RETURN jsonb_build_object('bookingId', p_booking_id, 'attendanceId', v_attendance_id,
    'status', v_target, 'checkedInAt', v_checked_in_at, 'replayed', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_trainer_note_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_user_id)
  VALUES ('TRAINER_COACHING_NOTE_CREATED', 'trainer_coaching_note', NEW.id, NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trainer_note_audit_insert ON public.trainer_coaching_notes;
CREATE TRIGGER trainer_note_audit_insert
  AFTER INSERT ON public.trainer_coaching_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_note_creation();

REVOKE ALL ON FUNCTION public.trainer_portal_profile_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_portal_dashboard(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_portal_roster(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_update_own_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_cancel_own_schedule(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_record_class_attendance(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_trainer_note_creation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_portal_dashboard(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_portal_roster(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_update_own_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_cancel_own_schedule(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_record_class_attendance(UUID, TEXT) TO authenticated;

