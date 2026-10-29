-- The Student dashboard reads the optional locker return due date.
-- Existing assignments remain unchanged and receive NULL until staff set a date.
BEGIN;

ALTER TABLE public.locker_assignments
  ADD COLUMN IF NOT EXISTS due_date DATE;

NOTIFY pgrst, 'reload schema';
COMMIT;
