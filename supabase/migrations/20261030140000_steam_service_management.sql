-- Steam Service Management Workflow for PowerPlus Gym
-- In-person reception registration, payment verification by admin, and access lifecycle

-- 1. Create steam_services table
CREATE TABLE IF NOT EXISTS public.steam_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'ONLINE_CARD', 'CARD', 'TELEBIRR', 'CBE_BIRR', 'OTHER')),
  payment_reference TEXT,
  payment_proof_path TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK (payment_status IN ('PENDING_VERIFICATION', 'APPROVED', 'REJECTED')),
  service_status TEXT NOT NULL DEFAULT 'AWAITING_VERIFICATION' CHECK (service_status IN ('AWAITING_VERIFICATION', 'READY_FOR_ACCESS', 'AUTHORIZED', 'COMPLETED', 'CANCELLED')),
  registered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  authorized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  authorized_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS steam_services_customer_idx ON public.steam_services(customer_id);
CREATE INDEX IF NOT EXISTS steam_services_payment_status_idx ON public.steam_services(payment_status);
CREATE INDEX IF NOT EXISTS steam_services_service_status_idx ON public.steam_services(service_status);
CREATE INDEX IF NOT EXISTS steam_services_created_at_idx ON public.steam_services(created_at DESC);

-- Enable RLS
ALTER TABLE public.steam_services ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS steam_services_staff_select ON public.steam_services;
CREATE POLICY steam_services_staff_select ON public.steam_services
  FOR SELECT TO authenticated
  USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = steam_services.customer_id AND c.user_id = auth.uid())
  );

-- Function 1: Register Steam Service (Reception Staff or Admin)
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
DECLARE
  v_payment_id UUID;
  v_steam_id UUID;
  v_user_record_id UUID;
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

  IF p_proof_path IS NULL OR trim(p_proof_path) = '' THEN
    RAISE EXCEPTION 'Payment proof photo is required';
  END IF;

  -- Find corresponding public.users row if exists for foreign key
  SELECT id INTO v_user_record_id FROM public.users WHERE id = auth.uid();

  -- Insert payment record into public.payments (service_type = STEAM, payment_status = PENDING)
  INSERT INTO public.payments (
    customer_id,
    amount,
    payment_method,
    payment_status,
    transaction_reference,
    service_type,
    service_id,
    recorded_by,
    notes,
    created_at
  ) VALUES (
    p_customer_id,
    p_amount,
    p_payment_method,
    'PENDING',
    nullif(trim(p_payment_reference), ''),
    'STEAM',
    p_service_id,
    v_user_record_id,
    'In-person Steam Service registration (awaiting admin verification)',
    now()
  ) RETURNING id INTO v_payment_id;

  -- Insert steam_services record
  INSERT INTO public.steam_services (
    customer_id,
    service_id,
    amount,
    payment_method,
    payment_reference,
    payment_proof_path,
    payment_status,
    service_status,
    registered_by,
    created_at,
    updated_at,
    payment_id
  ) VALUES (
    p_customer_id,
    p_service_id,
    p_amount,
    p_payment_method,
    nullif(trim(p_payment_reference), ''),
    trim(p_proof_path),
    'PENDING_VERIFICATION',
    'AWAITING_VERIFICATION',
    auth.uid(),
    now(),
    now(),
    v_payment_id
  ) RETURNING id INTO v_steam_id;

  RETURN jsonb_build_object(
    'success', true,
    'steam_service_id', v_steam_id,
    'payment_id', v_payment_id
  );
END;
$$;

-- Function 2: Admin Payment Verification (Admin Only)
CREATE OR REPLACE FUNCTION public.verify_steam_payment(
  p_service_id UUID,
  p_approve BOOLEAN,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.steam_services%ROWTYPE;
  v_user_record_id UUID;
BEGIN
  -- Strict Admin check: Owner or Admin only!
  IF NOT public.powerplus_is_staff(TRUE) THEN
    RAISE EXCEPTION 'Admin authorization required to verify steam payments';
  END IF;

  -- Lock row for concurrency safety
  SELECT * INTO v_rec FROM public.steam_services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Steam service record not found';
  END IF;

  IF v_rec.payment_status <> 'PENDING_VERIFICATION' THEN
    RAISE EXCEPTION 'Payment has already been processed with status %', v_rec.payment_status;
  END IF;

  SELECT id INTO v_user_record_id FROM public.users WHERE id = auth.uid();

  IF p_approve THEN
    UPDATE public.steam_services
    SET payment_status = 'APPROVED',
        service_status = 'READY_FOR_ACCESS',
        verified_by = auth.uid(),
        verified_at = now(),
        updated_at = now()
    WHERE id = p_service_id;

    IF v_rec.payment_id IS NOT NULL THEN
      UPDATE public.payments
      SET payment_status = 'PAID',
          paid_at = now(),
          recorded_by = coalesce(v_user_record_id, recorded_by),
          notes = coalesce(notes || ' | ', '') || 'Verified & approved by Admin'
      WHERE id = v_rec.payment_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'APPROVED');
  ELSE
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
      RAISE EXCEPTION 'A rejection reason is required';
    END IF;

    UPDATE public.steam_services
    SET payment_status = 'REJECTED',
        service_status = 'CANCELLED',
        rejection_reason = trim(p_reason),
        verified_by = auth.uid(),
        verified_at = now(),
        updated_at = now()
    WHERE id = p_service_id;

    IF v_rec.payment_id IS NOT NULL THEN
      UPDATE public.payments
      SET payment_status = 'FAILED',
          notes = coalesce(notes || ' | ', '') || 'Payment rejected: ' || trim(p_reason)
      WHERE id = v_rec.payment_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'REJECTED', 'reason', trim(p_reason));
  END IF;
END;
$$;

