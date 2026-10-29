-- Student membership requests, private verification data, and member dashboard access.
-- Additive only. A student request never creates an active membership or marks verification complete.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS student_id TEXT,
  ADD COLUMN IF NOT EXISTS institution TEXT,
  ADD COLUMN IF NOT EXISTS student_verification_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS student_verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_student_verification_status_check;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_student_verification_status_check
  CHECK (student_verification_status IN ('NOT_REQUIRED', 'PENDING', 'VERIFIED', 'REJECTED'));

-- Existing Student-category rows also require explicit reception review.
UPDATE public.customers
SET student_verification_status = 'PENDING'
WHERE customer_type = 'STUDENT' AND student_verification_status = 'NOT_REQUIRED';

-- Link legacy student customers to an existing Auth user only when the email
-- maps uniquely on both sides; ambiguous rows stay unlinked for staff review.
WITH unique_auth_emails AS (
  SELECT lower(email) AS email, min(id::TEXT)::UUID AS user_id
  FROM auth.users WHERE email IS NOT NULL
  GROUP BY lower(email) HAVING count(*) = 1
), unique_student_emails AS (
  SELECT lower(email) AS email, min(id::TEXT)::UUID AS customer_id
  FROM public.customers
  WHERE customer_type = 'STUDENT' AND email IS NOT NULL AND user_id IS NULL
  GROUP BY lower(email) HAVING count(*) = 1
)
UPDATE public.customers c
SET user_id = a.user_id
FROM unique_auth_emails a
JOIN unique_student_emails s USING (email)
WHERE c.id = s.customer_id AND NOT EXISTS (
  SELECT 1 FROM public.customers linked WHERE linked.user_id = a.user_id
);

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS applicable_categories TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_applicable_categories_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_applicable_categories_check
  CHECK (applicable_categories <@ ARRAY['REGULAR', 'STUDENT', 'MUSLIM', 'AEROBICS']::TEXT[]);

-- Preserve the category mappings already used by the application. Prices remain unchanged.
UPDATE public.plans
SET applicable_categories = ARRAY['REGULAR', 'STUDENT', 'MUSLIM']::TEXT[]
WHERE lower(name) = 'monthly essential';
UPDATE public.plans
SET applicable_categories = ARRAY['REGULAR', 'STUDENT', 'MUSLIM', 'AEROBICS']::TEXT[]
WHERE lower(name) IN ('monthly premium', 'quarterly', 'annual');
UPDATE public.plans
SET applicable_categories = ARRAY['AEROBICS']::TEXT[]
WHERE lower(name) LIKE '%aerobics%' OR lower(name) LIKE '%dance%';

-- Reuse the payment ledger's retry key so a retried student renewal cannot
-- create duplicate payment requests. Existing rows are left untouched.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS membership_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_uidx
  ON public.payments (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_user_id_student_idx
  ON public.customers (user_id) WHERE customer_type = 'STUDENT';
CREATE INDEX IF NOT EXISTS customers_student_verification_idx
  ON public.customers (student_verification_status) WHERE customer_type = 'STUDENT';

-- Persist the existing configured Student access windows for member dashboards.
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
ALTER TABLE public.category_access_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.category_access_rules FROM anon, PUBLIC;
GRANT SELECT ON public.category_access_rules TO authenticated;
DROP POLICY IF EXISTS category_access_rules_authenticated_read ON public.category_access_rules;
CREATE POLICY category_access_rules_authenticated_read
  ON public.category_access_rules FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Members can read only their own related membership, attendance, and locker rows.
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memberships_staff_or_customer_read ON public.memberships;
CREATE POLICY memberships_staff_or_customer_read ON public.memberships
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = memberships.customer_id AND c.user_id = auth.uid())
  );

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_staff_or_customer_read ON public.attendance;
CREATE POLICY attendance_staff_or_customer_read ON public.attendance
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = attendance.customer_id AND c.user_id = auth.uid())
  );

DROP POLICY IF EXISTS locker_assignments_member_read ON public.locker_assignments;
CREATE POLICY locker_assignments_member_read ON public.locker_assignments
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = locker_assignments.customer_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS lockers_member_assigned_read ON public.lockers;
CREATE POLICY lockers_member_assigned_read ON public.lockers
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.locker_assignments la
      JOIN public.customers c ON c.id = la.customer_id
      WHERE la.locker_id = lockers.id AND la.status = 'active' AND c.user_id = auth.uid()
    )
  );

-- Private evidence storage used by the existing renewal proof UI.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];
DROP POLICY IF EXISTS payment_proofs_owner_upload ON storage.objects;
CREATE POLICY payment_proofs_owner_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND name LIKE 'proofs/%' AND EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id::TEXT = split_part(name, '/', 2) AND c.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS payment_proofs_owner_cleanup ON storage.objects;
CREATE POLICY payment_proofs_owner_cleanup ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-proofs' AND name LIKE 'proofs/%' AND EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id::TEXT = split_part(name, '/', 2) AND c.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS payment_proofs_staff_read ON storage.objects;
CREATE POLICY payment_proofs_staff_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.powerplus_is_staff(FALSE));

-- This legacy anonymous insert policy allowed clients to set arbitrary customer fields.
DROP POLICY IF EXISTS steam_demo_customers_insert ON public.customers;

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

