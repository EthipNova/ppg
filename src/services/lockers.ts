import { supabase } from "../integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locker, LockerAssignment, LockerSection, LockerStatus, CustomerCategory } from "../types";

const steamDb = supabase as unknown as SupabaseClient;

export interface LockerCustomerOption {
  id: string;
  name: string;
  customerCode: string;
  gender: string | null;
  category: CustomerCategory;
  phone: string | null;
}

export interface LockerData {
  lockers: Locker[];
  assignments: LockerAssignment[];
  customers: LockerCustomerOption[];
}

interface LockerRow {
  id: string;
  locker_number: string;
  location: string;
  key_number: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  active: boolean;
}

interface AssignmentRow {
  id: string;
  locker_id: string;
  customer_id: string;
  assigned_at: string;
  due_date: string | null;
  returned_at: string | null;
  returned_by: string | null;
  status: string;
  assigned_by: string | null;
  notes: string | null;
}

interface CustomerRow {
  id: string;
  first_name: string;
  last_name: string;
  customer_code: string;
  gender: string | null;
  customer_type: string | null;
  phone: string | null;
}

function parseCustomerCategory(rawType?: string | null): CustomerCategory {
  const normalized = (rawType || "").toUpperCase().trim();
  if (normalized === "STUDENT") return "STUDENT";
  if (normalized === "MUSLIM") return "MUSLIM";
  if (normalized === "AEROBICS") return "AEROBICS";
  return "REGULAR";
}

const toLocker = (row: LockerRow): Locker => ({
  id: row.id,
  number: row.locker_number,
  section: (row.location as LockerSection) || "General",
  keyTag: row.key_number ?? "",
  status: (row.status as LockerStatus) || "AVAILABLE",
  notes: row.notes ?? "",
  createdAt: row.created_at,
  isActive: row.active ?? true,
});

/**
 * Fetches all locker inventory, customer assignments, and customer directory from Supabase.
 */
export async function fetchLockerData(): Promise<LockerData> {
  const [lockersResult, assignmentsResult, customersResult, usersResult] = await Promise.all([
    steamDb
      .from("lockers")
      .select("id, locker_number, location, key_number, status, notes, created_at, active")
      .order("locker_number"),
    steamDb
      .from("locker_assignments")
      .select("id, locker_id, customer_id, assigned_at, due_date, returned_at, returned_by, status, assigned_by, notes")
      .order("assigned_at", { ascending: false }),
    steamDb
      .from("customers")
      .select("id, first_name, last_name, customer_code, gender, customer_type, phone")
      .order("last_name"),
    steamDb
      .from("users")
      .select("id, email, role"),
  ]);

  const error = lockersResult.error ?? assignmentsResult.error ?? customersResult.error;
  if (error) {
    console.error("[lockersService] fetchLockerData error:", error);
    throw new Error(`Unable to load lockers: ${error.message}`);
  }

  const staffUserMap = new Map<string, string>();
  if (usersResult.data) {
    for (const u of (usersResult.data as Array<{ id: string; email: string }>)) {
      staffUserMap.set(u.id, u.email);
    }
  }

  const customers: LockerCustomerOption[] = (customersResult.data ?? []).map((row: CustomerRow) => ({
    id: row.id,
    name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
    customerCode: row.customer_code,
    gender: row.gender ?? null,
    category: parseCustomerCategory(row.customer_type),
    phone: row.phone ?? null,
  }));

  const customerMap = new Map<string, LockerCustomerOption>(customers.map(c => [c.id, c]));
  const lockerMap = new Map<string, LockerRow>((lockersResult.data ?? []).map((l: LockerRow) => [l.id, l]));

  const assignments: LockerAssignment[] = (assignmentsResult.data ?? []).map((row: AssignmentRow) => {
    const customer = customerMap.get(row.customer_id);
    const locker = lockerMap.get(row.locker_id);
    const statusNormalized = (row.status || "").toUpperCase();
    const isActive = statusNormalized === "ACTIVE" && !row.returned_at;

    return {
      id: row.id,
      lockerId: row.locker_id,
      memberId: row.customer_id,
      memberName: customer?.name ?? "Unknown Customer",
      assignedAt: row.assigned_at,
      dueDate: row.due_date,
      returnedAt: row.returned_at,
      status: isActive ? "active" : "returned",
      keyReturned: Boolean(row.returned_at),
      lostKeyFee: 0,
      issuedBy: row.assigned_by ? staffUserMap.get(row.assigned_by) || "Staff" : "",
      returnedBy: row.returned_by ? staffUserMap.get(row.returned_by) || "Staff" : "",
      notes: row.notes ?? "",
      keyNumber: locker?.key_number ?? "",
      customerCode: customer?.customerCode || "",
      customerPhone: customer?.phone || null,
      customerCategory: customer?.category || "REGULAR",
    };
  });

  return {
    lockers: (lockersResult.data ?? []).map((row: LockerRow) => toLocker(row)),
    assignments,
    customers,
  };
}

