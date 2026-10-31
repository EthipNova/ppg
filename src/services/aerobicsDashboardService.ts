import { supabase } from "../integrations/supabase/client";

export interface AerobicsCustomerData {
  id: string;
  customerCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  customerType: string;
  status: string;
  email: string | null;
  phone: string;
  aerobicsGroupId: string | null;
  gender?: string | null;
  photoUrl?: string | null;
}

export interface AerobicsPlanData {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  description: string | null;
  benefits: string | null;
}

export interface AerobicsMembershipData {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  plan: AerobicsPlanData | null;
}

export interface AerobicsSessionData {
  id: string;
  name: string;
  days: string[];
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timeSlot: string;
  capacity: number;
  description: string | null;
  status: string;
  active: boolean;
  trainerId: string | null;
}

export interface AerobicsTrainerData {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  specialization: string | null;
  isActive: boolean;
}

export interface AerobicsOccupancyData {
  enrolledCount: number;
  capacity: number;
  availableSpots: number;
  occupancyPercentage: number;
}

export interface AerobicsAttendanceRecord {
  id: string;
  checkedInAt: string;
  checkInMethod: string;
  notes: string | null;
}

export interface AerobicsPaymentRecord {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  serviceType: string;
  paidAt: string | null;
  createdAt: string;
  notes: string | null;
}

export interface AerobicsAttendanceSummary {
  total: number;
  lastVisit: string | null;
  recent: AerobicsAttendanceRecord[];
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

export interface AerobicsDashboardResult {
  customer: AerobicsCustomerData;
  membership: AerobicsMembershipData | null;
  session: AerobicsSessionData | null;
  trainer: AerobicsTrainerData | null;
  occupancy: AerobicsOccupancyData | null;
  attendance: AerobicsAttendanceRecord[];
  attendanceTotal: number;
  attendanceSummary: AerobicsAttendanceSummary;
  payments: AerobicsPaymentRecord[];
  locker: DashboardLockerData | null;
}

export type AerobicsDashboardState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "not_found"; message: string }
  | { status: "success"; data: AerobicsDashboardResult };

interface CustomerDbRow {
  id: string;
  customer_code: string;
  first_name: string;
  last_name: string;
  customer_type: string;
  status: string;
  aerobics_group_id: string | null;
  email: string | null;
  phone: string;
  gender?: string | null;
  photo_url?: string | null;
}

interface SessionDbRow {
  id: string;
  name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  capacity: number | null;
  status: string;
  description: string | null;
  active: boolean;
  days: string[] | null;
  trainer_id: string | null;
}

interface TrainerDbRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  specialization: string | null;
  is_active: boolean;
}

interface AttendanceDbRow {
  id: string;
  checked_in_at: string;
  check_in_method: string;
  notes: string | null;
}

const DAY_INDEX_TO_NAME: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/** Formats SQL TIME (e.g., "18:00:00" -> "18:00") */
function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return timeStr;
}

