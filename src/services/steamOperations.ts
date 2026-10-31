import { supabase } from "../integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cast to SupabaseClient for newly added tables and RPCs
const steamDb = supabase as unknown as SupabaseClient;

export interface SteamCustomerOption {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  category: string;
}

export interface SteamServiceOffering {
  id: string;
  name: string;
  price: number;
  description: string | null;
  active: boolean;
}

export interface SteamServiceRecord {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  customer_phone: string | null;
  customer_category: string;
  service_id: string | null;
  service_name: string;
  amount: number;
  payment_method: string;
  payment_reference: string | null;
  payment_proof_path: string;
  payment_status: "PENDING_VERIFICATION" | "APPROVED" | "REJECTED";
  service_status: "AWAITING_VERIFICATION" | "READY_FOR_ACCESS" | "AUTHORIZED" | "COMPLETED" | "CANCELLED";
  registered_by: string | null;
  registered_by_email: string | null;
  verified_by: string | null;
  verified_by_email: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  authorized_by: string | null;
  authorized_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SteamSummaryStats {
  today_services: number;
  pending_payments: number;
  approved_payments: number;
  in_progress_services?: number;
  completed_services: number;
  today_revenue: number;
}

export interface RegisterSteamInput {
  customerId: string;
  serviceId?: string | null;
  amount: number;
  paymentMethod: string;
  paymentReference?: string;
  proofFile?: File | null;
  authorizeImmediately?: boolean;
}

const MAX_PROOF_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Searches customers for Steam registration by Name, Member ID (customer_code), or Phone.
 */
export async function searchCustomersForSteam(query: string): Promise<SteamCustomerOption[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];

  const { data, error } = await supabase
    .from("customers")
    .select("id, customer_code, first_name, last_name, phone, customer_type")
    .or(`first_name.ilike.%${clean}%,last_name.ilike.%${clean}%,customer_code.ilike.%${clean}%,phone.ilike.%${clean}%`)
    .order("customer_code", { ascending: true })
    .limit(10);

  if (error) {
    console.error("searchCustomersForSteam error:", error);
    throw new Error(`Unable to search customers: ${error.message}`);
  }

  return (data || []).map(c => ({
    id: c.id,
    name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Customer",
    code: c.customer_code || "—",
    phone: c.phone || null,
    category: c.customer_type || "REGULAR",
  }));
}

/**
 * Fetches the single active Steam/Sauna service configuration.
 * Returns null if no Steam service is currently configured/active.
 */
export async function fetchActiveSteamService(): Promise<SteamServiceOffering | null> {
  const { data, error } = await steamDb.rpc("get_active_steam_service");

  if (error) {
    console.warn("get_active_steam_service RPC error, falling back to query:", error);
    const { data: qData, error: qError } = await steamDb
      .from("services")
      .select("id, name, price, description, is_active")
      .eq("is_active", true)
      .or("name.ilike.%steam%,name.ilike.%sauna%")
      .limit(1)
      .maybeSingle();

    if (qError) {
      console.error("fetchActiveSteamService query error:", qError);
      return null;
    }
    if (!qData) return null;
    const item = qData as { id: string; name: string; price: number; description: string | null; is_active: boolean };
    return {
      id: item.id,
      name: item.name,
      price: Number(item.price),
      description: item.description,
      active: Boolean(item.is_active),
    };
  }

  if (data && Array.isArray(data) && data.length > 0) {
    const s = data[0];
    return {
      id: s.id,
      name: s.name,
      price: Number(s.price),
      description: s.description,
      active: Boolean(s.is_active),
    };
  }

  return null;
}

/**
 * Saves (adds or edits) the single Steam service price (Admin only).
 */