/**
 * Searches real registered customers in Supabase for locker assignment.
 */
export async function searchCustomersForLocker(searchQuery: string): Promise<LockerCustomerOption[]> {
  const normalized = searchQuery.trim().replace(/[,%()]/g, " ");
  if (!normalized) return [];

  let query = steamDb
    .from("customers")
    .select("id, first_name, last_name, customer_code, gender, customer_type, phone")
    .order("last_name")
    .limit(10);

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

  const { data, error } = await query;
  if (error) {
    throw new Error(`Customer search failed: ${error.message}`);
  }

  return (data ?? []).map((row: CustomerRow) => ({
    id: row.id,
    name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
    customerCode: row.customer_code,
    gender: row.gender ?? null,
    category: parseCustomerCategory(row.customer_type),
    phone: row.phone ?? null,
  }));
}

/**
 * Validates locker room gender eligibility.
 * Men's lockers: only male customers.
 * Women's lockers: only female customers.
 * Missing gender: rejected with an explicit clear message.
 */
export function validateLockerRoomEligibility(
  lockerLocation: string,
  customerGender: string | null | undefined
): { eligible: boolean; reason?: string } {
  const room = (lockerLocation || "").trim().toLowerCase();
  const gender = (customerGender || "").trim().toLowerCase();

  if (!gender) {
    return {
      eligible: false,
      reason: "Customer gender is missing in their profile. For privacy and safety, gender must be recorded before assigning a locker room.",
    };
  }

  const isMenLocker = room.includes("men") && !room.includes("women");
  const isWomenLocker = room.includes("women");

  if (isMenLocker && gender !== "male" && gender !== "m") {
    return {
      eligible: false,
      reason: "Ineligible assignment: Only male customers can be assigned to Men's Lockers.",
    };
  }

  if (isWomenLocker && gender !== "female" && gender !== "f") {
    return {
      eligible: false,
      reason: "Ineligible assignment: Only female customers can be assigned to Women's Lockers.",
    };
  }

  return { eligible: true };
}

/**
 * Adds a new locker in Supabase.
 */
export async function addLocker(input: {
  number: string;
  room: "Men" | "Women";
  keyTag?: string;
  notes?: string;
}): Promise<string> {
  const lockerNum = input.number.trim();
  const physicalKey = input.keyTag?.trim() || lockerNum;

  const rpcRes = await steamDb.rpc("add_gym_locker", {
    p_locker_number: lockerNum,
    p_location: input.room,
    p_key_number: physicalKey,
    p_notes: input.notes?.trim() || null,
  });

  if (!rpcRes.error && rpcRes.data) {
    return rpcRes.data as string;
  }

  if (rpcRes.error && !rpcRes.error.message.includes("does not exist")) {
    throw new Error(rpcRes.error.message);
  }

  // Fallback direct table insert
  const { data: insData, error: insErr } = await steamDb
    .from("lockers")
    .insert({
      locker_number: lockerNum,
      location: input.room,
      key_number: physicalKey,
      notes: input.notes?.trim() || null,
      status: "AVAILABLE",
      active: true,
    })
    .select("id")
    .single();

  if (insErr) {
    throw new Error(`Unable to create locker: ${insErr.message}`);
  }

  return (insData as { id: string }).id;
}

/**
 * Edits an existing locker in Supabase.
 */
