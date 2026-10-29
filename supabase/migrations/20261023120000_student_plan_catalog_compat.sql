-- Restore the category-aware plan catalog used by student signup and renewals.
-- This is safe to apply when the broader Student migration has already run.
BEGIN;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS applicable_categories TEXT[] NOT NULL DEFAULT '{}';

-- Apply the existing project category rules without changing plan prices or
-- inserting fixture rows. Unrecognized plans keep their current category list.
UPDATE public.plans
SET applicable_categories = ARRAY['REGULAR', 'STUDENT', 'MUSLIM']::TEXT[]
WHERE lower(name) = 'monthly essential';

UPDATE public.plans
SET applicable_categories = ARRAY['REGULAR', 'STUDENT', 'MUSLIM', 'AEROBICS']::TEXT[]
WHERE lower(name) IN ('monthly premium', 'quarterly', 'annual');

UPDATE public.plans
SET applicable_categories = ARRAY['AEROBICS']::TEXT[]
WHERE lower(name) LIKE '%aerobics%' OR lower(name) LIKE '%dance%';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.plans'::regclass
      AND conname = 'plans_applicable_categories_check'
  ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_applicable_categories_check
      CHECK (applicable_categories <@ ARRAY['REGULAR', 'STUDENT', 'MUSLIM', 'AEROBICS']::TEXT[]);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