CREATE OR REPLACE FUNCTION public.set_student_verification(
  p_customer_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authorized staff access is required.';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('VERIFIED', 'REJECTED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Student verification status must be VERIFIED or REJECTED.';
  END IF;
  IF p_status = 'VERIFIED' AND EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = p_customer_id AND c.customer_type = 'STUDENT'
      AND (NULLIF(btrim(c.student_id), '') IS NULL OR NULLIF(btrim(c.institution), '') IS NULL)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Student ID and institution must be recorded before approval.';
  END IF;
  UPDATE public.customers
  SET student_verification_status = p_status,
      student_verified_by = auth.uid(),
      student_verified_at = now()
  WHERE id = p_customer_id AND customer_type = 'STUDENT';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Student customer not found.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_student_verification(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_student_verification(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_student_membership_payment(
  p_customer_id UUID,
  p_plan_id UUID,
  p_payment_method TEXT,
  p_proof_path TEXT,
  p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_membership_id UUID;
  v_payment_id UUID;
  v_proof_path TEXT;
BEGIN
  IF auth.uid() IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in before submitting a renewal.';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CBE_BIRR', 'TELEBIRR') OR
     p_proof_path IS NULL OR p_proof_path NOT LIKE 'proofs/' || p_customer_id::TEXT || '/%' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Payment method or proof path is invalid.';
  END IF;

  SELECT * INTO v_customer FROM public.customers
  WHERE id = p_customer_id AND user_id = auth.uid() AND customer_type = 'STUDENT'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Student profile is not linked to this account.'; END IF;
  IF v_customer.student_verification_status <> 'VERIFIED' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Reception must verify your student status before a Student plan renewal.';
  END IF;

  SELECT * INTO v_plan FROM public.plans
  WHERE id = p_plan_id AND is_active = TRUE
    AND applicable_categories @> ARRAY['STUDENT']::TEXT[];
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The selected Student plan is no longer available.'; END IF;

  SELECT id, transaction_reference INTO v_payment_id, v_proof_path
  FROM public.payments WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE id = v_payment_id
      AND customer_id = p_customer_id AND service_type = 'MEMBERSHIP'
      AND payment_method = p_payment_method
      AND notes = 'Student renewal for plan ' || p_plan_id::TEXT || '. Awaiting reception payment verification.') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This renewal request key was already used.';
    END IF;
    RETURN jsonb_build_object('payment_id', v_payment_id, 'proof_path', v_proof_path, 'replayed', TRUE);
  END IF;

  IF EXISTS (SELECT 1 FROM public.payments WHERE customer_id = p_customer_id
    AND service_type = 'MEMBERSHIP' AND payment_status = 'PENDING') THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'A membership payment is already awaiting reception verification.';
  END IF;
  SELECT id INTO v_membership_id FROM public.memberships
  WHERE customer_id = p_customer_id ORDER BY end_date DESC LIMIT 1;

  INSERT INTO public.payments (customer_id, membership_id, membership_plan_id, amount, payment_method, payment_status,
    transaction_reference, paid_at, service_type, notes, idempotency_key, currency)
  VALUES (p_customer_id, v_membership_id, v_plan.id, v_plan.price, p_payment_method, 'PENDING',
    p_proof_path, NULL, 'MEMBERSHIP', 'Student renewal for plan ' || p_plan_id::TEXT || '. Awaiting reception payment verification.', p_idempotency_key, 'ETB')
  RETURNING id INTO v_payment_id;
  RETURN jsonb_build_object('payment_id', v_payment_id, 'proof_path', p_proof_path, 'replayed', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.request_student_membership_payment(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_student_membership_payment(UUID, UUID, TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_student_membership_payment(p_payment_id UUID, p_approve BOOLEAN)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_membership_id UUID;
  v_start_date DATE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authorized staff access is required.';
  END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose approve or reject.'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.service_type <> 'MEMBERSHIP' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Student membership payment not found.';
  END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_payment.customer_id FOR UPDATE;
  IF NOT FOUND OR v_customer.customer_type <> 'STUDENT' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This review function only handles Student payments.';
  END IF;
  IF v_payment.payment_status = 'PAID' THEN RETURN v_payment.membership_id; END IF;
  IF v_payment.payment_status <> 'PENDING' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This payment is no longer pending.';
  END IF;
  IF NOT p_approve THEN
    UPDATE public.payments SET payment_status = 'FAILED', recorded_by = auth.uid(),
      notes = coalesce(notes, '') || ' Rejected by reception.' WHERE id = p_payment_id;
    RETURN NULL;
  END IF;
  IF v_customer.student_verification_status <> 'VERIFIED' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Verify the student before approving membership payment.';
  END IF;
  SELECT * INTO v_plan FROM public.plans WHERE id = v_payment.membership_plan_id
    AND is_active = TRUE AND applicable_categories @> ARRAY['STUDENT']::TEXT[];
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The submitted Student plan is no longer active.'; END IF;

  SELECT CASE WHEN status = 'ACTIVE' AND end_date >= CURRENT_DATE THEN end_date + 1 ELSE CURRENT_DATE END
  INTO v_start_date FROM public.memberships WHERE customer_id = v_customer.id
  ORDER BY end_date DESC LIMIT 1;
  v_start_date := coalesce(v_start_date, CURRENT_DATE);
  INSERT INTO public.memberships (customer_id, plan_id, start_date, end_date, status, price_at_purchase, auto_renew, created_by)
  VALUES (v_customer.id, v_plan.id, v_start_date, v_start_date + v_plan.duration_days,
    'ACTIVE', v_payment.amount, FALSE, auth.uid())
  RETURNING id INTO v_membership_id;
  UPDATE public.payments SET membership_id = v_membership_id, payment_status = 'PAID', paid_at = now(),
    recorded_by = auth.uid() WHERE id = p_payment_id;
  RETURN v_membership_id;
END;
$$;
REVOKE ALL ON FUNCTION public.review_student_membership_payment(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_student_membership_payment(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Remove confirmed development policies that expose every member row to anonymous users.
DROP POLICY IF EXISTS dev_attendance_select ON public.attendance;
DROP POLICY IF EXISTS dev_memberships_select ON public.memberships;
