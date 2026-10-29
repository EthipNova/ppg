import { supabase } from "../integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateProofFile, MAX_FILE_SIZE_BYTES } from "./regularRenewalService";

const steamDb = supabase as unknown as SupabaseClient;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { validateProofFile, MAX_FILE_SIZE_BYTES };

export interface SteamCatalogItem {
  id: string; // references public.services(id)
  type: "per-visit" | "package";
  name: string;
  price: number;
  visits: number;
  validityDays: number;
  validityLabel: string;
  description: string;
}

export interface CustomerPendingSteamPayment {
  id: string;
  customerId: string;
  amount: number;
  paymentMethod: "CBE_BIRR" | "TELEBIRR" | "CASH" | string;
  paymentStatus: "PENDING";
  serviceType: "STEAM";
  serviceId: string | null;
  transactionReference: string | null;
  productName: string;
  visits: number;
  createdAt: string;
  notes: string | null;
}

export interface SubmitSteamPaymentProofParams {
  customerId: string;
  serviceId: string;
  productType: "per-visit" | "package";
  paymentMethod: "cbe_birr" | "telebirr";
  file: File;
}

export interface SubmitSteamPaymentProofResult {
  success: boolean;
  paymentId?: string;
  filePath?: string;
  error?: string;
}

/**
 * Returns the customer-facing Steam products catalog.
 */
export async function fetchSteamCatalog(): Promise<SteamCatalogItem[]> {
  const { data: options, error: optionsError } = await steamDb
    .from("steam_service_options")
    .select("service_id, access_type, duration_days, usage_limit")
    .order("created_at");
  if (optionsError) throw new Error(`Unable to load Steam services: ${optionsError.message}`);
  if (!options?.length) return [];
  const { data: services, error: serviceError } = await steamDb
    .from("services")
    .select("id, name, description, price, is_active")
    .in("id", options.map(option => option.service_id))
    .eq("is_active", true);
  if (serviceError) throw new Error(`Unable to load Steam service prices: ${serviceError.message}`);
  const byId = new Map((services ?? []).map(service => [service.id, service]));
  return options.flatMap(option => {
    const service = byId.get(option.service_id);
    if (!service) return [];
    const validityDays = Number(option.duration_days);
    const visits = option.usage_limit === null ? 0 : Number(option.usage_limit);
    return [{
      id: service.id,
      type: option.access_type as SteamCatalogItem["type"],
      name: service.name,
      price: Number(service.price),
      visits,
      validityDays,
      validityLabel: `Valid for ${validityDays} day${validityDays === 1 ? "" : "s"}`,
      description: service.description ?? "",
    }];
  });
}

/**
 * Checks if the specific customer currently has an unverified PENDING Steam payment.
 * Strictly scoped to customer_id = customerId.
 */
export async function fetchCustomerPendingSteamPayment(
  customerId: string
): Promise<{ data: CustomerPendingSteamPayment | null; error: string | null }> {
  if (!customerId || !UUID_REGEX.test(customerId)) {
    return { data: null, error: "Invalid customer ID format. Expected a standard UUID." };
  }

  try {
    const { data, error } = await steamDb
      .from("payments")
      .select("id, customer_id, amount, payment_method, payment_status, service_type, service_id, transaction_reference, notes, created_at")
      .eq("customer_id", customerId)
      .eq("service_type", "STEAM")
      .eq("payment_status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[SteamPurchaseService] Error fetching pending payment:", error);
      return { data: null, error: "Unable to verify pending payment status." };
    }

    if (!data) {
      return { data: null, error: null };
    }

    const row = data as unknown as {
      id: string;
      customer_id: string;
      amount: number;
      payment_method: string;
      payment_status: string;
      service_type: string;
      service_id: string | null;
      transaction_reference: string | null;
      notes: string | null;
      created_at: string;
    };

    const catalog = await fetchSteamCatalog();
    const matchedItem = catalog.find(i => i.id === row.service_id);

    const pendingPayment: CustomerPendingSteamPayment = {
      id: row.id,
      customerId: row.customer_id,
      amount: Number(row.amount),
      paymentMethod: row.payment_method,
      paymentStatus: "PENDING",
      serviceType: "STEAM",
      serviceId: row.service_id ?? null,
      transactionReference: row.transaction_reference ?? null,
      productName: matchedItem?.name ?? "Steam service",
      visits: matchedItem?.visits ?? 0,
      createdAt: row.created_at,
      notes: row.notes ?? null,
    };

    return { data: pendingPayment, error: null };
  } catch (err: any) {
    console.error("[SteamPurchaseService] Unexpected error in fetchCustomerPendingSteamPayment:", err);
    return { data: null, error: err?.message || "Unexpected error checking pending payments." };
  }
}

