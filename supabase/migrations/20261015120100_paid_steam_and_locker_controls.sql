-- Paid Steam services and accountable physical-key locker operations.
-- Additive and non-destructive. Apply only after reviewing against the live schema.

CREATE TABLE IF NOT EXISTS public.steam_service_options (
  service_id UUID PRIMARY KEY REFERENCES public.services(id) ON DELETE RESTRICT,
  access_type TEXT NOT NULL CHECK (access_type IN ('package', 'per-visit')),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  track_usage BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (usage_limit IS NULL OR track_usage)
);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ETB',
  ADD COLUMN IF NOT EXISTS steam_access_type TEXT,
  ADD COLUMN IF NOT EXISTS steam_duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS steam_usage_limit INTEGER,
  ADD COLUMN IF NOT EXISTS steam_track_usage BOOLEAN;
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_uidx
  ON public.payments (idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.steam_access
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_limit INTEGER,
  ADD COLUMN IF NOT EXISTS track_usage BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ETB',
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
UPDATE public.steam_access
SET usage_count = greatest(total_visits - remaining_visits, 0),
    usage_limit = total_visits,
    track_usage = TRUE
WHERE usage_limit IS NULL AND total_visits > 0;
DO $$
DECLARE constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.steam_access'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.steam_access DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'steam_access_usage_count_nonnegative'
      AND conrelid = 'public.steam_access'::regclass) THEN
    ALTER TABLE public.steam_access ADD CONSTRAINT steam_access_usage_count_nonnegative CHECK (usage_count >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'steam_access_usage_limit_positive'
      AND conrelid = 'public.steam_access'::regclass) THEN
    ALTER TABLE public.steam_access ADD CONSTRAINT steam_access_usage_limit_positive CHECK (usage_limit IS NULL OR usage_limit > 0);
  END IF;
  ALTER TABLE public.steam_access
    ADD CONSTRAINT steam_access_status_check
    CHECK (status IN ('Active', 'Expiring Soon', 'Expired', 'Cancelled'));
END $$;

