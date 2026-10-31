import { supabase } from "../integrations/supabase/client";

export interface RegularCustomerData {
  id: string;
  customerCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  customerType: string;
  status: string;
  joinDate: string;
  phone: string;
  email: string | null;
  gender?: string | null;
  photoUrl?: string | null;
}

export interface RegularPlanData {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  description: string | null;
  benefits: string | null;
  isActive: boolean;
}

export interface RegularMembershipData {
  id: string;
  planId: string;
  startDate: string;
  endDate: string;
  status: string;
  priceAtPurchase: number;
  autoRenew: boolean;
}

export interface RegularAttendanceRecord {
  id: string;
  checkedInAt: string;
  checkInMethod: string;
  notes: string | null;
}

export interface RegularAttendanceSummary {
  total: number;
  lastVisit: string | null;
  recent: RegularAttendanceRecord[];
}

export interface RegularPaymentRecord {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  serviceType: string;
  paidAt: string | null;
  createdAt?: string;
  notes: string | null;
}

export interface DashboardLockerData {
  locker: {
    number: string;
    section: string;
    keyTag: string;
  };
  assignment: {
    assignedAt: string;
    dueDate: string | null;
  };
}

export interface RegularMembershipSummary {
  daysRemaining: number;
  progressPercent: number;
  durationDays: number;
  status: string;
  isExpired: boolean;
  isExpiring: boolean;
}

export interface RegularDashboardResult {
  customer: RegularCustomerData;
  membership: RegularMembershipData | null;
  plan: RegularPlanData | null;
  attendance: RegularAttendanceSummary;
  payments: RegularPaymentRecord[];
  membershipSummary: RegularMembershipSummary;
  locker: DashboardLockerData | null;
}

export type RegularDashboardState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "not_found"; message: string }
  | { status: "success"; data: RegularDashboardResult };

interface CustomerDbRow {
  id: string;
  customer_code: string;
  first_name: string;
  last_name: string;
  customer_type: string;
  status: string;
  join_date: string;
  phone: string;
  email: string | null;
  gender?: string | null;
  photo_url?: string | null;
}

interface AttendanceDbRow {
  id: string;
  checked_in_at: string;
  check_in_method: string;
  notes: string | null;
}