-- Function 3: Authorize Steam Access (Reception Staff)
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

  IF v_rec.payment_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Cannot authorize: Payment status is % (must be APPROVED)', v_rec.payment_status;
  END IF;

  IF v_rec.service_status = 'AUTHORIZED' THEN
    RAISE EXCEPTION 'Customer is already authorized to use steam';
  END IF;

  IF v_rec.service_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Service has already been completed';
  END IF;

  IF v_rec.service_status <> 'READY_FOR_ACCESS' THEN
    RAISE EXCEPTION 'Cannot authorize steam service with status %', v_rec.service_status;
  END IF;

  UPDATE public.steam_services
  SET service_status = 'AUTHORIZED',
      authorized_by = auth.uid(),
      authorized_at = now(),
      updated_at = now()
  WHERE id = p_service_id;

  RETURN jsonb_build_object('success', true, 'service_status', 'AUTHORIZED');
END;
$$;

-- Function 4: Mark Steam Usage Completed (Reception Staff)
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

  IF v_rec.service_status <> 'AUTHORIZED' THEN
    RAISE EXCEPTION 'Cannot mark completed: Service status is % (must be AUTHORIZED)', v_rec.service_status;
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

-- Function 5: Steam Services Summary Stats
CREATE OR REPLACE FUNCTION public.get_steam_summary_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_services INTEGER;
  v_pending_payments INTEGER;
  v_approved_payments INTEGER;
  v_completed_services INTEGER;
  v_today_revenue NUMERIC;
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required';
  END IF;

  SELECT count(*) INTO v_today_services
  FROM public.steam_services
  WHERE created_at::date = CURRENT_DATE;

  SELECT count(*) INTO v_pending_payments
  FROM public.steam_services
  WHERE payment_status = 'PENDING_VERIFICATION';

  SELECT count(*) INTO v_approved_payments
  FROM public.steam_services
  WHERE payment_status = 'APPROVED';

  SELECT count(*) INTO v_completed_services
  FROM public.steam_services
  WHERE service_status = 'COMPLETED' AND completed_at::date = CURRENT_DATE;

  SELECT coalesce(sum(amount), 0) INTO v_today_revenue
  FROM public.steam_services
  WHERE payment_status = 'APPROVED'
    AND (verified_at::date = CURRENT_DATE OR (verified_at IS NULL AND created_at::date = CURRENT_DATE));

  RETURN jsonb_build_object(
    'today_services', v_today_services,
    'pending_payments', v_pending_payments,
    'approved_payments', v_approved_payments,
    'completed_services', v_completed_services,
    'today_revenue', v_today_revenue
  );
END;
$$;

-- Function 6: Query Steam Services with Details
CREATE OR REPLACE FUNCTION public.get_steam_services_list(
  p_tab TEXT DEFAULT 'ALL',
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  customer_id UUID,
  customer_name TEXT,
  customer_code TEXT,
  customer_phone TEXT,
  customer_category TEXT,
  service_id UUID,
  service_name TEXT,
  amount NUMERIC,
  payment_method TEXT,
  payment_reference TEXT,
  payment_proof_path TEXT,
  payment_status TEXT,
  service_status TEXT,
  registered_by UUID,
  registered_by_email TEXT,
  verified_by UUID,
  verified_by_email TEXT,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  authorized_by UUID,
  authorized_at TIMESTAMPTZ,
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.powerplus_is_staff(FALSE) THEN
    RAISE EXCEPTION 'Staff authorization required';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.customer_id,
    btrim(concat(c.first_name, ' ', c.last_name))::text AS customer_name,
    c.customer_code::text AS customer_code,
    c.phone::text AS customer_phone,
    coalesce(c.customer_type, 'REGULAR')::text AS customer_category,
    s.service_id,
    coalesce(svc.name, 'Steam Service')::text AS service_name,
    s.amount,
    s.payment_method::text AS payment_method,
    s.payment_reference::text AS payment_reference,
    s.payment_proof_path::text AS payment_proof_path,
    s.payment_status::text AS payment_status,
    s.service_status::text AS service_status,
    s.registered_by,
    ru.email::text AS registered_by_email,
    s.verified_by,
    vu.email::text AS verified_by_email,
    s.verified_at,
    s.rejection_reason::text AS rejection_reason,
    s.authorized_by,
    s.authorized_at,
    s.completed_by,
    s.completed_at,
    s.created_at,
    s.updated_at
  FROM public.steam_services s
  JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.services svc ON svc.id = s.service_id
  LEFT JOIN auth.users ru ON ru.id = s.registered_by
  LEFT JOIN auth.users vu ON vu.id = s.verified_by
  WHERE
    CASE
      WHEN p_tab = 'PENDING' THEN s.payment_status = 'PENDING_VERIFICATION'
      WHEN p_tab = 'APPROVED' THEN s.payment_status = 'APPROVED' AND s.service_status = 'READY_FOR_ACCESS'
      WHEN p_tab = 'IN_PROGRESS' THEN s.service_status = 'AUTHORIZED'
      WHEN p_tab = 'COMPLETED' THEN s.service_status = 'COMPLETED'
      ELSE TRUE
    END
    AND (
      p_search IS NULL OR trim(p_search) = ''
      OR c.first_name ILIKE '%' || trim(p_search) || '%'
      OR c.last_name ILIKE '%' || trim(p_search) || '%'
      OR c.customer_code ILIKE '%' || trim(p_search) || '%'
      OR c.phone ILIKE '%' || trim(p_search) || '%'
      OR s.payment_reference ILIKE '%' || trim(p_search) || '%'
    )
  ORDER BY s.created_at DESC;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.register_steam_service(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_steam_payment(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_steam_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_steam_service(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_steam_summary_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_steam_services_list(TEXT, TEXT) TO authenticated;