ALTER TABLE public.steam_usage
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS key_note TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS steam_usage_request_id_uidx
  ON public.steam_usage (request_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.lockers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.locker_assignments
  ADD COLUMN IF NOT EXISTS key_number TEXT,
  ADD COLUMN IF NOT EXISTS returned_by UUID,
  ADD COLUMN IF NOT EXISTS return_notes TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS locker_assignments_one_active_locker_idx
  ON public.locker_assignments (locker_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS lockers_number_location_uidx
  ON public.lockers (locker_number, location);
CREATE UNIQUE INDEX IF NOT EXISTS lockers_key_number_uidx
  ON public.lockers (key_number) WHERE key_number IS NOT NULL AND btrim(key_number) <> '';

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

ALTER TABLE public.steam_service_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steam_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steam_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locker_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "steam_demo_steam_access" ON public.steam_access;
DROP POLICY IF EXISTS "steam_access_anon_all" ON public.steam_access;
DROP POLICY IF EXISTS "steam_demo_steam_usage" ON public.steam_usage;
DROP POLICY IF EXISTS "steam_usage_anon_all" ON public.steam_usage;
DROP POLICY IF EXISTS "lockers anon read" ON public.lockers;
DROP POLICY IF EXISTS "lockers anon write" ON public.lockers;
DROP POLICY IF EXISTS "lockers anon update" ON public.lockers;
DROP POLICY IF EXISTS "lockers_anon_all" ON public.lockers;
DROP POLICY IF EXISTS "locker_assignments anon read" ON public.locker_assignments;
DROP POLICY IF EXISTS "locker_assignments anon write" ON public.locker_assignments;
DROP POLICY IF EXISTS "locker_assignments anon update" ON public.locker_assignments;
DROP POLICY IF EXISTS "locker_assignments_anon_all" ON public.locker_assignments;
DROP POLICY IF EXISTS "locker_audit_log anon read" ON public.locker_audit_log;
DROP POLICY IF EXISTS "locker_audit_log anon write" ON public.locker_audit_log;
DROP POLICY IF EXISTS "steam_demo_services_read" ON public.services;
DROP POLICY IF EXISTS "steam_demo_services_insert" ON public.services;
DROP POLICY IF EXISTS "steam_demo_payments_read" ON public.payments;
DROP POLICY IF EXISTS "steam_demo_payments_insert" ON public.payments;
DROP POLICY IF EXISTS "steam_demo_customers_read" ON public.customers;
DROP POLICY IF EXISTS "steam_demo_customers_update" ON public.customers;
ALTER TABLE public.locker_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS locker_audit_authorized_read ON public.locker_audit_log;
CREATE POLICY locker_audit_authorized_read ON public.locker_audit_log
  FOR SELECT TO authenticated USING (public.powerplus_is_staff(FALSE));

DROP POLICY IF EXISTS steam_services_authenticated_read ON public.services;
CREATE POLICY steam_services_authenticated_read ON public.services
  FOR SELECT TO authenticated USING (is_active OR public.powerplus_is_staff(FALSE));
DROP POLICY IF EXISTS payments_staff_or_customer_read ON public.payments;
CREATE POLICY payments_staff_or_customer_read ON public.payments
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = payments.customer_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS payments_customer_pending_insert ON public.payments;
CREATE POLICY payments_customer_pending_insert ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    payment_status = 'PENDING' AND paid_at IS NULL AND service_type <> 'STEAM'
    AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = payments.customer_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS customers_staff_or_self_read ON public.customers;
CREATE POLICY customers_staff_or_self_read ON public.customers
  FOR SELECT TO authenticated USING (public.powerplus_is_staff(FALSE) OR user_id = auth.uid());

DROP POLICY IF EXISTS steam_options_authenticated_read ON public.steam_service_options;
CREATE POLICY steam_options_authenticated_read ON public.steam_service_options
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS steam_access_authorized_read ON public.steam_access;
CREATE POLICY steam_access_authorized_read ON public.steam_access
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS steam_usage_authorized_read ON public.steam_usage;
CREATE POLICY steam_usage_authorized_read ON public.steam_usage
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS lockers_authorized_read ON public.lockers;
CREATE POLICY lockers_authorized_read ON public.lockers
  FOR SELECT TO authenticated USING (public.powerplus_is_staff(FALSE));
DROP POLICY IF EXISTS locker_assignments_authorized_read ON public.locker_assignments;
CREATE POLICY locker_assignments_authorized_read ON public.locker_assignments
  FOR SELECT TO authenticated USING (public.powerplus_is_staff(FALSE));

CREATE OR REPLACE FUNCTION public.save_steam_service(
  p_service_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_price NUMERIC,
  p_access_type TEXT,
  p_duration_days INTEGER,
  p_usage_limit INTEGER,
  p_track_usage BOOLEAN,
  p_is_active BOOLEAN
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.powerplus_is_staff(TRUE) THEN RAISE EXCEPTION 'Owner authorization required'; END IF;
  IF length(trim(coalesce(p_name, ''))) NOT BETWEEN 2 AND 100
     OR p_price IS NULL OR p_price <= 0 OR p_duration_days IS NULL OR p_duration_days < 1
     OR p_access_type NOT IN ('package', 'per-visit')
     OR (p_usage_limit IS NOT NULL AND p_usage_limit < 1)
     OR (p_usage_limit IS NOT NULL AND NOT p_track_usage) THEN
    RAISE EXCEPTION 'Invalid Steam service configuration';
  END IF;

  IF p_service_id IS NULL THEN
    INSERT INTO public.services (name, description, price, is_active)
    VALUES (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_price, p_is_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.services SET name = trim(p_name),
      description = nullif(trim(coalesce(p_description, '')), ''), price = p_price,
      is_active = p_is_active
    WHERE id = p_service_id AND EXISTS (
      SELECT 1 FROM public.steam_service_options WHERE service_id = p_service_id
    ) RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Steam service not found'; END IF;
  END IF;

  INSERT INTO public.steam_service_options
    (service_id, access_type, duration_days, usage_limit, track_usage)
  VALUES (v_id, p_access_type, p_duration_days, p_usage_limit, p_track_usage)
  ON CONFLICT (service_id) DO UPDATE SET access_type = EXCLUDED.access_type,
    duration_days = EXCLUDED.duration_days, usage_limit = EXCLUDED.usage_limit,
    track_usage = EXCLUDED.track_usage, updated_at = now();
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_steam_cash(
  p_customer_id UUID, p_service_id UUID, p_idempotency_key UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_service public.services%ROWTYPE; v_option public.steam_service_options%ROWTYPE;
  v_payment_id UUID; v_access_id UUID;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN RAISE EXCEPTION 'Reception authorization required'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Request key required'; END IF;
  SELECT id INTO v_payment_id FROM public.payments WHERE idempotency_key = p_idempotency_key;
  IF v_payment_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE id = v_payment_id AND customer_id = p_customer_id
      AND service_id = p_service_id AND service_type = 'STEAM' AND payment_status = 'PAID') THEN
      RAISE EXCEPTION 'Request key was already used for another purchase';
    END IF;
    SELECT id INTO v_access_id FROM public.steam_access WHERE payment_id = v_payment_id;
    RETURN jsonb_build_object('payment_id', v_payment_id, 'access_id', v_access_id, 'replayed', TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN RAISE EXCEPTION 'Customer not found'; END IF;
  SELECT s.* INTO v_service FROM public.services s
    JOIN public.steam_service_options o ON o.service_id = s.id
    WHERE s.id = p_service_id AND s.is_active FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Steam service is inactive or unavailable'; END IF;
  SELECT * INTO v_option FROM public.steam_service_options WHERE service_id = p_service_id FOR UPDATE;

  INSERT INTO public.payments (customer_id, membership_id, amount, payment_method, payment_status,
    transaction_reference, paid_at, recorded_by, notes, service_type, service_id, idempotency_key, currency)
  VALUES (p_customer_id, NULL, v_service.price, 'CASH', 'PAID', 'STEAM-CASH:' || p_idempotency_key,
    now(), auth.uid(), 'Steam service purchase: ' || v_service.name, 'STEAM', p_service_id, p_idempotency_key, 'ETB')
  RETURNING id INTO v_payment_id;

  INSERT INTO public.steam_access (customer_id, type, start_date, end_date, remaining_visits,
    total_visits, status, payment_id, service_id, price, usage_count, usage_limit, track_usage,
    currency, created_by)
  VALUES (p_customer_id, v_option.access_type, CURRENT_DATE,
    CURRENT_DATE + (v_option.duration_days - 1), coalesce(v_option.usage_limit, 0),
    coalesce(v_option.usage_limit, 0), 'Active', v_payment_id, p_service_id, v_service.price,
    0, v_option.usage_limit, v_option.track_usage, 'ETB', auth.uid())
  RETURNING id INTO v_access_id;
  RETURN jsonb_build_object('payment_id', v_payment_id, 'access_id', v_access_id, 'replayed', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_steam_payment(
  p_customer_id UUID, p_service_id UUID, p_payment_method TEXT, p_proof_path TEXT, p_idempotency_key UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_service public.services%ROWTYPE; v_payment_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_payment_method NOT IN ('CBE_BIRR', 'TELEBIRR') OR length(trim(coalesce(p_proof_path, ''))) = 0
     OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Invalid payment request'; END IF;
  IF NOT (public.powerplus_is_staff(FALSE) OR EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = p_customer_id AND c.user_id = auth.uid()
  )) THEN RAISE EXCEPTION 'Customer authorization required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));
  SELECT id INTO v_payment_id FROM public.payments WHERE idempotency_key = p_idempotency_key;
  IF v_payment_id IS NOT NULL THEN RETURN v_payment_id; END IF;
  SELECT s.* INTO v_service FROM public.services s JOIN public.steam_service_options o ON o.service_id = s.id
    WHERE s.id = p_service_id AND s.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Steam service is inactive or unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE customer_id = p_customer_id AND service_type = 'STEAM'
    AND payment_status = 'PENDING') THEN RAISE EXCEPTION 'A Steam payment is already awaiting verification'; END IF;
  INSERT INTO public.payments (customer_id, membership_id, amount, payment_method, payment_status,
    transaction_reference, paid_at, recorded_by, notes, service_type, service_id, idempotency_key, currency,
    steam_access_type, steam_duration_days, steam_usage_limit, steam_track_usage)
  SELECT p_customer_id, NULL, v_service.price, p_payment_method, 'PENDING', p_proof_path, NULL,
    auth.uid(), 'Steam purchase proof submitted; awaiting staff verification', 'STEAM', p_service_id,
    p_idempotency_key, 'ETB', o.access_type, o.duration_days, o.usage_limit, o.track_usage
  FROM public.steam_service_options o WHERE o.service_id = p_service_id
  RETURNING id INTO v_payment_id;
  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_steam_payment(p_payment_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_payment public.payments%ROWTYPE; v_access_id UUID;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN RAISE EXCEPTION 'Reception authorization required'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.service_type <> 'STEAM' THEN RAISE EXCEPTION 'Steam payment not found'; END IF;
  SELECT id INTO v_access_id FROM public.steam_access WHERE payment_id = p_payment_id;
  IF v_access_id IS NOT NULL THEN RETURN v_access_id; END IF;
  IF v_payment.payment_status <> 'PENDING' THEN RAISE EXCEPTION 'Only pending Steam payments can be verified'; END IF;
  IF v_payment.steam_access_type IS NULL OR v_payment.steam_duration_days IS NULL THEN
    RAISE EXCEPTION 'Payment has no saved Steam service terms; contact an administrator';
  END IF;
  UPDATE public.payments SET payment_status = 'PAID', paid_at = now(), recorded_by = auth.uid()
    WHERE id = p_payment_id AND payment_status = 'PENDING';
  INSERT INTO public.steam_access (customer_id, type, start_date, end_date, remaining_visits,
    total_visits, status, payment_id, service_id, price, usage_count, usage_limit, track_usage,
    currency, created_by)
  VALUES (v_payment.customer_id, v_payment.steam_access_type, CURRENT_DATE,
    CURRENT_DATE + (v_payment.steam_duration_days - 1), coalesce(v_payment.steam_usage_limit, 0),
    coalesce(v_payment.steam_usage_limit, 0), 'Active', v_payment.id, v_payment.service_id,
    v_payment.amount, 0, v_payment.steam_usage_limit, coalesce(v_payment.steam_track_usage, TRUE),
    coalesce(v_payment.currency, 'ETB'), auth.uid())
  RETURNING id INTO v_access_id;
  RETURN v_access_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_steam_payment(p_payment_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN RAISE EXCEPTION 'Reception authorization required'; END IF;
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  UPDATE public.payments SET payment_status = 'FAILED', recorded_by = auth.uid(),
    notes = concat_ws(' · ', nullif(notes, ''), 'Rejected: ' || trim(p_reason))
  WHERE id = p_payment_id AND service_type = 'STEAM' AND payment_status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending Steam payment not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_steam_access(p_access_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.powerplus_is_staff(TRUE) THEN RAISE EXCEPTION 'Owner authorization required'; END IF;
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Cancellation reason is required'; END IF;
  UPDATE public.steam_access SET status = 'Cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
    cancellation_reason = trim(p_reason)
  WHERE id = p_access_id AND status IN ('Active', 'Expiring Soon');
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Steam access not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_steam_checkin(p_access_id UUID, p_request_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_access public.steam_access%ROWTYPE; v_status TEXT; v_remaining INTEGER; v_usage_id UUID;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN RAISE EXCEPTION 'Reception authorization required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request key required'; END IF;
  SELECT id INTO v_usage_id FROM public.steam_usage WHERE request_id = p_request_id;
  IF v_usage_id IS NOT NULL THEN RETURN jsonb_build_object('usage_id', v_usage_id, 'replayed', TRUE); END IF;
  SELECT * INTO v_access FROM public.steam_access WHERE id = p_access_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Steam access not found'; END IF;
  SELECT payment_status INTO v_status FROM public.payments WHERE id = v_access.payment_id;
  IF v_status IS DISTINCT FROM 'PAID' THEN RAISE EXCEPTION 'Steam access payment is not paid'; END IF;
  IF v_access.status NOT IN ('Active', 'Expiring Soon') OR CURRENT_DATE < v_access.start_date OR CURRENT_DATE > v_access.end_date
     OR v_access.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Steam access is expired or cancelled'; END IF;
  IF v_access.track_usage AND v_access.usage_limit IS NOT NULL AND v_access.usage_count >= v_access.usage_limit THEN
    RAISE EXCEPTION 'Steam usage limit reached';
  END IF;
  v_remaining := CASE WHEN v_access.usage_limit IS NULL THEN 0 ELSE greatest(v_access.usage_limit - v_access.usage_count - 1, 0) END;
  INSERT INTO public.steam_usage (access_id, customer_id, used_at, visits_used, remaining_after,
    logged_by, note, request_id)
  VALUES (v_access.id, v_access.customer_id, now(), 1, v_remaining, auth.uid()::text,
    nullif(trim(coalesce(p_note, '')), ''), p_request_id) RETURNING id INTO v_usage_id;
  IF v_access.track_usage THEN
    UPDATE public.steam_access SET usage_count = usage_count + 1,
      remaining_visits = CASE WHEN usage_limit IS NULL THEN remaining_visits ELSE greatest(usage_limit - usage_count - 1, 0) END,
      status = CASE WHEN end_date < CURRENT_DATE OR (usage_limit IS NOT NULL AND usage_count + 1 >= usage_limit)
        THEN 'Expired' ELSE status END
    WHERE id = v_access.id;
  END IF;
  RETURN jsonb_build_object('usage_id', v_usage_id, 'remaining', v_remaining, 'replayed', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_locker_with_key(
  p_locker_id UUID, p_customer_id UUID, p_due_date DATE DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_locker public.lockers%ROWTYPE; v_assignment_id UUID;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN RAISE EXCEPTION 'Reception authorization required'; END IF;
  SELECT * INTO v_locker FROM public.lockers WHERE id = p_locker_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(v_locker.is_active, TRUE) OR v_locker.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'Locker is unavailable';
  END IF;
  IF length(trim(coalesce(v_locker.key_number, ''))) = 0 THEN
    RAISE EXCEPTION 'Assign a physical key number to this locker before handout';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN RAISE EXCEPTION 'Customer not found'; END IF;
  INSERT INTO public.locker_assignments (locker_id, customer_id, assigned_at, due_date, status,
    key_returned, assigned_by, notes, key_number)
  VALUES (p_locker_id, p_customer_id, now(), p_due_date, 'active', FALSE,
    auth.uid()::text, coalesce(p_notes, ''), v_locker.key_number)
  RETURNING id INTO v_assignment_id;
  UPDATE public.lockers SET status = 'IN_USE' WHERE id = p_locker_id;
  INSERT INTO public.locker_audit_log (action, actor, locker_id, member_id, details)
  VALUES ('KEY_OUT', auth.uid()::text, p_locker_id, p_customer_id::text,
    'Key ' || coalesce(v_locker.key_number, '(unlabeled)') || ' handed out');
  RETURN v_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_locker_key(p_assignment_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_assignment public.locker_assignments%ROWTYPE; v_locker public.lockers%ROWTYPE;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN RAISE EXCEPTION 'Reception authorization required'; END IF;
  SELECT * INTO v_assignment FROM public.locker_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.status <> 'active' OR v_assignment.key_returned THEN
    RAISE EXCEPTION 'Active key handout not found';
  END IF;
  SELECT * INTO v_locker FROM public.lockers WHERE id = v_assignment.locker_id FOR UPDATE;
  UPDATE public.locker_assignments SET status = 'returned', key_returned = TRUE, returned_at = now(),
    returned_by = auth.uid(), return_notes = nullif(trim(coalesce(p_notes, '')), '')
  WHERE id = p_assignment_id;
  UPDATE public.lockers SET status = CASE WHEN coalesce(is_active, TRUE) THEN 'AVAILABLE' ELSE 'OUT_OF_SERVICE' END
    WHERE id = v_assignment.locker_id;
  INSERT INTO public.locker_audit_log (action, actor, locker_id, member_id, details)
  VALUES ('KEY_RETURNED', auth.uid()::text, v_assignment.locker_id, v_assignment.customer_id::text,
    'Key ' || coalesce(v_assignment.key_number, v_locker.key_number, '(unlabeled)') || ' returned');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_locker_condition(p_locker_id UUID, p_status TEXT, p_is_active BOOLEAN, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_locker public.lockers%ROWTYPE;
BEGIN
  IF NOT public.powerplus_is_staff(TRUE) THEN RAISE EXCEPTION 'Owner authorization required'; END IF;
  IF p_status NOT IN ('AVAILABLE', 'OUT_OF_SERVICE') OR length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Invalid locker condition or reason';
  END IF;
  SELECT * INTO v_locker FROM public.lockers WHERE id = p_locker_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Locker not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.locker_assignments WHERE locker_id = p_locker_id AND status = 'active') THEN
    RAISE EXCEPTION 'Return or resolve the key handout before changing locker condition';
  END IF;
  UPDATE public.lockers SET status = p_status, is_active = p_is_active, notes = trim(p_reason)
    WHERE id = p_locker_id;
  INSERT INTO public.locker_audit_log (action, actor, locker_id, details)
  VALUES (CASE WHEN p_is_active THEN 'CONDITION_CHANGED' ELSE 'DEACTIVATED' END,
    auth.uid()::text, p_locker_id, trim(p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_lockers(p_items JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
  IF NOT public.powerplus_is_staff(TRUE) THEN RAISE EXCEPTION 'Owner authorization required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Provide between 1 and 50 lockers';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) AS item
    WHERE length(trim(coalesce(item->>'number', ''))) = 0
       OR length(trim(coalesce(item->>'key_number', ''))) = 0
       OR length(trim(coalesce(item->>'location', ''))) = 0) THEN
    RAISE EXCEPTION 'Locker number, key number, and location are required';
  END IF;
  INSERT INTO public.lockers (locker_number, location, key_number, status, notes, is_active)
  SELECT trim(item->>'number'), trim(item->>'location'), trim(item->>'key_number'), 'AVAILABLE',
    coalesce(item->>'notes', ''), TRUE
  FROM jsonb_array_elements(p_items) AS item;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.locker_audit_log (action, actor, details)
  VALUES ('LOCKERS_CREATED', auth.uid()::text, v_count::text || ' locker(s) created');
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_locker(
  p_locker_id UUID, p_number TEXT, p_location TEXT, p_key_number TEXT, p_notes TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.powerplus_is_staff(TRUE) THEN RAISE EXCEPTION 'Owner authorization required'; END IF;
  IF length(trim(coalesce(p_number, ''))) = 0 OR length(trim(coalesce(p_key_number, ''))) = 0
     OR p_location NOT IN ('Men', 'Women', 'VIP', 'General') THEN
    RAISE EXCEPTION 'Locker number, physical key, and valid location are required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.locker_assignments WHERE locker_id = p_locker_id AND status = 'active') THEN
    RAISE EXCEPTION 'Return the physical key before editing this locker';
  END IF;
  UPDATE public.lockers SET locker_number = trim(p_number), location = p_location,
    key_number = trim(p_key_number), notes = coalesce(trim(p_notes), '') WHERE id = p_locker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Locker not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.lose_locker_key(p_assignment_id UUID, p_fee NUMERIC, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_assignment public.locker_assignments%ROWTYPE; v_locker public.lockers%ROWTYPE;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN RAISE EXCEPTION 'Reception authorization required'; END IF;
  IF p_fee IS NULL OR p_fee < 0 OR length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Lost-key reason and nonnegative fee are required';
  END IF;
  SELECT * INTO v_assignment FROM public.locker_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.status <> 'active' OR v_assignment.key_returned THEN
    RAISE EXCEPTION 'Active key handout not found';
  END IF;
  SELECT * INTO v_locker FROM public.lockers WHERE id = v_assignment.locker_id FOR UPDATE;
  UPDATE public.locker_assignments SET status = 'lost', returned_at = now(), returned_by = auth.uid(),
    lost_key_fee = p_fee, return_notes = trim(p_reason), notes = concat_ws(' · ', nullif(notes, ''), trim(p_reason))
  WHERE id = p_assignment_id;
  UPDATE public.lockers SET status = 'OUT_OF_SERVICE', notes = trim(p_reason) WHERE id = v_assignment.locker_id;
  INSERT INTO public.locker_audit_log (action, actor, locker_id, member_id, details)
  VALUES ('KEY_LOST', auth.uid()::text, v_assignment.locker_id, v_assignment.customer_id::text,
    'Key ' || coalesce(v_assignment.key_number, v_locker.key_number, '(unlabeled)') ||
    ' reported lost; fee ' || p_fee::text || '; ' || trim(p_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.save_steam_service(UUID,TEXT,TEXT,NUMERIC,TEXT,INTEGER,INTEGER,BOOLEAN,BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purchase_steam_cash(UUID,UUID,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_steam_payment(UUID,UUID,TEXT,TEXT,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_steam_payment(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_steam_payment(UUID,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_steam_access(UUID,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_steam_checkin(UUID,UUID,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_locker_with_key(UUID,UUID,DATE,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.return_locker_key(UUID,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_locker_condition(UUID,TEXT,BOOLEAN,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_lockers(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_locker(UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lose_locker_key(UUID,NUMERIC,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_steam_service(UUID,TEXT,TEXT,NUMERIC,TEXT,INTEGER,INTEGER,BOOLEAN,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_steam_cash(UUID,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_steam_payment(UUID,UUID,TEXT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_steam_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_steam_payment(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_steam_access(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_steam_checkin(UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_locker_with_key(UUID,UUID,DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_locker_key(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_locker_condition(UUID,TEXT,BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_lockers(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_locker(UUID,TEXT,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lose_locker_key(UUID,NUMERIC,TEXT) TO authenticated;

COMMENT ON TABLE public.steam_service_options IS 'Steam service validity and use rules; price and active state are held in public.services.';
COMMENT ON COLUMN public.steam_access.price IS 'Price snapshot captured when the related payment was created.';
COMMENT ON COLUMN public.locker_assignments.key_number IS 'Physical key identifier snapshotted at handout.';