interface PaymentDbRow {
  id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  service_type: string;
  paid_at: string | null;
  created_at?: string;
  notes: string | null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates whether a provided string is a valid UUIDv4.
 */
export function isValidUuid(id: string): boolean {
  return Boolean(id && UUID_REGEX.test(id));
}

/**
 * Fetches dashboard data for a Regular customer from Supabase.
 * Validates the UUID, strictly scopes queries to customer_id, and returns
 * a strongly typed view model without mock fallbacks.
 */
export async function fetchRegularDashboardData(
  customerId: string
): Promise<RegularDashboardState> {
  if (!isValidUuid(customerId)) {
    return {
      status: "error",
      error: "Invalid customer ID format. Expected a standard UUID.",
    };
  }

  try {
    // 1. Fetch Customer Record
    const customerRes = await supabase
      .from("customers")
      .select("id, customer_code, first_name, last_name, customer_type, status, join_date, phone, email, gender, photo_url")
      .eq("id", customerId)
      .maybeSingle();

    if (customerRes.error) {
      console.error("[RegularDashboardService] Error fetching customer:", customerRes.error);
      return {
        status: "error",
        error: "Unable to load customer profile from database.",
      };
    }

    const customerRow = customerRes.data as CustomerDbRow | null;
    if (!customerRow) {
      return {
        status: "not_found",
        message: "Customer profile not found in database.",
      };
    }

    const customer: RegularCustomerData = {
      id: customerRow.id,
      customerCode: customerRow.customer_code,
      firstName: customerRow.first_name,
      lastName: customerRow.last_name,
      fullName: `${customerRow.first_name} ${customerRow.last_name}`.trim(),
      customerType: customerRow.customer_type,
      status: customerRow.status,
      joinDate: customerRow.join_date,
      phone: customerRow.phone,
      email: customerRow.email ?? null,
      gender: customerRow.gender ?? null,
      photoUrl: customerRow.photo_url ?? null,
    };

    // 2. Parallel Secondary Queries: Membership (joined with plan), Attendance, Payments
    const membershipPromise = supabase
      .from("memberships")
      .select(`
        id,
        plan_id,
        start_date,
        end_date,
        status,
        price_at_purchase,
        auto_renew,
        plans (
          id,
          name,
          price,
          duration_days,
          description,
          benefits,
          is_active
        )
      `)
      .eq("customer_id", customerId)
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const attendancePromise = supabase
      .from("attendance")
      .select("id, checked_in_at, check_in_method, notes")
      .eq("customer_id", customerId)
      .order("checked_in_at", { ascending: false })
      .limit(20);

    const attendanceCountPromise = supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId);

    const paymentsPromise = supabase
      .from("payments")
      .select("id, amount, payment_method, payment_status, service_type, paid_at, created_at, notes")
      .eq("customer_id", customerId)
      .eq("service_type", "MEMBERSHIP")
      .order("created_at", { ascending: false });

    const lockerPromise = supabase
      .from("locker_assignments")
      .select(`
        id,
        customer_id,
        status,
        assigned_at,
        notes,
        lockers (
          id,
          locker_number,
          status
        )
      `)
      .eq("customer_id", customerId)
      .eq("status", "active")
      .maybeSingle();

    const [membershipRes, attendanceRes, attendanceCountRes, paymentsRes, lockerRes] = await Promise.all([
      membershipPromise,
      attendancePromise,
      attendanceCountPromise,
      paymentsPromise,
      lockerPromise,
    ]);

    if (membershipRes.error) {
      console.error("[RegularDashboardService] Error fetching membership:", membershipRes.error);
      return {
        status: "error",
        error: "Unable to load membership details from database.",
      };
    }

    if (attendanceRes.error) {
      console.error("[RegularDashboardService] Error fetching attendance:", attendanceRes.error);
      return {
        status: "error",
        error: "Unable to load attendance history from database.",
      };
    }

    if (paymentsRes.error) {
      console.error("[RegularDashboardService] Error fetching payments:", paymentsRes.error);
      return {
        status: "error",
        error: "Unable to load payment history from database.",
      };
    }

    // 3. Map Membership & Associated Plan
    let membership: RegularMembershipData | null = null;
    let plan: RegularPlanData | null = null;
    let membershipSummary: RegularMembershipSummary = {
      daysRemaining: 0,
      progressPercent: 0,
      durationDays: 0,
      status: "NO_MEMBERSHIP",
      isExpired: true,
      isExpiring: false,
    };

    const mRow = membershipRes.data as any;
    if (mRow) {
      const pRow = Array.isArray(mRow.plans) ? mRow.plans[0] : mRow.plans;
      if (pRow) {
        plan = {
          id: pRow.id,
          name: pRow.name,
          price: Number(pRow.price ?? 0),
          durationDays: Number(pRow.duration_days ?? 30),
          description: pRow.description ?? null,
          benefits: pRow.benefits ?? null,
          isActive: Boolean(pRow.is_active ?? true),
        };
      }

      membership = {
        id: mRow.id,
        planId: mRow.plan_id,
        startDate: mRow.start_date,
        endDate: mRow.end_date,
        status: mRow.status,
        priceAtPurchase: Number(mRow.price_at_purchase ?? 0),
        autoRenew: Boolean(mRow.auto_renew ?? false),
      };

      const now = Date.now();
      const startTs = mRow.start_date ? new Date(mRow.start_date).getTime() : now;
      const endTs = mRow.end_date ? new Date(mRow.end_date).getTime() : now;

      const durationDays = plan?.durationDays || Math.max(1, Math.round((endTs - startTs) / 86400000)) || 30;
      const daysRemaining = mRow.end_date
        ? Math.max(0, Math.ceil((endTs - now) / 86400000))
        : 0;

      const progressPercent = Math.max(
        0,
        Math.min(100, Math.round(((durationDays - daysRemaining) / durationDays) * 100))
      );

      const isExpired = mRow.status?.toUpperCase() === "EXPIRED" || daysRemaining <= 0;
      const isExpiring = !isExpired && daysRemaining <= 7;

      membershipSummary = {
        daysRemaining,
        progressPercent,
        durationDays,
        status: mRow.status,
        isExpired,
        isExpiring,
      };
    }

    // 4. Map Attendance
    const attendanceRows = (attendanceRes.data || []) as AttendanceDbRow[];
    const recentAttendance: RegularAttendanceRecord[] = attendanceRows.map(row => ({
      id: row.id,
      checkedInAt: row.checked_in_at,
      checkInMethod: row.check_in_method,
      notes: row.notes ?? null,
    }));

    const attendanceSummary: RegularAttendanceSummary = {
      total: attendanceCountRes.count ?? recentAttendance.length,
      lastVisit: recentAttendance[0]?.checkedInAt || null,
      recent: recentAttendance,
    };

    // 5. Map Payments (Membership payments only, empty list if none exist)
    const paymentRows = (paymentsRes.data || []) as PaymentDbRow[];
    const payments: RegularPaymentRecord[] = paymentRows.map(row => ({
      id: row.id,
      amount: Number(row.amount ?? 0),
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      serviceType: row.service_type,
      paidAt: row.paid_at ?? null,
      createdAt: row.created_at,
      notes: row.notes ?? null,
    }));

    // 6. Map Locker Assignment
    let locker: DashboardLockerData | null = null;
    const lockerData = (lockerRes as any)?.data;
    if (lockerData) {
      const lRow = lockerData.lockers as any;
      locker = {
        locker: {
          number: lRow?.locker_number || "—",
          section: "General",
          keyTag: "—",
        },
        assignment: {
          assignedAt: lockerData.assigned_at,
          dueDate: null,
        },
      };
    }

    return {
      status: "success",
      data: {
        customer,
        membership,
        plan,
        attendance: attendanceSummary,
        payments,
        membershipSummary,
        locker,
      },
    };
  } catch (err: any) {
    console.error("[RegularDashboardService] Unexpected error:", err);
    return {
      status: "error",
      error: err?.message || "An unexpected error occurred while loading dashboard data.",
    };
  }
}