export async function saveSteamServiceConfig(price: number): Promise<SteamServiceOffering> {
  const priceNum = Number(price);
  if (isNaN(priceNum) || priceNum <= 0) {
    throw new Error("Steam service price must be a valid positive amount greater than 0.");
  }

  const { data, error } = await steamDb.rpc("save_steam_service_config", {
    p_price: priceNum,
  });

  if (error) {
    console.error("save_steam_service_config RPC error:", error);
    throw new Error(error.message || "Failed to save Steam service configuration.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    description: "Official PowerPlus Gym Steam & Sauna Session Pass",
    active: Boolean(row.is_active),
  };
}

/**
 * Deletes (deactivates) the single Steam service configuration (Admin only).
 * Disables new Steam registrations while completely preserving all historical transactions.
 */
export async function deleteSteamServiceConfig(): Promise<void> {
  const { error } = await steamDb.rpc("delete_steam_service_config");

  if (error) {
    console.error("delete_steam_service_config RPC error:", error);
    throw new Error(error.message || "Failed to delete Steam service configuration.");
  }
}

/**
 * Loads configurable steam services from public.services.
 */
export async function fetchSteamOfferings(): Promise<SteamServiceOffering[]> {
  const single = await fetchActiveSteamService();
  return single ? [single] : [];
}

/**
 * Updates or creates a Steam service offering (Admin only).
 */
export async function saveSteamOffering(
  offering: { id?: string; name: string; price: number; description?: string; active: boolean }
): Promise<void> {
  await saveSteamServiceConfig(offering.price);
}


/**
 * Uploads a payment proof photo to private storage bucket 'payment-proofs'.
 */
export async function uploadSteamPaymentProof(file: File, customerId: string): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Invalid file type. Please upload a JPEG, PNG, or WEBP image.");
  }
  if (file.size > MAX_PROOF_SIZE_BYTES) {
    throw new Error("Image file is too large. Maximum allowed size is 5MB.");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const uniqueName = `steam-proofs/${Date.now()}_${customerId.slice(0, 8)}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .upload(uniqueName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (error || !data?.path) {
    console.error("Proof upload error:", error);
    throw new Error(`Failed to upload payment proof photo: ${error?.message || "Unknown error"}`);
  }

  return data.path;
}

/**
 * Generates an authenticated, short-lived signed URL to view private payment proof photo.
 */
export async function getSteamProofSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(path, 3600); // 1 hour validity

  if (error || !data?.signedUrl) {
    console.error("Signed URL error:", error);
    throw new Error(`Unable to generate secure view link: ${error?.message || "Not found"}`);
  }

  return data.signedUrl;
}

/**
 * Reception registers a Steam service with customer, payment, and optional uploaded proof.
 * Cash payments require no photo upload and store NULL proof path.
 * Electronic payments (Telebirr, CBE Birr) require photo upload.
 */
export async function registerSteamService(input: RegisterSteamInput): Promise<string> {
  if (!input.customerId) {
    throw new Error("Please select a customer.");
  }
  if (!input.amount || input.amount <= 0) {
    throw new Error("Please enter a valid positive service price.");
  }
  if (!input.paymentMethod) {
    throw new Error("Please select a payment method.");
  }

  const normalizedMethod = input.paymentMethod.toUpperCase().trim();
  if (!["CASH", "TELEBIRR", "CBE_BIRR"].includes(normalizedMethod)) {
    throw new Error("Invalid payment method. Only Cash, Telebirr, and CBE Birr are supported.");
  }

  let proofPath: string | null = null;

  // If electronic payment method, validate and upload proof photo
  if (normalizedMethod !== "CASH") {
    if (!input.proofFile) {
      throw new Error(`Payment screenshot or photo is required for ${input.paymentMethod}.`);
    }
    proofPath = await uploadSteamPaymentProof(input.proofFile, input.customerId);
  }

  // Call atomic registration RPC with immediate authorization support
  const authorizeImmediately = input.authorizeImmediately ?? true;
  let rpcData: unknown;
  let rpcError: Error | { message: string } | null = null;

  try {
    const res = await steamDb.rpc("register_steam_service", {
      p_customer_id: input.customerId,
      p_service_id: input.serviceId || null,
      p_amount: input.amount,
      p_payment_method: normalizedMethod,
      p_payment_reference: input.paymentReference?.trim() || null,
      p_proof_path: proofPath,
      p_authorize_immediately: authorizeImmediately,
    });
    if (res.error) {
      rpcError = res.error;
    } else {
      rpcData = res.data;
    }
  } catch (err) {
    rpcError = err instanceof Error ? err : new Error(String(err));
  }

  if (rpcError) {
    console.error("registerSteamService RPC error:", rpcError);
    // Best-effort cleanup of orphan uploaded file
    if (proofPath) {
      try {
        await supabase.storage.from("payment-proofs").remove([proofPath]);
      } catch {
        // ignore cleanup errors
      }
    }
    throw new Error(`Failed to register steam service: ${rpcError.message}`);
  }

  const result = rpcData as { success: boolean; steam_service_id: string };
  return result.steam_service_id;
}

/**
 * Admin verifies payment: approve or reject with reason.
 */
export async function verifySteamPayment(
  serviceId: string,
  approve: boolean,
  reason?: string
): Promise<void> {
  if (!approve && (!reason || !reason.trim())) {
    throw new Error("A rejection reason is required when rejecting a payment.");
  }

  const { error } = await steamDb.rpc("verify_steam_payment", {
    p_service_id: serviceId,
    p_approve: approve,
    p_reason: reason?.trim() || null,
  });

  if (error) {
    console.error("verifySteamPayment error:", error);
    throw new Error(`Payment verification failed: ${error.message}`);
  }
}

/**
 * Reception authorizes customer to access the steam room after Admin approval.
 */
export async function authorizeSteamAccess(serviceId: string): Promise<void> {
  const { error } = await steamDb.rpc("authorize_steam_access", {
    p_service_id: serviceId,
  });

  if (error) {
    console.error("authorizeSteamAccess error:", error);
    throw new Error(`Failed to authorize steam access: ${error.message}`);
  }
}

/**
 * Reception marks customer steam room usage completed.
 */
export async function completeSteamService(serviceId: string): Promise<void> {
  const { error } = await steamDb.rpc("complete_steam_service", {
    p_service_id: serviceId,
  });

  if (error) {
    console.error("completeSteamService error:", error);
    throw new Error(`Failed to complete steam service: ${error.message}`);
  }
}

/**
 * Fetches summary statistics for the Reception & Admin dashboard cards.
 */
export async function fetchSteamSummaryStats(): Promise<SteamSummaryStats> {
  const { data, error } = await steamDb.rpc("get_steam_summary_stats");

  if (error) {
    console.error("fetchSteamSummaryStats error:", error);
    throw new Error(`Failed to load Steam summary stats: ${error.message}`);
  }

  const raw = data as {
    today_services?: number;
    pending_payments?: number;
    approved_payments?: number;
    in_progress_services?: number;
    completed_services?: number;
    today_revenue?: number;
  };

  return {
    today_services: Number(raw?.today_services || 0),
    pending_payments: Number(raw?.pending_payments || 0),
    approved_payments: Number(raw?.approved_payments || 0),
    in_progress_services: Number(raw?.in_progress_services || 0),
    completed_services: Number(raw?.completed_services || 0),
    today_revenue: Number(raw?.today_revenue || 0),
  };
}

/**
 * Fetches steam services list filtered by tab (ALL, PENDING, APPROVED, IN_PROGRESS, COMPLETED) and optional search term.
 */
export async function fetchSteamServicesList(
  tab: "ALL" | "PENDING" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" = "ALL",
  search?: string
): Promise<SteamServiceRecord[]> {
  const { data, error } = await steamDb.rpc("get_steam_services_list", {
    p_tab: tab,
    p_status: tab,
    p_search: search?.trim() || null,
  });

  if (error) {
    console.error("fetchSteamServicesList error:", error);
    throw new Error(`Failed to load steam services: ${error.message}`);
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    customer_id: String(row.customer_id),
    customer_name: String(row.customer_name || "Customer"),
    customer_code: String(row.customer_code || "—"),
    customer_phone: row.customer_phone ? String(row.customer_phone) : null,
    customer_category: String(row.customer_category || "REGULAR"),
    service_id: row.service_id ? String(row.service_id) : null,
    service_name: String(row.service_name || "Steam Room Pass"),
    amount: Number(row.amount || 0),
    payment_method: String(row.payment_method || "CASH"),
    payment_reference: row.payment_reference ? String(row.payment_reference) : null,
    payment_proof_path: String(row.payment_proof_path),
    payment_status: row.payment_status as SteamServiceRecord["payment_status"],
    service_status: row.service_status as SteamServiceRecord["service_status"],
    registered_by: row.registered_by ? String(row.registered_by) : null,
    registered_by_email: row.registered_by_email ? String(row.registered_by_email) : null,
    verified_by: row.verified_by ? String(row.verified_by) : null,
    verified_by_email: row.verified_by_email ? String(row.verified_by_email) : null,
    verified_at: row.verified_at ? String(row.verified_at) : null,
    rejection_reason: row.rejection_reason ? String(row.rejection_reason) : null,
    authorized_by: row.authorized_by ? String(row.authorized_by) : null,
    authorized_at: row.authorized_at ? String(row.authorized_at) : null,
    completed_by: row.completed_by ? String(row.completed_by) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}
