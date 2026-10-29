-- Add the Student access windows required by the Student dashboard.
-- This creates only the missing schedule table and its two baseline rows.
BEGIN;

CREATE TABLE IF NOT EXISTS public.category_access_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('REGULAR', 'STUDENT', 'MUSLIM', 'AEROBICS')),
  days TEXT[] NOT NULL CHECK (cardinality(days) > 0),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS category_access_rules_active_category_idx
  ON public.category_access_rules (category, is_active);

ALTER TABLE public.category_access_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.category_access_rules FROM anon, PUBLIC;
GRANT SELECT ON public.category_access_rules TO authenticated;

DROP POLICY IF EXISTS category_access_rules_authenticated_read ON public.category_access_rules;
CREATE POLICY category_access_rules_authenticated_read
  ON public.category_access_rules FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

INSERT INTO public.category_access_rules (category, days, start_time, end_time, description)
SELECT 'STUDENT', ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']::TEXT[],
       TIME '05:00', TIME '16:00', 'Student rate — weekday off-peak access (before 4:00 PM).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.category_access_rules WHERE category = 'STUDENT'
    AND days @> ARRAY['Monday']::TEXT[] AND start_time = TIME '05:00' AND end_time = TIME '16:00'
);

INSERT INTO public.category_access_rules (category, days, start_time, end_time, description)
SELECT 'STUDENT', ARRAY['Saturday', 'Sunday']::TEXT[],
       TIME '05:00', TIME '22:00', 'Student rate — open access on weekends.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.category_access_rules WHERE category = 'STUDENT'
    AND days @> ARRAY['Saturday']::TEXT[] AND start_time = TIME '05:00' AND end_time = TIME '22:00'
);

NOTIFY pgrst, 'reload schema';
COMMIT;
