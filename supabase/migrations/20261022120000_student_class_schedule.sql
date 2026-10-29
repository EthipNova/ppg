-- Expose upcoming class bookings only to the linked Student account.
-- The trainer workflow schema supplies class_bookings, class_schedules, and classes.

DO $$
BEGIN
  IF to_regclass('public.class_bookings') IS NULL
     OR to_regclass('public.class_schedules') IS NULL
     OR to_regclass('public.classes') IS NULL
     OR to_regclass('public.customers') IS NULL THEN
    RAISE EXCEPTION 'Student class schedule requires the existing trainer and customer tables';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_portal_class_schedule()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_customer_id UUID;
  v_profile_count INTEGER;
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Student authentication required';
  END IF;

  SELECT count(*) INTO v_profile_count
  FROM public.customers c
  WHERE c.user_id = auth.uid() AND c.customer_type = 'STUDENT';
  IF v_profile_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDENT_PROFILE_MISSING';
  ELSIF v_profile_count > 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STUDENT_PROFILE_AMBIGUOUS';
  END IF;

  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE c.user_id = auth.uid() AND c.customer_type = 'STUDENT';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', bookings.id,
      'className', bookings.class_name,
      'description', bookings.description,
      'startAt', bookings.start_at,
      'endAt', bookings.end_at,
      'scheduleStatus', bookings.schedule_status,
      'bookingStatus', bookings.booking_status
    ) ORDER BY bookings.start_at
  ), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT b.id, cl.name AS class_name, cl.description, s.start_at, s.end_at,
      COALESCE(s.status, 'SCHEDULED') AS schedule_status,
      COALESCE(b.status, 'BOOKED') AS booking_status
    FROM public.class_bookings b
    JOIN public.class_schedules s ON s.id = b.class_schedule_id
    JOIN public.classes cl ON cl.id = s.class_id
    WHERE b.customer_id = v_customer_id
      AND s.start_at >= now()
      AND s.start_at < now() + INTERVAL '90 days'
      AND upper(COALESCE(s.status, 'SCHEDULED')) NOT IN ('CANCELLED', 'CANCELED')
      AND upper(COALESCE(b.status, 'BOOKED')) NOT IN ('CANCELLED', 'CANCELED', 'REJECTED')
    ORDER BY s.start_at
    LIMIT 50
  ) bookings;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_class_schedule() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_portal_class_schedule() TO authenticated;

NOTIFY pgrst, 'reload schema';
