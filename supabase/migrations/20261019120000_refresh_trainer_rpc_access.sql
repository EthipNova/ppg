-- Reassert the trainer RPC grants and refresh PostgREST after the trainer workflow migration.
-- This migration is additive and fails clearly if the workflow migration is missing from the target database.
DO $$
BEGIN
  IF to_regprocedure('public.trainer_portal_dashboard(timestamptz,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Missing public.trainer_portal_dashboard(timestamptz,timestamptz); apply the trainer workflow migration first';
  END IF;
  IF to_regprocedure('public.trainer_portal_roster(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing public.trainer_portal_roster(uuid); apply the trainer workflow migration first';
  END IF;
  IF to_regprocedure('public.trainer_update_own_profile(text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing public.trainer_update_own_profile(text,text,text,text); apply the trainer workflow migration first';
  END IF;
  IF to_regprocedure('public.trainer_cancel_own_schedule(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing public.trainer_cancel_own_schedule(uuid); apply the trainer workflow migration first';
  END IF;
  IF to_regprocedure('public.trainer_record_class_attendance(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing public.trainer_record_class_attendance(uuid,text); apply the trainer workflow migration first';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_portal_dashboard(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_portal_roster(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_update_own_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_cancel_own_schedule(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trainer_record_class_attendance(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.trainer_portal_dashboard(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_portal_roster(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_update_own_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_cancel_own_schedule(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trainer_record_class_attendance(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
