import { supabase } from "../integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const staffDb = supabase as unknown as SupabaseClient;

export interface StaffMemberRecord {
  id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  login_id: string;
  phone: string;
  role: "Receptionist" | "Trainer";
  is_active: boolean;
  specialization?: string | null;
  created_at: string;
}

export interface RegisterStaffInput {
  fullName: string;
  phone: string;
  role: "Receptionist" | "Trainer";
}

export interface RegisterStaffResult {
  success: boolean;
  userId: string;
  fullName: string;
  phone: string;
  role: "Receptionist" | "Trainer";
  loginId: string;
  tempPassword: string;
  email: string;
}

export interface UpdateStaffInput {
  userId: string;
  fullName: string;
  phone: string;
  role: "Receptionist" | "Trainer";
  isActive: boolean;
  specialization?: string;
}

export interface UpdateStaffResult {
  success: boolean;
  userId: string;
  fullName: string;
  phone: string;
  role: "Receptionist" | "Trainer";
  isActive: boolean;
}

export interface DeleteStaffResult {
  success: boolean;
  userId: string;
  action: "DEACTIVATED" | "DELETED";
  hasHistoricalRecords: boolean;
  message: string;
}

/**
 * Generates a cryptographically secure temporary password.
 * Format: PP@ + 6 uppercase/lowercase/digit characters (e.g. PP@7kX9mQ)
 */
export function generateSecureTemporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const array = new Uint8Array(6);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 6; i++) {
      array[i] = Math.floor(Math.random() * chars.length);
    }
  }
  let randomPart = "";
  for (let i = 0; i < 6; i++) {
    randomPart += chars[array[i] % chars.length];
  }
  return `PP@${randomPart}`;
}

/**
 * Fetches the registered staff members list for the Admin dashboard.
 */
export async function fetchStaffMembers(): Promise<StaffMemberRecord[]> {
  const { data, error } = await staffDb.rpc("get_staff_members_list");

  if (error) {
    console.error("fetchStaffMembers RPC error:", error);
    throw new Error(`Failed to load staff members: ${error.message}`);
  }

  return (data || []).map((row: {
    id: string;
    full_name: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    login_id: string;
    phone: string;
    role: string;
    is_active: boolean;
    specialization?: string | null;
    created_at: string;
  }) => ({
    id: row.id,
    full_name: row.full_name,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    login_id: row.login_id,
    phone: row.phone,
    role: row.role === "Trainer" ? "Trainer" : "Receptionist",
    is_active: Boolean(row.is_active),
    specialization: row.specialization ?? null,
    created_at: row.created_at,
  }));
}

/**
 * Registers a new staff member (Receptionist or Trainer) via Admin RPC.
 * Server creates auth account, generates unique login ID, and inserts staff profile.
 */
export async function registerStaffMember(input: RegisterStaffInput): Promise<RegisterStaffResult> {
  const trimmedName = input.fullName.trim();
  const trimmedPhone = input.phone.trim();

  if (!trimmedName || trimmedName.length < 2) {
    throw new Error("Please enter a valid full name (at least 2 characters).");
  }

  if (!trimmedPhone || trimmedPhone.length < 5) {
    throw new Error("Please enter a valid phone number.");
  }

  if (input.role !== "Receptionist" && input.role !== "Trainer") {
    throw new Error("Invalid role selected. Role must be Receptionist or Trainer.");
  }

  const tempPassword = generateSecureTemporaryPassword();

  const { data, error } = await staffDb.rpc("admin_register_staff_member", {
    p_full_name: trimmedName,
    p_phone: trimmedPhone,
    p_role: input.role,
    p_temp_password: tempPassword,
  });

  if (error) {
    console.error("admin_register_staff_member RPC error:", error);
    throw new Error(error.message || "Failed to create staff member account.");
  }

  const payload = data as {
    success: boolean;
    user_id: string;
    full_name: string;
    phone: string;
    role: string;
    login_id: string;
    temp_password?: string;
    email: string;
  };

  return {
    success: payload.success,
    userId: payload.user_id,
    fullName: payload.full_name,
    phone: payload.phone,
    role: payload.role === "Trainer" ? "Trainer" : "Receptionist",
    loginId: payload.login_id,
    tempPassword: payload.temp_password || tempPassword,
    email: payload.email,
  };
}

/**
 * Updates an existing staff member's information (Admin only).
 * Preserves authentication credentials and login ID while updating profile and role.
 */
export async function updateStaffMember(input: UpdateStaffInput): Promise<UpdateStaffResult> {
  const trimmedName = input.fullName.trim();
  const trimmedPhone = input.phone.trim();

  if (!trimmedName || trimmedName.length < 2) {
    throw new Error("Please enter a valid full name (at least 2 characters).");
  }

  if (!trimmedPhone || trimmedPhone.length < 5) {
    throw new Error("Please enter a valid phone number.");
  }

  const { data, error } = await staffDb.rpc("admin_update_staff_member", {
    p_user_id: input.userId,
    p_full_name: trimmedName,
    p_phone: trimmedPhone,
    p_role: input.role,
    p_is_active: input.isActive,
    p_specialization: input.specialization?.trim() || null,
  });

  if (error) {
    console.error("admin_update_staff_member RPC error:", error);
    throw new Error(error.message || "Failed to update staff member.");
  }

  const payload = data as {
    success: boolean;
    user_id: string;
    full_name: string;
    phone: string;
    role: string;
    is_active: boolean;
  };

  return {
    success: payload.success,
    userId: payload.user_id,
    fullName: payload.full_name,
    phone: payload.phone,
    role: payload.role === "Trainer" ? "Trainer" : "Receptionist",
    isActive: payload.is_active,
  };
}

/**
 * Safely deactivates or permanently deletes a staff member (Admin only).
 * If the staff member has historical records (payments, attendance, assignments),
 * safe deactivation is performed to preserve historical integrity.
 */
export async function deleteStaffMember(
  userId: string,
  forcePermanent = false
): Promise<DeleteStaffResult> {
  if (!userId) {
    throw new Error("Staff user ID is required.");
  }

  const { data, error } = await staffDb.rpc("admin_delete_staff_member", {
    p_user_id: userId,
    p_force_permanent: forcePermanent,
  });

  if (error) {
    console.error("admin_delete_staff_member RPC error:", error);
    throw new Error(error.message || "Failed to delete staff member.");
  }

  const payload = data as {
    success: boolean;
    user_id: string;
    action: "DEACTIVATED" | "DELETED";
    has_historical_records: boolean;
    message: string;
  };

  return {
    success: payload.success,
    userId: payload.user_id,
    action: payload.action,
    hasHistoricalRecords: payload.has_historical_records,
    message: payload.message,
  };
}

