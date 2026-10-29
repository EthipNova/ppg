-- Scope dashboard-related reads to staff and the linked customer account.
BEGIN;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locker_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lockers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dev_memberships_select ON public.memberships;
DROP POLICY IF EXISTS memberships_staff_or_customer_read ON public.memberships;
CREATE POLICY memberships_staff_or_customer_read ON public.memberships
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = memberships.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS dev_attendance_select ON public.attendance;
DROP POLICY IF EXISTS attendance_staff_or_customer_read ON public.attendance;
CREATE POLICY attendance_staff_or_customer_read ON public.attendance
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = attendance.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS steam_demo_payments_read ON public.payments;
DROP POLICY IF EXISTS payments_staff_or_customer_read ON public.payments;
CREATE POLICY payments_staff_or_customer_read ON public.payments
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = payments.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS steam_demo_payments_insert ON public.payments;
DROP POLICY IF EXISTS payments_customer_pending_insert ON public.payments;
CREATE POLICY payments_customer_pending_insert ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    payment_status = 'PENDING' AND paid_at IS NULL AND service_type <> 'STEAM'
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = payments.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS locker_assignments_member_read ON public.locker_assignments;
CREATE POLICY locker_assignments_member_read ON public.locker_assignments
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = locker_assignments.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lockers_member_assigned_read ON public.lockers;
CREATE POLICY lockers_member_assigned_read ON public.lockers
  FOR SELECT TO authenticated USING (
    public.powerplus_is_staff(FALSE)
    OR EXISTS (
      SELECT 1 FROM public.locker_assignments la
      JOIN public.customers c ON c.id = la.customer_id
      WHERE la.locker_id = lockers.id
        AND lower(la.status) = 'active'
        AND c.user_id = auth.uid()
    )
  );

COMMIT;