/**
 * Uploads a payment screenshot to private Supabase Storage 'payment-proofs' and
 * creates a PENDING payment record in public.payments.
 *
 * CRITICAL SAFETY RULES:
 * 1. payment_status is set to PENDING (never marked PAID).
 * 2. steam_access is NOT inserted or activated here.
 * 3. paid_at remains NULL.
 * 4. Screenshot stored in private 'payment-proofs' bucket.
 * 5. On DB insert failure, the uploaded file is rolled back from storage.
 */
export async function submitSteamPaymentProof(
  params: SubmitSteamPaymentProofParams
): Promise<SubmitSteamPaymentProofResult> {
  const { customerId, serviceId, productType, paymentMethod, file } = params;

  // 1. Validate customer ID
  if (!customerId || !UUID_REGEX.test(customerId)) {
    return { success: false, error: "Invalid customer ID. Steam purchase rejected." };
  }

  // The catalog is checked here for a clear user error; the RPC rechecks it
  // and derives the charged amount from the database.
  let catalog: SteamCatalogItem[];
  try {
    catalog = await fetchSteamCatalog();
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unable to verify the current Steam service price." };
  }
  const catalogItem = catalog.find(i => i.id === serviceId && i.type === productType);
  if (!catalogItem) {
    return { success: false, error: "This Steam service is no longer available. Refresh and select an active service." };
  }

  // 3. Validate payment method
  if (paymentMethod !== "cbe_birr" && paymentMethod !== "telebirr") {
    return { success: false, error: "Invalid payment method. Only CBE and Telebirr accept proof uploads." };
  }

  // 4. Validate screenshot file
  const validation = validateProofFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error || "Invalid receipt image." };
  }

  // 5. Duplicate Pending Payment Check
  const pendingCheck = await fetchCustomerPendingSteamPayment(customerId);
  if (pendingCheck.data) {
    return {
      success: false,
      error: "You already have a Steam payment awaiting verification. Multiple pending submissions are not allowed.",
    };
  }

  // 6. Generate storage path and upload to 'payment-proofs'
  const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = ["jpg", "jpeg", "png", "webp"].includes(rawExt) ? rawExt : "jpg";
  const timestamp = Date.now();
  const randomHex = Math.random().toString(36).substring(2, 10);
  const storagePath = `proofs/${customerId}/${timestamp}_${randomHex}.${ext}`;

  try {
    const { error: uploadError } = await steamDb.storage
      .from("payment-proofs")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[SteamPurchaseService] Storage upload failed:", uploadError);
      return {
        success: false,
        error: `Failed to upload payment receipt: ${uploadError.message}. Please try again.`,
      };
    }

    // 7. Record a PENDING payment through the server-side validation function.
    const dbPaymentMethod = paymentMethod === "cbe_birr" ? "CBE_BIRR" : "TELEBIRR";
    const { data: paymentId, error: paymentError } = await steamDb.rpc("request_steam_payment", {
      p_customer_id: customerId,
      p_service_id: catalogItem.id,
      p_payment_method: dbPaymentMethod,
      p_proof_path: storagePath,
      p_idempotency_key: crypto.randomUUID(),
    });

    if (paymentError) {
      console.error("[SteamPurchaseService] DB payment insert failed, rolling back storage:", paymentError);
      // Clean up orphaned uploaded file on database failure
      await steamDb.storage.from("payment-proofs").remove([storagePath]);
      return {
        success: false,
        error: `Failed to create payment verification request: ${paymentError.message}. Please try again.`,
      };
    }

    return {
      success: true,
      paymentId: paymentId ?? undefined,
      filePath: storagePath,
    };
  } catch (err: any) {
    console.error("[SteamPurchaseService] Unexpected error during submission, rolling back:", err);
    // Cleanup if storage upload happened
    try {
      await steamDb.storage.from("payment-proofs").remove([storagePath]);
    } catch {
      // ignore rollback errors
    }
    return {
      success: false,
      error: err?.message || "An unexpected error occurred during Steam payment submission.",
    };
  }
}
