import { supabase } from "../integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locker, LockerAssignment, LockerSection, LockerStatus } from "../types";

const steamDb = supabase as unknown as SupabaseClient;

export interface LockerData {
  lockers: Locker[];
  assignments: LockerAssignment[];
  customers: { id: string; name: string; customerCode: string }[];
}

interface LockerRow { id: string; locker_number: string; location: string; key_number: string | null; status: string; notes: string | null; created_at: string; is_active: boolean; }
interface AssignmentRow { id: string; locker_id: string; customer_id: string; assigned_at: string; due_date: string | null; returned_at: string | null; returned_by: string | null; status: string; assigned_by: string | null; notes: string | null; key_returned: boolean; key_number: string | null; lost_key_fee: number; }

const toLocker = (row: LockerRow): Locker => ({ id: row.id, number: row.locker_number, section: row.location as LockerSection, keyTag: row.key_number ?? "", status: row.status as LockerStatus, notes: row.notes ?? "", createdAt: row.created_at, isActive: row.is_active });

export async function fetchLockerData(): Promise<LockerData> {
  const [lockersResult, assignmentsResult, customersResult] = await Promise.all([
    steamDb.from("lockers").select("id, locker_number, location, key_number, status, notes, created_at, is_active").order("locker_number"),
    steamDb.from("locker_assignments").select("id, locker_id, customer_id, assigned_at, due_date, returned_at, returned_by, status, assigned_by, notes, key_returned, key_number, lost_key_fee").order("assigned_at", { ascending: false }),
    steamDb.from("customers").select("id, first_name, last_name, customer_code").order("last_name"),
  ]);
  const error = lockersResult.error ?? assignmentsResult.error ?? customersResult.error;
  if (error) throw new Error(`Unable to load lockers: ${error.message}`);
  const customers = (customersResult.data ?? []).map(row => ({ id: row.id, name: `${row.first_name} ${row.last_name}`.trim(), customerCode: row.customer_code }));
  const customerNames = new Map(customers.map(customer => [customer.id, customer.name]));
  const assignments = (assignmentsResult.data ?? []).map(row => { const assignment = row as AssignmentRow; return { id: assignment.id, lockerId: assignment.locker_id, memberId: assignment.customer_id, memberName: customerNames.get(assignment.customer_id) ?? "Unknown", assignedAt: assignment.assigned_at, dueDate: assignment.due_date, returnedAt: assignment.returned_at, status: assignment.status as LockerAssignment["status"], keyReturned: assignment.key_returned, lostKeyFee: Number(assignment.lost_key_fee ?? 0), issuedBy: assignment.assigned_by ?? "", returnedBy: assignment.returned_by ?? "", notes: assignment.notes ?? "", keyNumber: assignment.key_number }; });
  return {
    lockers: (lockersResult.data ?? []).map(row => toLocker(row as LockerRow)),
    assignments,
    customers,
  };
}

export async function createLocker(input: { number: string; section: LockerSection; keyTag: string }) {
  const result = await steamDb.rpc("create_lockers", { p_items: [{ number: input.number, location: input.section, key_number: input.keyTag }] });
  if (result.error) throw new Error(`Unable to create locker: ${result.error.message}`);
}

export async function createLockers(items: { number: string; section: LockerSection; keyTag: string }[]) {
  const result = await steamDb.rpc("create_lockers", { p_items: items.map(item => ({ number: item.number, location: item.section, key_number: item.keyTag })) });
  if (result.error) throw new Error(`Unable to create lockers: ${result.error.message}`);
}

export async function updateLockerStatus(id: string, status: LockerStatus, notes?: string) {
  const result = await steamDb.rpc("set_locker_condition", { p_locker_id: id, p_status: status === "AVAILABLE" ? "AVAILABLE" : "OUT_OF_SERVICE", p_is_active: true, p_reason: notes?.trim() || "Condition updated by owner" });
  if (result.error) throw new Error(`Unable to update locker: ${result.error.message}`);
}

export async function setLockerCondition(id: string, status: "AVAILABLE" | "OUT_OF_SERVICE", isActive: boolean, reason: string) {
  const result = await steamDb.rpc("set_locker_condition", { p_locker_id: id, p_status: status, p_is_active: isActive, p_reason: reason });
  if (result.error) throw new Error(`Unable to update locker condition: ${result.error.message}`);
}

export async function editLocker(input: { id: string; number: string; section: LockerSection; keyTag: string; notes: string }) {
  const result = await steamDb.rpc("edit_locker", { p_locker_id: input.id, p_number: input.number, p_location: input.section, p_key_number: input.keyTag, p_notes: input.notes });
  if (result.error) throw new Error(`Unable to edit locker: ${result.error.message}`);
}

export async function assignLocker(input: { lockerId: string; customerId: string; customerName: string; dueDate: string | null; notes: string; issuedBy: string }) {
  const result = await steamDb.rpc("assign_locker_with_key", { p_locker_id: input.lockerId, p_customer_id: input.customerId, p_due_date: input.dueDate, p_notes: input.notes });
  if (result.error) throw new Error(`Unable to assign locker: ${result.error.message}`);
}

export async function returnLockerAssignment(assignment: LockerAssignment) {
  const result = await steamDb.rpc("return_locker_key", { p_assignment_id: assignment.id, p_notes: null });
  if (result.error) throw new Error(`Unable to return locker: ${result.error.message}`);
}

export async function loseLockerKey(assignment: LockerAssignment, fee: number, notes: string) {
  const result = await steamDb.rpc("lose_locker_key", { p_assignment_id: assignment.id, p_fee: fee, p_reason: notes });
  if (result.error) throw new Error(`Unable to record lost key: ${result.error.message}`);
}
