-- Migration: Create staff_profiles self-read RLS policy and link existing Reception account
BEGIN;

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_profiles_self_read ON public.staff_profiles;
CREATE POLICY staff_profiles_self_read ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

INSERT INTO public.staff_profiles (user_id, first_name, last_name, phone, job_title, is_active)
VALUES (
  '58122e97-7799-4e05-a8c1-a63e8573cc19',
  'Reception',
  'Staff',
  '0911000000',
  'Receptionist',
  TRUE
)
ON CONFLICT (user_id) DO UPDATE
SET first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    job_title = EXCLUDED.job_title,
    is_active = EXCLUDED.is_active;

COMMIT;
