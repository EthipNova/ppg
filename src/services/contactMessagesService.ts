import { supabase } from "../integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = supabase as unknown as SupabaseClient;

export type ContactMessageStatus = "NEW" | "READ" | "RESOLVED";

export interface ContactMessage {
  id: string;
  name: string;
  phone: string;
  message: string;
  status: ContactMessageStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface ContactMessageRow {
  id: string;
  name: string;
  phone: string;
  message: string;
  status: "NEW" | "READ" | "RESOLVED";
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Validates Ethiopian and international phone numbers.
 * Accepts formats:
 * - Local: 0911234567, 0711234567 (10 digits)
 * - Country code: +251911234567, +251711234567, 251911234567 (12-13 digits)
 * - General mobile: digits, optional plus, dashes, spaces (min 9 digits, max 16 digits)
 */
export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-().]/g, "");
  // Ethiopian format: +251 9... or +251 7..., or 09..., or 07...
  if (/^(\+?251|0)?[79]\d{8}$/.test(cleaned)) {
    return true;
  }
  // Generic international phone: 9 to 15 digits, optional leading +
  return /^\+?\d{9,15}$/.test(cleaned);
}

/**
 * Formats a phone number for display.
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[\s\-().]/g, "");
  if (/^0[79]\d{8}$/.test(cleaned)) {
    return `+251 ${cleaned.slice(1, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  }
  if (/^251[79]\d{8}$/.test(cleaned)) {
    return `+251 ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
  }
  if (/^\+251[79]\d{8}$/.test(cleaned)) {
    return `+251 ${cleaned.slice(4, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`;
  }
  return phone;
}

/**
 * Submits a contact message from the public website to Supabase.
 * Uses public INSERT policy.
 */
export async function submitContactMessage(payload: {
  name: string;
  phone: string;
  message: string;
}): Promise<void> {
  const name = payload.name.trim();
  const phone = payload.phone.trim();
  const message = payload.message.trim();

  if (!name) {
    throw new Error("Please enter your name.");
  }
  if (!phone) {
    throw new Error("Please enter your phone number.");
  }
  if (!isValidPhoneNumber(phone)) {
    throw new Error("Please enter a valid phone number (e.g., 0911 234 567 or +251 911 234 567).");
  }
  if (!message) {
    throw new Error("Please enter a message.");
  }

  const { error } = await db.from("contact_messages").insert([
    {
      name,
      phone,
      message,
      status: "NEW",
    },
  ]);

  if (error) {
    console.error("[contactMessagesService] Failed to insert contact message:", error);
    throw new Error(error.message || "Failed to submit message. Please try again.");
  }
}

/**
 * Fetches contact messages for Reception and Admin staff.
 */
export async function fetchContactMessages(
  statusFilter?: "ALL" | "NEW" | "READ" | "RESOLVED",
  searchQuery?: string
): Promise<ContactMessage[]> {
  try {
    let query = db
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "ALL") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[contactMessagesService] Failed to fetch contact messages:", error);
      throw new Error(error.message || "Failed to load contact messages.");
    }

    const rows = (data || []) as unknown as ContactMessageRow[];
    let results: ContactMessage[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      message: row.message,
      status: row.status,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      results = results.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.phone.toLowerCase().includes(q) ||
          m.message.toLowerCase().includes(q)
      );
    }

    return results;
  } catch (err: unknown) {
    console.error("[contactMessagesService] Error:", err);
    throw err;
  }
}

/**
 * Updates status and optional notes on a contact message.
 */
export async function updateContactMessageStatus(
  id: string,
  status: "NEW" | "READ" | "RESOLVED",
  notes?: string
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (notes !== undefined) {
    updates.notes = notes;
  }

  const { error } = await db
    .from("contact_messages")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("[contactMessagesService] Failed to update message status:", error);
    throw new Error(error.message || "Failed to update status.");
  }
}

/**
 * Deletes a contact message (Admin/Reception).
 */
export async function deleteContactMessage(id: string): Promise<void> {
  const { error } = await db
    .from("contact_messages")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[contactMessagesService] Failed to delete message:", error);
    throw new Error(error.message || "Failed to delete message.");
  }
}
