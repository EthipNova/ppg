import { supabase } from "../integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerCategory } from "../types";

const db = supabase as unknown as SupabaseClient;

export interface CheckInMembership {
  id: string;
  planId: string | null;
  planName: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  isExpired: boolean;
  isActive: boolean;
  daysRemaining: number;
}

export interface CheckInCustomer {
  id: string;
  customerCode: string; // Member ID e.g. "PP-001"
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  gender: string | null;
  status: string; // e.g. "ACTIVE", "INACTIVE", "BLOCKED"
  category: CustomerCategory;
  studentId?: string | null;
  institution?: string | null;
  studentVerified?: boolean;
  membership: CheckInMembership | null;
  activeLockerNumber?: string | null;
}

export interface AttendanceRecordItem {
  id: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  category: CustomerCategory;
  checkedInAt: string;
  checkInMethod: string;
  notes: string | null;
  accessStatus: "allowed" | "override";
}

interface DbCustomerRow {
  id: string;
  customer_code: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  status: string | null;
  customer_type: string | null;
  student_id: string | null;
  institution: string | null;
  student_verification_status: string | null;
}

interface DbMembershipRow {
  id: string;
  customer_id: string;
  plan_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  plans: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface DbLockerAssignmentRow {
  customer_id: string;
  locker_id: string;
  lockers: { locker_number: string } | { locker_number: string }[] | null;
}

interface DbAttendanceRow {
  id: string;
  customer_id: string;
  checked_in_at: string;
  check_in_method: string;
  notes: string | null;
  customers:
    | {
        id: string;
        customer_code: string;
        first_name: string;
        last_name: string;
        customer_type: string;
      }
    | {
        id: string;
        customer_code: string;
        first_name: string;
        last_name: string;
        customer_type: string;
      }[]
    | null;
}

/**
 * Returns beginning of today in ISO format using the local timezone (UTC+3 for Addis Ababa).
 */
export function getStartOfTodayIso(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const datePart = formatter.format(now); // "YYYY-MM-DD"
  return new Date(`${datePart}T00:00:00+03:00`).toISOString();
}

function parseCustomerCategory(rawType?: string | null): CustomerCategory {
  const normalized = (rawType || "").toUpperCase().trim();
  if (!normalized) return "REGULAR";
  return normalized as CustomerCategory;
}

/**
 * Searches registered customers in Supabase with their membership plan, status, and active locker.
 */
export async function searchCustomersForCheckIn(
  searchQuery: string,
  categoryFilter: CustomerCategory | "ALL" = "ALL"
): Promise<CheckInCustomer[]> {
  const normalized = searchQuery.trim().replace(/[,%()]/g, " ");

  let query = db
    .from("customers")
    .select(
      "id, customer_code, first_name, last_name, phone, email, gender, status, customer_type, student_id, institution, student_verification_status"
    )
    .order("customer_code", { ascending: true })
    .limit(50);

  if (categoryFilter !== "ALL") {
    query = query.eq("customer_type", categoryFilter);
  }

  if (normalized) {
    const terms = normalized.split(/\s+/).filter(Boolean);
    if (terms.length >= 2) {
      query = query.or(
        `and(first_name.ilike.%${terms[0]}%,last_name.ilike.%${terms[1]}%),and(first_name.ilike.%${terms[1]}%,last_name.ilike.%${terms[0]}%),first_name.ilike.%${normalized}%,last_name.ilike.%${normalized}%,customer_code.ilike.%${normalized}%,phone.ilike.%${normalized}%`
      );
    } else {
      query = query.or(
        `first_name.ilike.%${normalized}%,last_name.ilike.%${normalized}%,customer_code.ilike.%${normalized}%,phone.ilike.%${normalized}%`
      );
    }
  }

  const { data, error: customerError } = await query;
  if (customerError) {
    console.error("[checkInService] Customer search error:", customerError);
    throw new Error(`Unable to search customers: ${customerError.message}`);
  }

  const customerRows = (data ?? []) as DbCustomerRow[];
  if (customerRows.length === 0) {
    return [];
  }

  const customerIds = customerRows.map(c => c.id);

  // Parallel fetch: memberships and active locker assignments
  const [membershipsRes, lockersRes] = await Promise.all([
    db
      .from("memberships")
      .select("id, customer_id, plan_id, start_date, end_date, status, plans (id, name)")
      .in("customer_id", customerIds)
      .order("end_date", { ascending: false }),
    db
      .from("locker_assignments")
      .select("customer_id, locker_id, lockers (locker_number)")
      .in("customer_id", customerIds)
      .in("status", ["ACTIVE", "active"]),
  ]);

  // Map memberships by customer_id (taking the most recent active/valid one)
  const membershipMap = new Map<string, CheckInMembership>();
  if (membershipsRes.data) {
    const todayStr = new Date().toISOString().split("T")[0];
    const membershipRows = membershipsRes.data as DbMembershipRow[];

    for (const row of membershipRows) {
      if (!membershipMap.has(row.customer_id)) {
        const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
        const planName = plan?.name || "Membership Plan";
        const endDate = row.end_date;
        const startDate = row.start_date;
        const isDateExpired = endDate ? endDate < todayStr : false;
        const statusNormalized = (row.status || "").toUpperCase();
        const isStatusActive = statusNormalized === "ACTIVE";
        const isExpired = isDateExpired || !isStatusActive;

        let daysRemaining = 0;
        if (endDate) {
          const diffMs = new Date(endDate).getTime() - new Date(todayStr).getTime();
          daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        }

        membershipMap.set(row.customer_id, {
          id: row.id,
          planId: row.plan_id,
          planName,
          startDate,
          endDate,
          status: isExpired ? "EXPIRED" : (row.status || "ACTIVE"),
          isExpired,
          isActive: isStatusActive && !isDateExpired,
          daysRemaining,
        });
      }
    }
  }

  // Map active lockers by customer_id
  const lockerMap = new Map<string, string>();
  if (lockersRes.data) {
    const lockerAssignmentRows = lockersRes.data as DbLockerAssignmentRow[];
    for (const row of lockerAssignmentRows) {
      const locker = Array.isArray(row.lockers) ? row.lockers[0] : row.lockers;
      if (locker?.locker_number) {
        lockerMap.set(row.customer_id, locker.locker_number);
      }
    }
  }

  return customerRows.map(c => {
    const membership = membershipMap.get(c.id) || null;
    const category = parseCustomerCategory(c.customer_type);
    const activeLockerNumber = lockerMap.get(c.id) || null;

    return {
      id: c.id,
      customerCode: c.customer_code,
      firstName: c.first_name,
      lastName: c.last_name,
      fullName: `${c.first_name} ${c.last_name}`.trim(),
      phone: c.phone || "—",
      email: c.email ?? null,
      gender: c.gender ?? null,
      status: c.status?.toUpperCase() || "ACTIVE",
      category,
      studentId: c.student_id,
      institution: c.institution,
      studentVerified: c.student_verification_status === "VERIFIED",
      membership,
      activeLockerNumber,
    };
  });
}

/**
 * Records attendance for a customer in Supabase `attendance` table.
 * Enforces:
 * 1. Customer verification.
 * 2. Membership validity check (with explicit warning for expired/inactive).
 * 3. Prevention of duplicate check-ins on the same day.
 */
export async function recordAttendanceCheckIn(
  customer: CheckInCustomer,
  actor: string,
  overrideReason?: string
): Promise<{ success: boolean; attendanceId: string; checkedInAt: string }> {
  if (!customer.id) {
    throw new Error("Invalid customer record: missing ID.");
  }

  // 1. Check duplicate check-in rule: Has customer already checked in today?
  const todayStart = getStartOfTodayIso();
  const { data: existingAttendance, error: duplicateCheckError } = await db
    .from("attendance")
    .select("id, checked_in_at")
    .eq("customer_id", customer.id)
    .gte("checked_in_at", todayStart)
    .limit(1);

  if (duplicateCheckError) {
    console.warn("[checkInService] Duplicate attendance check warning:", duplicateCheckError.message);
  }

  const existingRows = (existingAttendance ?? []) as { id: string; checked_in_at: string }[];
  if (existingRows.length > 0) {
    const prevTime = new Date(existingRows[0].checked_in_at).toLocaleTimeString();
    throw new Error(
      `Duplicate Check-in: ${customer.fullName} (${customer.customerCode}) has already checked in today at ${prevTime}.`
    );
  }

  // 2. Validate membership status
  const membership = customer.membership;
  const isBlocked = customer.status === "BLOCKED";
  const isExpired = !membership || membership.isExpired || customer.status === "INACTIVE";

  if (isBlocked) {
    throw new Error(`Access Denied: Customer ${customer.fullName} is blocked in the system.`);
  }

  if (isExpired && !overrideReason) {
    const reason = !membership
      ? "No active membership found on file"
      : membership.endDate
      ? `Membership expired on ${membership.endDate}`
      : "Membership is currently inactive";
    throw new Error(`Membership Warning: ${reason}. Check-in cannot be recorded without receptionist override.`);
  }

  // 3. Obtain current user id if logged in
  const { data: authData } = await db.auth.getUser();
  const recordedBy = authData?.user?.id || null;

  const checkInTimestamp = new Date().toISOString();
  const notes = overrideReason
    ? `Reception override by ${actor}: ${overrideReason}`
    : `Reception check-in by ${actor}`;

  // 4. Try atomic RPC if available
  const rpcResult = await db.rpc("record_reception_checkin", {
    p_customer_id: customer.id,
    p_notes: notes,
    p_is_override: Boolean(overrideReason),
  });

  if (!rpcResult.error && rpcResult.data) {
    return {
      success: true,
      attendanceId: rpcResult.data as string,
      checkedInAt: checkInTimestamp,
    };
  }

  // 5. Fall back to verified direct table insert
  const { data: insertResult, error: insertError } = await db
    .from("attendance")
    .insert({
      customer_id: customer.id,
      checked_in_at: checkInTimestamp,
      check_in_method: "MANUAL",
      notes,
      recorded_by: recordedBy,
    })
    .select("id, checked_in_at")
    .single();

  if (insertError) {
    console.error("[checkInService] Attendance insert error:", insertError);
    throw new Error(`Failed to record attendance in database: ${insertError.message}`);
  }

  const inserted = insertResult as { id: string; checked_in_at?: string } | null;
  if (!inserted) {
    throw new Error("Attendance record was inserted but no ID was returned.");
  }

  return {
    success: true,
    attendanceId: inserted.id,
    checkedInAt: inserted.checked_in_at || checkInTimestamp,
  };
}

/**
 * Fetches check-in attendance records for today from Supabase.
 */
export async function fetchTodayAttendance(): Promise<AttendanceRecordItem[]> {
  const todayStart = getStartOfTodayIso();

  const { data, error } = await db
    .from("attendance")
    .select(`
      id,
      customer_id,
      checked_in_at,
      check_in_method,
      notes,
      customers (
        id,
        customer_code,
        first_name,
        last_name,
        customer_type
      )
    `)
    .gte("checked_in_at", todayStart)
    .order("checked_in_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[checkInService] fetchTodayAttendance error:", error);
    return [];
  }

  const rows = (data ?? []) as DbAttendanceRow[];

  return rows.map(row => {
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const customerName = customer
      ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
      : "Unknown Customer";
    const customerCode = customer?.customer_code || "—";
    const category = parseCustomerCategory(customer?.customer_type);
    const isOverride = Boolean(row.notes && row.notes.toLowerCase().includes("override"));

    return {
      id: row.id,
      customerId: row.customer_id,
      customerCode,
      customerName,
      category,
      checkedInAt: row.checked_in_at,
      checkInMethod: row.check_in_method,
      notes: row.notes,
      accessStatus: isOverride ? "override" : "allowed",
    };
  });
}
