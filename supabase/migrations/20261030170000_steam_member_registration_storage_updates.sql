-- ============================================================================
-- PowerPlus Gym: Steam Workflow Updates, Member Registration & Storage Policies
-- Migration: 20261030170000_steam_member_registration_storage_updates.sql
-- 1. Adds staff storage policies on 'payment-proofs' bucket (insert, cleanup, read).
-- 2. Removes Admin approval dependency from Steam workflow (immediate authorization & monitoring).
-- 3. Adds atomic receptionist member registration RPC with payment proof storage linkage.
-- Non-destructive, idempotent, preserves all existing data and policies.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Supabase Storage: 'payment-proofs' bucket configuration and staff policies
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Staff insert policy for payment proofs (Member registration & Steam service)
DROP POLICY IF EXISTS payment_proofs_staff_upload ON storage.objects;
CREATE POLICY payment_proofs_staff_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND public.powerplus_is_staff(FALSE)
  );

-- Staff delete policy for cleaning up orphaned files if registration fails
DROP POLICY IF EXISTS payment_proofs_staff_cleanup ON storage.objects;
CREATE POLICY payment_proofs_staff_cleanup ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND public.powerplus_is_staff(FALSE)
  );

-- Staff select policy for viewing payment proof images securely
DROP POLICY IF EXISTS payment_proofs_staff_read ON storage.objects;
CREATE POLICY payment_proofs_staff_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND public.powerplus_is_staff(FALSE)
  );

-- ----------------------------------------------------------------------------
-- 2. Canonical Plans Seed / Ensure Presence
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE lower(name) = 'monthly essential') THEN
    INSERT INTO public.plans (name, price, duration_days, benefits, applicable_categories, is_active)
    VALUES ('Monthly Essential', 1500, 30, 'Weight-room access, Lockers & changing rooms, Water fountain', ARRAY['REGULAR', 'STUDENT', 'MUSLIM'], true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE lower(name) = 'monthly premium') THEN
    INSERT INTO public.plans (name, price, duration_days, benefits, applicable_categories, is_active)
    VALUES ('Monthly Premium', 2500, 30, 'Full access, Group classes, Sauna, Nutrition plan', ARRAY['REGULAR', 'STUDENT', 'MUSLIM', 'AEROBICS'], true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE lower(name) = 'quarterly') THEN
    INSERT INTO public.plans (name, price, duration_days, benefits, applicable_categories, is_active)
    VALUES ('Quarterly', 6500, 90, 'Full access, Group classes, Sauna, 1 coaching session / week', ARRAY['REGULAR', 'STUDENT', 'MUSLIM', 'AEROBICS'], true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE lower(name) = 'annual') THEN
    INSERT INTO public.plans (name, price, duration_days, benefits, applicable_categories, is_active)
    VALUES ('Annual', 22000, 365, 'Unlimited access, Unlimited coaching, Guest passes, Shop discount', ARRAY['REGULAR', 'STUDENT', 'MUSLIM', 'AEROBICS'], true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE lower(name) = 'aerobics & dance pack') THEN
    INSERT INTO public.plans (name, price, duration_days, benefits, applicable_categories, is_active)
    VALUES ('Aerobics & Dance Pack', 1200, 30, 'Aerobics classes, Dance fitness, Access to class time slots', ARRAY['AEROBICS'], true);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Steam Service Functions: Reception Direct Authorization (No Admin Approval)
-- ----------------------------------------------------------------------------

-- Overload / update register_steam_service
CREATE OR REPLACE FUNCTION public.register_steam_service(
  p_customer_id UUID,
  p_service_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_reference TEXT,
  p_proof_path TEXT,
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
    p_payment_method,
    'PAID',
    nullif(trim(p_payment_reference), coalesce(trim(p_proof_path), '')),
    'STEAM',
    p_service_id,
    v_user_record_id,
    now(),
    'Steam Service registered and authorized by Reception',
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
    p_payment_method,
    nullif(trim(p_payment_reference), ''),
    trim(p_proof_path),
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

-- Allow 6-parameter call signature for backward compatibility
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

-- Authorize steam access without admin approval constraint
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

-- Mark steam service complete by reception
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

-- Steam summary stats updated for active / in progress / completed workflow
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
-- 4. Member Registration RPC by Reception
-- ----------------------------------------------------------------------------

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
  IF p_proof_path IS NULL OR trim(p_proof_path) = '' THEN
    RAISE EXCEPTION 'Payment proof photo is required';
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

  -- Compute next sequential member ID code (e.g. PP-010)
  SELECT coalesce(max(nullif(regexp_replace(customer_code, '\D', '', 'g'), '')::INT), 0) + 1
  INTO v_max_code_num
  FROM public.customers
  WHERE customer_code LIKE 'PP-%';

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
    student_verification_status
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
    'NOT_REQUIRED'
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
      created_by
    ) VALUES (
      v_customer_id,
      v_plan.id,
      CURRENT_DATE,
      CURRENT_DATE + v_duration_days,
      'ACTIVE',
      v_plan_price,
      FALSE,
      auth.uid()
    ) RETURNING id INTO v_membership_id;
  END IF;

  -- Insert payment record with payment proof stored in transaction_reference
  SELECT id INTO v_user_record_id FROM public.users WHERE id = auth.uid();

  INSERT INTO public.payments (
    customer_id,
    membership_id,
    membership_plan_id,
    amount,
    payment_method,
    payment_status,
    transaction_reference,
    paid_at,
    recorded_by,
    notes,
    service_type,
    currency,
    created_at
  ) VALUES (
    v_customer_id,
    v_membership_id,
    v_plan.id,
    v_plan_price,
    coalesce(p_payment_method, 'CASH'),
    'PAID',
    trim(p_proof_path),
    now(),
    v_user_record_id,
    'In-person member registration payment recorded by Reception',
    'MEMBERSHIP',
    'ETB',
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

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.register_steam_service(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_steam_service(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_steam_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_steam_service(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_steam_summary_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_member_by_reception(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
