-- Provision Student profiles from the existing Auth signup flow and secure
-- customer profile reads. Existing customer rows are not rewritten here.
BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS student_id TEXT,
  ADD COLUMN IF NOT EXISTS institution TEXT,
  ADD COLUMN IF NOT EXISTS student_verification_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS student_verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customers'::regclass
      AND conname = 'customers_student_verification_status_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_student_verification_status_check
      CHECK (student_verification_status IN ('NOT_REQUIRED', 'PENDING', 'VERIFIED', 'REJECTED'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.powerplus_is_staff(p_owner_only BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.is_active = TRUE
      AND CASE WHEN p_owner_only THEN u.role IN ('OWNER', 'ADMIN')
               ELSE u.role IN ('OWNER', 'ADMIN', 'STAFF') END
  );
$$;
REVOKE ALL ON FUNCTION public.powerplus_is_staff(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.powerplus_is_staff(BOOLEAN) TO authenticated;

-- Replace the legacy development policies that exposed customer rows to anon
-- and allowed unrestricted client writes.
DROP POLICY IF EXISTS steam_demo_customers_read ON public.customers;
DROP POLICY IF EXISTS steam_demo_customers_insert ON public.customers;
DROP POLICY IF EXISTS steam_demo_customers_update ON public.customers;
DROP POLICY IF EXISTS customers_staff_or_self_read ON public.customers;
DROP POLICY IF EXISTS customers_staff_or_self_update ON public.customers;

REVOKE ALL ON TABLE public.customers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.customers TO authenticated;
GRANT UPDATE (first_name, last_name, phone, date_of_birth, gender, address, updated_at)
  ON TABLE public.customers TO authenticated;

CREATE POLICY customers_staff_or_self_read ON public.customers
  FOR SELECT TO authenticated
  USING (public.powerplus_is_staff(FALSE) OR user_id = auth.uid());
CREATE POLICY customers_staff_or_self_update ON public.customers
  FOR UPDATE TO authenticated
  USING (public.powerplus_is_staff(FALSE) OR user_id = auth.uid())
  WITH CHECK (public.powerplus_is_staff(FALSE) OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_student_customer_from_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_full_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_phone TEXT;
  v_student_id TEXT;
  v_institution TEXT;
  v_customer_code TEXT;
  v_plan_id UUID;
  v_category TEXT;
  v_plan_price NUMERIC;
  v_duration_days INTEGER;
BEGIN
  IF COALESCE(NEW.raw_user_meta_data ->> 'registration_flow', '') NOT IN ('student', 'customer') THEN
    RETURN NEW;
  END IF;

  v_category := CASE WHEN NEW.raw_user_meta_data ->> 'registration_flow' = 'student'
    THEN 'STUDENT' ELSE upper(COALESCE(NEW.raw_user_meta_data ->> 'category', '')) END;
  IF v_category IS NULL OR v_category NOT IN ('REGULAR', 'STUDENT', 'MUSLIM', 'AEROBICS') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select a valid membership category.';
  END IF;
  v_full_name := btrim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''));
  v_phone := btrim(COALESCE(NEW.raw_user_meta_data ->> 'phone', ''));
  v_student_id := btrim(COALESCE(NEW.raw_user_meta_data ->> 'student_id', ''));
  v_institution := btrim(COALESCE(NEW.raw_user_meta_data ->> 'institution', ''));
  BEGIN
    v_plan_id := (NEW.raw_user_meta_data ->> 'plan_id')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select a valid Student plan.';
  END;

  IF v_full_name = '' OR v_phone = '' OR NEW.email IS NULL
    OR (v_category = 'STUDENT' AND (v_student_id = '' OR v_institution = '')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Name, phone, email, and required category details must be provided.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(lower(v_phone)));
  IF EXISTS (SELECT 1 FROM public.customers c WHERE c.phone = v_phone OR lower(c.email) = lower(NEW.email)) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'A customer with this phone number or email already exists.';
  END IF;

  IF v_plan_id IS NULL AND v_category = 'STUDENT' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select a valid Student plan.';
  END IF;
  IF v_plan_id IS NOT NULL THEN
    SELECT p.price, p.duration_days INTO v_plan_price, v_duration_days
    FROM public.plans p
    WHERE p.id = v_plan_id AND p.is_active = TRUE
      AND p.applicable_categories @> ARRAY[v_category]::TEXT[];
    IF NOT FOUND AND v_category = 'STUDENT' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The selected Student plan is unavailable.';
    ELSIF NOT FOUND THEN
      v_plan_id := NULL;
    END IF;
  END IF;

  v_first_name := split_part(v_full_name, ' ', 1);
  v_last_name := NULLIF(btrim(substr(v_full_name, length(v_first_name) + 1)), '');
  v_customer_code := 'PP-' || upper(substr(replace(NEW.id::TEXT, '-', ''), 1, 8));

  INSERT INTO public.customers (
    id, user_id, customer_code, first_name, last_name, phone, email, join_date, status,
    customer_type, student_id, institution, student_verification_status, requested_plan_id
  ) VALUES (
    NEW.id, NEW.id, v_customer_code, v_first_name, COALESCE(v_last_name, v_first_name),
    v_phone, lower(NEW.email), CURRENT_DATE, 'ACTIVE', v_category,
    CASE WHEN v_category = 'STUDENT' THEN v_student_id END,
    CASE WHEN v_category = 'STUDENT' THEN v_institution END,
    CASE WHEN v_category = 'STUDENT' THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
    CASE WHEN v_category = 'STUDENT' THEN v_plan_id END
  );

  IF v_category <> 'STUDENT' AND v_plan_id IS NOT NULL THEN
    INSERT INTO public.memberships (customer_id, plan_id, start_date, end_date, status, price_at_purchase, auto_renew, created_by)
    VALUES (NEW.id, v_plan_id, CURRENT_DATE, CURRENT_DATE + v_duration_days, 'ACTIVE', v_plan_price, FALSE, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_student_customer_from_signup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS create_student_customer_after_signup ON auth.users;
CREATE TRIGGER create_student_customer_after_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_student_customer_from_signup();

NOTIFY pgrst, 'reload schema';
COMMIT;
