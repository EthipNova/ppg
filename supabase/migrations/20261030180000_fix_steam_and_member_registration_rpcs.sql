-- ============================================================================
-- Migration: 20261030180000_fix_steam_and_member_registration_rpcs.sql
-- Description:
-- 1. Alters steam_services table to allow NULL payment_proof_path for Cash payments.
-- 2. Creates get_steam_services_list supporting both p_tab and p_status parameters.
-- 3. Creates register_steam_service accepting (p_customer_id, p_service_id, p_amount, p_payment_method, p_payment_reference, p_proof_path, p_authorize_immediately).
--    Validates Cash (no photo required, NULL proof) vs Telebirr / CBE Birr (photo required).
-- 4. Creates register_member_by_reception accepting (p_name, p_phone, p_category, p_plan_id, p_plan_name, p_proof_path, p_payment_method, p_student_id, p_institution).
--    Validates Cash (no photo required, NULL proof) vs Telebirr / CBE Birr (photo required).
-- 5. Configures payment-proofs Storage bucket and staff RLS policies.
-- 6. Grants permissions to authenticated and service_role, and reloads PostgREST schema cache.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Storage Bucket & Policies
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS payment_proofs_staff_upload ON storage.objects;
CREATE POLICY payment_proofs_staff_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND public.powerplus_is_staff(FALSE)
  );

DROP POLICY IF EXISTS payment_proofs_staff_cleanup ON storage.objects;
CREATE POLICY payment_proofs_staff_cleanup ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND public.powerplus_is_staff(FALSE)
  );

DROP POLICY IF EXISTS payment_proofs_staff_read ON storage.objects;
CREATE POLICY payment_proofs_staff_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      public.powerplus_is_staff(FALSE)
      OR auth.uid() IS NOT NULL
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Alter Table Columns for Cash & Direct Authorization
-- ----------------------------------------------------------------------------

-- Allow NULL payment_proof_path for CASH transactions
ALTER TABLE public.steam_services ALTER COLUMN payment_proof_path DROP NOT NULL;

-- Allow NULL for legacy/add-on fee columns if not supplied
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'steam_services' AND column_name = 'steam_fee' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.steam_services ALTER COLUMN steam_fee DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'steam_services' AND column_name = 'registration_fee' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.steam_services ALTER COLUMN registration_fee DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'steam_services' AND column_name = 'is_new_customer' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.steam_services ALTER COLUMN is_new_customer DROP NOT NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Function: get_steam_services_list (Supports p_tab and p_status)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_steam_services_list(text, text);
DROP FUNCTION IF EXISTS public.get_steam_services_list(text, text, text);

