-- Repair the authenticated trainer profile RPC and its PostgREST exposure.
-- This is forward-only and preserves all application data.

CREATE OR REPLACE FUNCTION public.trainer_portal_profile_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_user_role TEXT;
  v_user_active BOOLEAN;
  v_profile_id UUID;
  v_profile_active BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_UNAUTHENTICATED';
  END IF;

  SELECT u.role::TEXT, u.is_active
    INTO v_user_role, v_user_active
    FROM public.users u
    WHERE u.id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_USER_MAPPING_MISSING';
  END IF;
  IF v_user_role IS DISTINCT FROM 'TRAINER' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_ROLE_REQUIRED';
  END IF;
  IF v_user_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_ACCOUNT_INACTIVE';
  END IF;

  SELECT tp.id, tp.is_active
    INTO v_profile_id, v_profile_active
    FROM public.trainer_profiles tp
    WHERE tp.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_PROFILE_MISSING';
  END IF;
  IF v_profile_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TP_ACCOUNT_INACTIVE';
  END IF;

  RETURN v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trainer_portal_dashboard(
  p_from TIMESTAMPTZ DEFAULT now(),
  p_to TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_profile_id UUID;
  v_result JSONB;
BEGIN
  v_profile_id := public.trainer_portal_profile_id();
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > INTERVAL '90 days' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invalid schedule date range';
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
  FROM public.trainer_profiles tp
  JOIN public.users u ON u.id = tp.user_id
  WHERE tp.id = v_profile_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_portal_profile_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_portal_dashboard(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_portal_dashboard(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';