export async function updateLocker(input: {
  id: string;
  number: string;
  room: "Men" | "Women";
  keyTag?: string;
  notes?: string;
}): Promise<void> {
  const rpcRes = await steamDb.rpc("edit_gym_locker", {
    p_locker_id: input.id,
    p_locker_number: input.number.trim(),
    p_location: input.room,
    p_key_number: input.keyTag?.trim() || null,
    p_notes: input.notes?.trim() || null,
  });

  if (!rpcRes.error) {
    return;
  }

  if (rpcRes.error && !rpcRes.error.message.includes("does not exist")) {
    throw new Error(rpcRes.error.message);
  }

  // Fallback: check active assignment before changing location
  const { data: activeAssignments } = await steamDb
    .from("locker_assignments")
    .select("id")
    .eq("locker_id", input.id)
    .in("status", ["ACTIVE", "active"]);

  if (activeAssignments && activeAssignments.length > 0) {
    const { data: cur } = await steamDb.from("lockers").select("location").eq("id", input.id).single();
    if (cur && cur.location !== input.room) {
      throw new Error("Cannot change locker room while locker has an active customer assignment.");
    }
  }

  const { error: updErr } = await steamDb
    .from("lockers")
    .update({
      locker_number: input.number.trim(),
      location: input.room,
      key_number: input.keyTag?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (updErr) {
    throw new Error(`Unable to update locker: ${updErr.message}`);
  }
}

/**
 * Deletes or archives a locker in Supabase.
 */
export async function deleteLocker(id: string): Promise<void> {
  const rpcRes = await steamDb.rpc("delete_gym_locker", {
    p_locker_id: id,
  });

  if (!rpcRes.error) {
    return;
  }

  if (rpcRes.error && !rpcRes.error.message.includes("does not exist")) {
    throw new Error(rpcRes.error.message);
  }

  // Fallback logic
  const { data: cur, error: curErr } = await steamDb
    .from("lockers")
    .select("id, status, locker_number")
    .eq("id", id)
    .single();

  if (curErr || !cur) {
    throw new Error("Locker not found.");
  }

  if (cur.status === "OCCUPIED" || cur.status === "IN_USE") {
    throw new Error(`Cannot delete occupied locker ${cur.locker_number}.`);
  }

  const { data: activeList } = await steamDb
    .from("locker_assignments")
    .select("id")
    .eq("locker_id", id)
    .in("status", ["ACTIVE", "active"]);

  if (activeList && activeList.length > 0) {
    throw new Error("Cannot delete locker with an active customer assignment.");
  }

  const { data: historyList } = await steamDb
    .from("locker_assignments")
    .select("id")
    .eq("locker_id", id);

  if (historyList && historyList.length > 0) {
    // Preserve history: soft delete / archive
    const { error: archErr } = await steamDb
      .from("lockers")
      .update({
        active: false,
        status: "MAINTENANCE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (archErr) throw new Error(archErr.message);
  } else {
    // Physical delete
    const { error: delErr } = await steamDb.from("lockers").delete().eq("id", id);
    if (delErr) throw new Error(delErr.message);
  }
}

export async function assignLocker(input: {
  lockerId: string;
  customerId: string;
  customerName: string;
  dueDate?: string | null;
  notes?: string;
  issuedBy: string;
}): Promise<void> {
  // Try atomic RPC if present on database
  const rpcRes = await steamDb.rpc("assign_locker", {
    p_locker_id: input.lockerId,
    p_customer_id: input.customerId,
    p_due_date: input.dueDate || null,
    p_notes: input.notes?.trim() || null,
  });

  if (!rpcRes.error) {
    return;
  }

  if (rpcRes.error && !rpcRes.error.message.includes("does not exist")) {
    throw new Error(rpcRes.error.message);
  }

  // Fallback table operations
  const { data: lockerRow, error: lockerErr } = await steamDb
    .from("lockers")
    .select("id, locker_number, location, status, active")
    .eq("id", input.lockerId)
    .single();

  if (lockerErr || !lockerRow) {
    throw new Error("Locker not found in database.");
  }

  if (lockerRow.status !== "AVAILABLE" || lockerRow.active === false) {
    throw new Error(`Locker ${lockerRow.locker_number} is no longer available. Status: ${lockerRow.status}.`);
  }

  const { data: customerRow, error: customerErr } = await steamDb
    .from("customers")
    .select("id, customer_code, first_name, last_name, gender")
    .eq("id", input.customerId)
    .single();

  if (customerErr || !customerRow) {
    throw new Error("Customer record not found in database.");
  }

  const genderCheck = validateLockerRoomEligibility(lockerRow.location, customerRow.gender);
  if (!genderCheck.eligible) {
    throw new Error(genderCheck.reason);
  }

  const { data: existingActive } = await steamDb
    .from("locker_assignments")
    .select("id, locker_id, lockers (locker_number)")
    .eq("customer_id", input.customerId)
    .in("status", ["ACTIVE", "active"]);

  if (existingActive && existingActive.length > 0) {
    const existingLocker = Array.isArray(existingActive[0].lockers)
      ? existingActive[0].lockers[0]
      : existingActive[0].lockers;
    const lNum = existingLocker?.locker_number || "another locker";
    throw new Error(`Customer already holds an active locker assignment (${lNum}). A customer cannot have multiple active lockers.`);
  }

  const { error: insertErr } = await steamDb.from("locker_assignments").insert({
    locker_id: input.lockerId,
    customer_id: input.customerId,
    assigned_at: new Date().toISOString(),
    due_date: input.dueDate || null,
    status: "ACTIVE",
    assigned_by: input.issuedBy,
    notes: input.notes || "",
  });

  if (insertErr) {
    throw new Error(`Failed to save locker assignment: ${insertErr.message}`);
  }

  const { error: updateErr } = await steamDb
    .from("lockers")
    .update({ status: "OCCUPIED" })
    .eq("id", input.lockerId);

  if (updateErr) {
    console.error("[lockersService] Locker status update error:", updateErr);
    throw new Error(`Assignment recorded, but updating locker status failed: ${updateErr.message}`);
  }
}

/**
 * Returns a locker, closes the active assignment, and marks the locker AVAILABLE.
 * Historical assignment records are preserved and never deleted.
 */
export async function returnLockerAssignment(params: {
  assignmentId: string;
  lockerId: string;
  actor: string;
  notes?: string;
}): Promise<void> {
  const rpcRes = await steamDb.rpc("return_locker", {
    p_assignment_id: params.assignmentId,
    p_notes: params.notes || null,
  });

  if (!rpcRes.error) {
    return;
  }

  if (rpcRes.error && !rpcRes.error.message.includes("does not exist")) {
    throw new Error(rpcRes.error.message);
  }

  const returnTimestamp = new Date().toISOString();

  // 1. Close active assignment
  const { error: assignErr } = await steamDb
    .from("locker_assignments")
    .update({
      status: "RETURNED",
      returned_at: returnTimestamp,
      returned_by: params.actor,
      notes: params.notes ? `Returned: ${params.notes}` : undefined,
    })
    .eq("id", params.assignmentId);

  if (assignErr) {
    throw new Error(`Failed to update locker assignment: ${assignErr.message}`);
  }

  // 2. Set locker status to AVAILABLE
  const { error: lockerErr } = await steamDb
    .from("lockers")
    .update({ status: "AVAILABLE" })
    .eq("id", params.lockerId);

  if (lockerErr) {
    throw new Error(`Assignment closed, but updating locker status failed: ${lockerErr.message}`);
  }
}

/**
 * Updates locker condition / maintenance status.
 */
export async function setLockerCondition(
  id: string,
  status: "AVAILABLE" | "MAINTENANCE" | "OUT_OF_SERVICE",
  isActive: boolean,
  reason: string
): Promise<void> {
  const dbStatus = status === "OUT_OF_SERVICE" ? "MAINTENANCE" : status;
  const { error } = await steamDb
    .from("lockers")
    .update({
      status: dbStatus,
      active: isActive,
      notes: reason,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Unable to update locker condition: ${error.message}`);
  }
}

/**
 * Edits locker record details (backward compatibility wrapper).
 */
export async function editLocker(input: {
  id: string;
  number: string;
  section: LockerSection;
  keyTag: string;
  notes: string;
}): Promise<void> {
  const room = (input.section || "").toLowerCase().includes("wom") ? "Women" : "Men";
  return updateLocker({
    id: input.id,
    number: input.number,
    room,
    keyTag: input.keyTag,
    notes: input.notes,
  });
}

/**
 * Creates a single locker (backward compatibility wrapper).
 */
export async function createLocker(input: {
  number: string;
  section: LockerSection;
  keyTag: string;
  notes?: string;
}): Promise<void> {
  const room = (input.section || "").toLowerCase().includes("wom") ? "Women" : "Men";
  await addLocker({
    number: input.number,
    room,
    keyTag: input.keyTag,
    notes: input.notes,
  });
}

/**
 * Creates lockers in bulk.
 */
export async function createLockers(
  items: { number: string; section: LockerSection; keyTag: string }[]
): Promise<void> {
  for (const item of items) {
    await createLocker(item);
  }
}