CREATE OR REPLACE FUNCTION public.get_steam_services_list(
  p_search TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'ALL',
  p_tab TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  customer_id UUID,
  customer_name TEXT,
  customer_code TEXT,
  customer_phone TEXT,
  customer_category TEXT,
  service_id UUID,
  service_name TEXT,
  amount NUMERIC,
  steam_fee NUMERIC,
  registration_fee NUMERIC,
  is_new_customer BOOLEAN,
  payment_method TEXT,
  payment_reference TEXT,
  payment_proof_path TEXT,
  payment_status TEXT,
  service_status TEXT,
  registered_by UUID,
  registered_by_name TEXT,
  registered_by_email TEXT,
  verified_by UUID,
  verified_by_name TEXT,
  verified_by_email TEXT,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  authorized_by UUID,
  authorized_by_name TEXT,
  authorized_by_email TEXT,
  authorized_at TIMESTAMPTZ,
  completed_by UUID,
  completed_by_name TEXT,
  completed_by_email TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filter TEXT;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required';
  END IF;

  v_filter := upper(trim(coalesce(nullif(trim(p_tab), ''), nullif(trim(p_status), ''), 'ALL')));

  RETURN QUERY
  SELECT
    s.id,
    s.customer_id,
    btrim(concat(c.first_name, ' ', c.last_name))::TEXT AS customer_name,
    coalesce(c.customer_code, '—')::TEXT AS customer_code,
    c.phone::TEXT AS customer_phone,
    coalesce(c.customer_type, 'REGULAR')::TEXT AS customer_category,
    s.service_id,
    coalesce(svc.name, 'Steam Service')::TEXT AS service_name,
    s.amount,
    coalesce(s.steam_fee, s.amount) AS steam_fee,
    coalesce(s.registration_fee, 0) AS registration_fee,
    coalesce(s.is_new_customer, FALSE) AS is_new_customer,
    s.payment_method::TEXT AS payment_method,
    s.payment_reference::TEXT AS payment_reference,
    s.payment_proof_path::TEXT AS payment_proof_path,
    s.payment_status::TEXT AS payment_status,
    s.service_status::TEXT AS service_status,
    s.registered_by,
    coalesce(btrim(concat(rsp.first_name, ' ', rsp.last_name)), ru.email, 'Reception')::TEXT AS registered_by_name,
    ru.email::TEXT AS registered_by_email,
    s.verified_by,
    coalesce(btrim(concat(vsp.first_name, ' ', vsp.last_name)), vu.email, 'Admin')::TEXT AS verified_by_name,
    vu.email::TEXT AS verified_by_email,
    s.verified_at,
    s.rejection_reason,
    s.authorized_by,
    coalesce(btrim(concat(asp.first_name, ' ', asp.last_name)), au.email, 'Reception')::TEXT AS authorized_by_name,
    au.email::TEXT AS authorized_by_email,
    s.authorized_at,
    s.completed_by,
    coalesce(btrim(concat(csp.first_name, ' ', csp.last_name)), cu.email, 'Reception')::TEXT AS completed_by_name,
    cu.email::TEXT AS completed_by_email,
    s.completed_at,
    s.created_at,
    s.updated_at
  FROM public.steam_services s
  JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.services svc ON svc.id = s.service_id
  LEFT JOIN auth.users ru ON ru.id = s.registered_by
  LEFT JOIN public.staff_profiles rsp ON rsp.user_id = s.registered_by
  LEFT JOIN auth.users vu ON vu.id = s.verified_by
  LEFT JOIN public.staff_profiles vsp ON vsp.user_id = s.verified_by
  LEFT JOIN auth.users au ON au.id = s.authorized_by
  LEFT JOIN public.staff_profiles asp ON asp.user_id = s.authorized_by
  LEFT JOIN auth.users cu ON cu.id = s.completed_by
  LEFT JOIN public.staff_profiles csp ON csp.user_id = s.completed_by
  WHERE
    (
      v_filter = 'ALL'
      OR (v_filter = 'IN_PROGRESS' AND s.service_status = 'AUTHORIZED')
      OR (v_filter = 'COMPLETED' AND s.service_status = 'COMPLETED')
      OR (v_filter = 'READY' AND s.service_status = 'READY_FOR_ACCESS')
      OR (v_filter = 'PENDING' AND s.payment_status = 'PENDING_VERIFICATION')
      OR (v_filter = 'APPROVED' AND s.payment_status = 'APPROVED')
      OR s.service_status = v_filter
    )
    AND (
      p_search IS NULL OR trim(p_search) = ''
      OR c.first_name ILIKE '%' || trim(p_search) || '%'
      OR c.last_name ILIKE '%' || trim(p_search) || '%'
      OR concat(c.first_name, ' ', c.last_name) ILIKE '%' || trim(p_search) || '%'
      OR c.customer_code ILIKE '%' || trim(p_search) || '%'
      OR c.phone ILIKE '%' || trim(p_search) || '%'
      OR s.payment_reference ILIKE '%' || trim(p_search) || '%'
    )
  ORDER BY s.created_at DESC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Function: register_steam_service
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.register_steam_service(UUID, UUID, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.register_steam_service(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.register_steam_service(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.register_steam_service(
  p_customer_id UUID,
  p_service_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_reference TEXT DEFAULT NULL,
  p_proof_path TEXT DEFAULT NULL,
  p_authorize_immediately BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_steam_id UUID;
  v_user_record_id UUID;
  v_service_status TEXT;
  v_authorized_by UUID;
  v_authorized_at TIMESTAMPTZ;
  v_method TEXT;
  v_clean_proof TEXT;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required to register steam services';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be greater than zero';
  END IF;

  v_method := upper(trim(coalesce(p_payment_method, 'CASH')));
  IF v_method NOT IN ('CASH', 'TELEBIRR', 'CBE_BIRR') THEN
    RAISE EXCEPTION 'Invalid payment method: %, must be Cash, Telebirr, or CBE Birr', p_payment_method;
  END IF;

  v_clean_proof := nullif(trim(coalesce(p_proof_path, '')), '');

  IF v_method = 'CASH' THEN
    v_clean_proof := NULL; -- Cash payments do not require and do not store a proof path
  ELSE
    IF v_clean_proof IS NULL THEN
      RAISE EXCEPTION 'Payment proof photo is required for % payments', v_method;
    END IF;
  END IF;

  SELECT id INTO v_user_record_id FROM public.users WHERE id = auth.uid();

  -- Record payment immediately as PAID for accountability and financial visibility
  INSERT INTO public.payments (
    customer_id,
    amount,
    payment_method,
    payment_status,
    transaction_reference,
    service_type,
    service_id,
    recorded_by,
    paid_at,
    notes,
    created_at
  ) VALUES (
    p_customer_id,
    p_amount,
    v_method,
    'PAID',
    coalesce(nullif(trim(p_payment_reference), ''), v_clean_proof),
    'STEAM',
    p_service_id,
    v_user_record_id,
    now(),
    'Steam Service registered by Reception (' || v_method || ')',
    now()
  ) RETURNING id INTO v_payment_id;

  IF coalesce(p_authorize_immediately, TRUE) THEN
    v_service_status := 'AUTHORIZED';
    v_authorized_by := auth.uid();
    v_authorized_at := now();
  ELSE
    v_service_status := 'READY_FOR_ACCESS';
    v_authorized_by := NULL;
    v_authorized_at := NULL;
  END IF;

  -- Insert steam_services record with payment_status = APPROVED (no admin verification dependency)
  INSERT INTO public.steam_services (
    customer_id,
    service_id,
    amount,
    steam_fee,
    registration_fee,
    is_new_customer,
    payment_method,
    payment_reference,
    payment_proof_path,
    payment_status,
    service_status,
    registered_by,
    authorized_by,
    authorized_at,
    created_at,
    updated_at,
    payment_id
  ) VALUES (
    p_customer_id,
    p_service_id,
    p_amount,
    p_amount,
    0,
    FALSE,
    v_method,
    nullif(trim(p_payment_reference), ''),
    v_clean_proof,
    'APPROVED',
    v_service_status,
    auth.uid(),
    v_authorized_by,
    v_authorized_at,
    now(),
    now(),
    v_payment_id
  ) RETURNING id INTO v_steam_id;

  RETURN jsonb_build_object(
    'success', true,
    'steam_service_id', v_steam_id,
    'payment_id', v_payment_id,
    'service_status', v_service_status
  );
END;
$$;

-- Backward-compatible overload with 6 parameters (default authorize_immediately = TRUE)
CREATE OR REPLACE FUNCTION public.register_steam_service(
  p_customer_id UUID,
  p_service_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_reference TEXT,
  p_proof_path TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.register_steam_service(
    p_customer_id,
    p_service_id,
    p_amount,
    p_payment_method,
    p_payment_reference,
    p_proof_path,
    TRUE
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Function: authorize_steam_access
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.authorize_steam_access(
  p_service_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.steam_services%ROWTYPE;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required to authorize steam access';
  END IF;

  SELECT * INTO v_rec FROM public.steam_services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Steam service record not found';
  END IF;

  IF v_rec.service_status = 'AUTHORIZED' THEN
    RAISE EXCEPTION 'Customer is already authorized to use steam';
  END IF;

  IF v_rec.service_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Service has already been completed';
  END IF;

  UPDATE public.steam_services
  SET service_status = 'AUTHORIZED',
      payment_status = 'APPROVED',
      authorized_by = auth.uid(),
      authorized_at = now(),
      updated_at = now()
  WHERE id = p_service_id;

  IF v_rec.payment_id IS NOT NULL THEN
    UPDATE public.payments
    SET payment_status = 'PAID',
        paid_at = coalesce(paid_at, now())
    WHERE id = v_rec.payment_id AND payment_status <> 'PAID';
  END IF;

  RETURN jsonb_build_object('success', true, 'service_status', 'AUTHORIZED');
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Function: complete_steam_service
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_steam_service(
  p_service_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.steam_services%ROWTYPE;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required to complete steam service';
  END IF;

  SELECT * INTO v_rec FROM public.steam_services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Steam service record not found';
  END IF;

  IF v_rec.service_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Service has already been completed';
  END IF;

  UPDATE public.steam_services
  SET service_status = 'COMPLETED',
      completed_by = auth.uid(),
      completed_at = now(),
      updated_at = now()
  WHERE id = p_service_id;

  RETURN jsonb_build_object('success', true, 'service_status', 'COMPLETED');
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Function: get_steam_summary_stats
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_steam_summary_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_services INTEGER;
  v_in_progress INTEGER;
  v_completed_services INTEGER;
  v_today_revenue NUMERIC;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required';
  END IF;

  SELECT count(*) INTO v_today_services
  FROM public.steam_services
  WHERE created_at::date = CURRENT_DATE;

  SELECT count(*) INTO v_in_progress
  FROM public.steam_services
  WHERE service_status = 'AUTHORIZED';

  SELECT count(*) INTO v_completed_services
  FROM public.steam_services
  WHERE service_status = 'COMPLETED' AND completed_at::date = CURRENT_DATE;

  SELECT coalesce(sum(amount), 0) INTO v_today_revenue
  FROM public.steam_services
  WHERE payment_status = 'APPROVED'
    AND created_at::date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'today_services', v_today_services,
    'pending_payments', 0,
    'approved_payments', v_today_services,
    'in_progress_services', v_in_progress,
    'completed_services', v_completed_services,
    'today_revenue', v_today_revenue
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Function: register_member_by_reception
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.register_member_by_reception(
  p_name TEXT,
  p_phone TEXT,
  p_category TEXT,
  p_plan_id UUID DEFAULT NULL,
  p_plan_name TEXT DEFAULT NULL,
  p_proof_path TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'CASH',
  p_student_id TEXT DEFAULT NULL,
  p_institution TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT;
  v_last_name TEXT;
  v_customer_id UUID;
  v_customer_code TEXT;
  v_plan public.plans%ROWTYPE;
  v_membership_id UUID;
  v_payment_id UUID;
  v_user_record_id UUID;
  v_max_code_num INT;
  v_duration_days INT := 30;
  v_plan_price NUMERIC := 0;
  v_method TEXT;
  v_clean_proof TEXT;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required to register members';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Member name is required';
  END IF;
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  v_method := upper(trim(coalesce(p_payment_method, 'CASH')));
  IF v_method NOT IN ('CASH', 'TELEBIRR', 'CBE_BIRR') THEN
    RAISE EXCEPTION 'Invalid payment method: %, must be Cash, Telebirr, or CBE Birr', p_payment_method;
  END IF;

  v_clean_proof := nullif(trim(coalesce(p_proof_path, '')), '');

  IF v_method = 'CASH' THEN
    v_clean_proof := NULL; -- Cash requires no proof
  ELSE
    IF v_clean_proof IS NULL THEN
      RAISE EXCEPTION 'Payment proof photo is required for % payments', v_method;
    END IF;
  END IF;

  -- Check duplicate phone
  IF EXISTS (SELECT 1 FROM public.customers WHERE phone = trim(p_phone)) THEN
    RAISE EXCEPTION 'A customer with phone % is already registered', trim(p_phone);
  END IF;

  -- Resolve plan
  IF p_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id AND is_active = TRUE;
  END IF;

  IF v_plan.id IS NULL AND p_plan_name IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE lower(trim(name)) = lower(trim(p_plan_name)) AND is_active = TRUE LIMIT 1;
  END IF;

  IF v_plan.id IS NOT NULL THEN
    v_duration_days := coalesce(v_plan.duration_days, 30);
    v_plan_price := v_plan.price;
  ELSE
    v_duration_days := 30;
    v_plan_price := 2500;
  END IF;

  -- Name parsing
  v_first_name := split_part(trim(p_name), ' ', 1);
  v_last_name := nullif(btrim(substr(trim(p_name), length(v_first_name) + 1)), '');
  IF v_last_name IS NULL THEN
    v_last_name := v_first_name;
  END IF;

  -- Compute next sequential member ID code (e.g. PP-014 or PP-905)
  SELECT coalesce(max(substring(customer_code FROM '^PP-([0-9]{1,6})$')::BIGINT), 0) + 1
  INTO v_max_code_num
  FROM public.customers
  WHERE customer_code ~ '^PP-[0-9]{1,6}$';

  v_customer_code := 'PP-' || lpad(v_max_code_num::TEXT, 3, '0');

  -- Insert customer row (email, emergency contact/phone, and medical notes are omitted)
  INSERT INTO public.customers (
    customer_code,
    first_name,
    last_name,
    phone,
    join_date,
    status,
    customer_type,
    student_id,
    institution,
    student_verification_status,
    created_at,
    updated_at
  ) VALUES (
    v_customer_code,
    v_first_name,
    v_last_name,
    trim(p_phone),
    CURRENT_DATE,
    'ACTIVE',
    coalesce(p_category, 'REGULAR'),
    CASE WHEN p_category = 'STUDENT' THEN nullif(trim(p_student_id), '') END,
    CASE WHEN p_category = 'STUDENT' THEN nullif(trim(p_institution), '') END,
    'NOT_REQUIRED',
    now(),
    now()
  ) RETURNING id INTO v_customer_id;

  -- Insert membership if plan exists
  IF v_plan.id IS NOT NULL THEN
    INSERT INTO public.memberships (
      customer_id,
      plan_id,
      start_date,
      end_date,
      status,
      price_at_purchase,
      auto_renew,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      v_customer_id,
      v_plan.id,
      CURRENT_DATE,
      CURRENT_DATE + v_duration_days,
      'ACTIVE',
      v_plan_price,
      FALSE,
      auth.uid(),
      now(),
      now()
    ) RETURNING id INTO v_membership_id;
  END IF;

  -- Insert payment record with payment proof stored in transaction_reference
  SELECT id INTO v_user_record_id FROM public.users WHERE id = auth.uid();

  INSERT INTO public.payments (
    customer_id,
    membership_id,
    amount,
    payment_method,
    payment_status,
    transaction_reference,
    paid_at,
    recorded_by,
    notes,
    service_type,
    created_at
  ) VALUES (
    v_customer_id,
    v_membership_id,
    v_plan_price,
    v_method,
    'PAID',
    v_clean_proof,
    now(),
    v_user_record_id,
    'In-person member registration payment recorded by Reception (' || v_method || ')',
    'MEMBERSHIP',
    now()
  ) RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'success', true,
    'customer_id', v_customer_id,
    'customer_code', v_customer_code,
    'membership_id', v_membership_id,
    'payment_id', v_payment_id,
    'expiry_date', (CURRENT_DATE + v_duration_days)::TEXT
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Grants and Permissions
-- ----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_steam_services_list(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_steam_service(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_steam_service(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.authorize_steam_access(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_steam_service(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_steam_summary_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMIT;