/** Formats timeSlot string e.g. "18:00 – 19:00" */
function formatTimeSlot(start: string, end: string): string {
  const s = formatTime(start);
  const e = formatTime(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || "Schedule TBA";
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Single data-access layer for the Aerobics Customer Dashboard.
 * Queries Supabase using the anon client and strongly maps results.
 */
export async function fetchAerobicsDashboardData(
  customerId: string
): Promise<AerobicsDashboardState> {
  // Validate UUID to protect against mock IDs like "m8" hitting PostgreSQL UUID columns
  if (!customerId || !UUID_REGEX.test(customerId)) {
    return {
      status: "error",
      error: "Invalid customer ID format. Expected a standard UUID.",
    };
  }

  try {
    // 1. Fetch Customer Record
    const customerRes = await supabase
      .from("customers")
      .select("id, customer_code, first_name, last_name, customer_type, status, aerobics_group_id, email, phone, gender, photo_url")
      .eq("id", customerId)
      .maybeSingle();

    if (customerRes.error) {
      console.error("[AerobicsService] Error fetching customer:", customerRes.error);
      return { status: "error", error: "Unable to load customer profile from database." };
    }

    const customerRow = customerRes.data as CustomerDbRow | null;
    if (!customerRow) {
      return { status: "not_found", message: "Customer profile not found in database." };
    }

    const customer: AerobicsCustomerData = {
      id: customerRow.id,
      customerCode: customerRow.customer_code,
      firstName: customerRow.first_name,
      lastName: customerRow.last_name,
      fullName: `${customerRow.first_name} ${customerRow.last_name}`.trim(),
      customerType: customerRow.customer_type,
      status: customerRow.status,
      email: customerRow.email ?? null,
      phone: customerRow.phone,
      aerobicsGroupId: customerRow.aerobics_group_id ?? null,
      gender: customerRow.gender ?? null,
      photoUrl: customerRow.photo_url ?? null,
    };

    // 2. Parallel secondary queries: Membership, Attendance, Session, and Occupancy
    const membershipPromise = supabase
      .from("memberships")
      .select(`
        id,
        status,
        start_date,
        end_date,
        plans (
          id,
          name,
          price,
          duration_days,
          description,
          benefits
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

    const sessionPromise = customerRow.aerobics_group_id
      ? supabase
          .from("aerobics_sessions")
          .select("id, name, day_of_week, start_time, end_time, capacity, status, description, active, days, trainer_id")
          .eq("id", customerRow.aerobics_group_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const occupancyPromise = customerRow.aerobics_group_id
      ? supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("aerobics_group_id", customerRow.aerobics_group_id)
      : Promise.resolve({ count: 0, error: null });

    const [
      membershipRes,
      attendanceRes,
      attendanceCountRes,
      paymentsRes,
      lockerRes,
      sessionRes,
      occupancyRes,
    ] = await Promise.all([
      membershipPromise,
      attendancePromise,
      attendanceCountPromise,
      paymentsPromise,
      lockerPromise,
      sessionPromise,
      occupancyPromise,
    ]);

    // Handle Membership mapping
    let membership: AerobicsMembershipData | null = null;
    const mData = membershipRes.data as any;
    if (mData) {
      const pRow = Array.isArray(mData.plans) ? mData.plans[0] : mData.plans;
      const daysRemaining = mData.end_date
        ? Math.max(0, Math.ceil((new Date(mData.end_date).getTime() - Date.now()) / 86400000))
        : 0;

      membership = {
        id: mData.id,
        status: mData.status,
        startDate: mData.start_date,
        endDate: mData.end_date,
        daysRemaining,
        plan: pRow
          ? {
              id: pRow.id,
              name: pRow.name,
              price: Number(pRow.price) || 0,
              durationDays: pRow.duration_days || 30,
              description: pRow.description ?? null,
              benefits: pRow.benefits ?? null,
            }
          : null,
      };
    }

    // Handle Attendance mapping
    const attendanceRows = (attendanceRes.data || []) as AttendanceDbRow[];
    const attendance: AerobicsAttendanceRecord[] = attendanceRows.map(a => ({
      id: a.id,
      checkedInAt: a.checked_in_at,
      checkInMethod: a.check_in_method,
      notes: a.notes ?? null,
    }));

    const totalVisits = attendanceCountRes.count ?? attendance.length;
    const attendanceSummary: AerobicsAttendanceSummary = {
      total: totalVisits,
      lastVisit: attendance[0]?.checkedInAt || null,
      recent: attendance,
    };

    // Handle Payments mapping
    const paymentRows = (paymentsRes.data || []) as any[];
    const payments: AerobicsPaymentRecord[] = paymentRows.map(p => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      paymentMethod: p.payment_method,
      paymentStatus: p.payment_status,
      serviceType: p.service_type,
      paidAt: p.paid_at ?? null,
      createdAt: p.created_at,
      notes: p.notes ?? null,
    }));

    // Handle Locker mapping
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

    // Handle Session mapping
    let session: AerobicsSessionData | null = null;
    let trainer: AerobicsTrainerData | null = null;
    let occupancy: AerobicsOccupancyData | null = null;

    const sRow = sessionRes.data as SessionDbRow | null;
    if (sRow) {
      const rawDays: string[] = Array.isArray(sRow.days) && sRow.days.length > 0
        ? sRow.days
        : sRow.day_of_week !== undefined && sRow.day_of_week !== null && DAY_INDEX_TO_NAME[sRow.day_of_week]
        ? [DAY_INDEX_TO_NAME[sRow.day_of_week]]
        : [];

      session = {
        id: sRow.id,
        name: sRow.name,
        days: rawDays,
        dayOfWeek: sRow.day_of_week,
        startTime: sRow.start_time,
        endTime: sRow.end_time,
        timeSlot: formatTimeSlot(sRow.start_time, sRow.end_time),
        capacity: sRow.capacity ?? 0,
        description: sRow.description ?? null,
        status: sRow.status,
        active: Boolean(sRow.active),
        trainerId: sRow.trainer_id ?? null,
      };

      // 3. Fetch Trainer if trainer_id is set
      if (sRow.trainer_id) {
        const trainerRes: any = await supabase
          .from("trainer_profiles")
          .select("id, first_name, last_name, phone, specialization, is_active")
          .eq("id", sRow.trainer_id)
          .maybeSingle();

        if (trainerRes.error) {
          console.warn("[AerobicsService] Error fetching trainer:", trainerRes.error);
        } else if (trainerRes.data) {
          const trainerRow = trainerRes.data as TrainerDbRow;
          trainer = {
            id: trainerRow.id,
            firstName: trainerRow.first_name,
            lastName: trainerRow.last_name,
            fullName: `${trainerRow.first_name} ${trainerRow.last_name}`.trim(),
            phone: trainerRow.phone ?? null,
            specialization: trainerRow.specialization ?? null,
            isActive: Boolean(trainerRow.is_active),
          };
        }
      }

      // Calculate real Occupancy from database count
      const enrolledCount = occupancyRes.count ?? 0;
      const cap = Math.max(0, session.capacity);
      const availableSpots = Math.max(0, cap - enrolledCount);
      const occupancyPercentage = cap > 0 ? Math.min(100, Math.round((enrolledCount / cap) * 100)) : 0;

      occupancy = {
        enrolledCount,
        capacity: cap,
        availableSpots,
        occupancyPercentage,
      };
    }

    return {
      status: "success",
      data: {
        customer,
        membership,
        session,
        trainer,
        occupancy,
        attendance,
        attendanceTotal: totalVisits,
        attendanceSummary,
        payments,
        locker,
      },
    };
  } catch (err: any) {
    console.error("[AerobicsService] Unexpected error:", err);
    return {
      status: "error",
      error: err?.message || "An unexpected error occurred while loading the Aerobics dashboard.",
    };
  }
}
