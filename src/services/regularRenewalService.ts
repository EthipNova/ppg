import { supabase } from "../integrations/supabase/client";

export interface RegularRenewalCustomer {
  id: string;
  customerCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  customerType: string;
  status: string;
  email: string | null;
  phone: string;
}

export interface RegularRenewalPlan {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  description: string | null;
  benefits: string | null;
}

export interface RegularCurrentMembership {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  isExpired: boolean;
  priceAtPurchase: number;
  plan: RegularRenewalPlan | null;
}

export interface RegularRenewalData {
  customer: RegularRenewalCustomer;
  currentMembership: RegularCurrentMembership | null;
  availablePlans: RegularRenewalPlan[];
}

export type RegularRenewalState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "not_found"; message: string }
  | { status: "success"; data: RegularRenewalData };

interface CustomerDbRow {
  id: string;
  customer_code: string;
  first_name: string;
  last_name: string;
  customer_type: string;
  status: string;
  email: string | null;
  phone: string;
}

interface PlanDbRow {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  description: string | null;
  benefits: string | null;
  is_active: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Service for Regular Customer Renew functionality.
 * Reads real customer, active membership, and eligible regular plans from Supabase.
 */
export async function fetchRegularRenewalData(
  customerId: string,
  category: "REGULAR" | "STUDENT" = "REGULAR"
): Promise<RegularRenewalState> {
  if (!customerId || !UUID_REGEX.test(customerId)) {
    return {
      status: "error",
      error: "Invalid customer ID format. Expected a standard UUID.",
    };
  }

  try {
    // 1. Fetch Customer
    const customerRes = await supabase
      .from("customers")
      .select("id, customer_code, first_name, last_name, customer_type, status, email, phone")
      .eq("id", customerId)
      .maybeSingle();

    if (customerRes.error) {
      console.error("[RegularRenewalService] Error fetching customer:", customerRes.error);
      return { status: "error", error: "Unable to load customer profile from database." };
    }

    const customerRow = customerRes.data as CustomerDbRow | null;
    if (!customerRow) {
      return { status: "not_found", message: "Customer profile not found in database." };
    }

    const customer: RegularRenewalCustomer = {
      id: customerRow.id,
      customerCode: customerRow.customer_code,
      firstName: customerRow.first_name,
      lastName: customerRow.last_name,
      fullName: `${customerRow.first_name} ${customerRow.last_name}`.trim(),
      customerType: customerRow.customer_type,
      status: customerRow.status,
      email: customerRow.email ?? null,
      phone: customerRow.phone,
    };

    // 2. Fetch Current Membership and Available Plans in parallel
    const membershipPromise = supabase
      .from("memberships")
      .select(`
        id,
        status,
        start_date,
        end_date,
        price_at_purchase,
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

    const plansPromise = supabase
      .from("plans")
      .select("id, name, price, duration_days, description, benefits, is_active, applicable_categories")
      .eq("is_active", true)
      .order("price", { ascending: true });

    const [membershipRes, plansRes] = await Promise.all([
      membershipPromise,
      plansPromise,
    ]);

    if (plansRes.error) {
      console.error("[RegularRenewalService] Error fetching plans:", plansRes.error);
      return { status: "error", error: "Unable to load renewal plans from database." };
    }

    // Map Current Membership
    let currentMembership: RegularCurrentMembership | null = null;
    const mData = membershipRes.data as any;
    if (mData) {
      const pRow = Array.isArray(mData.plans) ? mData.plans[0] : mData.plans;
      const daysRemaining = mData.end_date
        ? Math.max(0, Math.ceil((new Date(mData.end_date).getTime() - Date.now()) / 86400000))
        : 0;

      currentMembership = {
        id: mData.id,
        status: mData.status,
        startDate: mData.start_date,
        endDate: mData.end_date,
        daysRemaining,
        isExpired: daysRemaining <= 0,
        priceAtPurchase: Number(mData.price_at_purchase) || 0,
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

    // Filter plans to the signed-in member's database-configured category.
    const rawPlans = (plansRes.data || []) as PlanDbRow[];
    const categorizedPlans = rawPlans.filter(p => Array.isArray((p as any).applicable_categories)
      && (p as any).applicable_categories.includes(category));
    const legacyRegularPlans = rawPlans.filter(p =>
      !p.name.toLowerCase().includes("aerobics") && !p.name.toLowerCase().includes("dance"));
    const applicablePlans = category === "STUDENT"
      ? categorizedPlans
      : (categorizedPlans.length > 0 ? categorizedPlans : legacyRegularPlans.length > 0 ? legacyRegularPlans : rawPlans);

    const availablePlans: RegularRenewalPlan[] = applicablePlans.map(p => ({
      id: p.id,
      name: p.name,
      price: Number(p.price) || 0,
      durationDays: p.duration_days || 30,
      description: p.description ?? null,
      benefits: p.benefits ?? null,
    }));

    return {
      status: "success",
      data: {
        customer,
        currentMembership,
        availablePlans,
      },
    };
  } catch (err: any) {
    console.error("[RegularRenewalService] Unexpected error:", err);
    return {
      status: "error",
      error: err?.message || "An unexpected error occurred while loading renewal data.",
    };
  }
}

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB limit
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export interface ProofFileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a payment screenshot file before upload.
 */
export function validateProofFile(file: File | null | undefined): ProofFileValidationResult {
  if (!file) {
    return { valid: false, error: "Please select an image file to upload." };
  }

  if (file.size === 0) {
    return { valid: false, error: "The selected file is empty (0 bytes). Please choose a valid image." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size exceeds the 5MB limit (${sizeMb} MB). Please choose a smaller image.`,
    };
  }

  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.includes(ext);
  const hasValidMime = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());

  if (!hasValidExt || !hasValidMime) {
    return {
      valid: false,
      error: "Unsupported file format. Please upload a JPG, PNG, or WebP screenshot.",
    };
  }

  return { valid: true };
}

export interface SubmitRegularRenewalProofParams {
  customerId: string;
  category?: "REGULAR" | "STUDENT";
  idempotencyKey?: string;
  membershipId: string | null;
  plan: RegularRenewalPlan;
  paymentMethod: "telebirr" | "cbe_birr";
  file: File;
}

export interface SubmitRegularRenewalProofResult {
  success: boolean;
  paymentId?: string;
  filePath?: string;
  error?: string;
}

/**
 * Uploads payment screenshot to private Supabase Storage and records a pending payment verification request.
 */
export async function submitRegularRenewalProof(
  params: SubmitRegularRenewalProofParams
): Promise<SubmitRegularRenewalProofResult> {
  const { customerId, membershipId, plan, paymentMethod, file } = params;

  // 1. Pre-upload file validation
  const validation = validateProofFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  if (!customerId || !UUID_REGEX.test(customerId)) {
    return { success: false, error: "Invalid customer ID. Renewal submission rejected." };
  }

  if (!plan || !plan.id || plan.price <= 0) {
    return { success: false, error: "Invalid plan selected. Renewal submission rejected." };
  }

  try {
    // 2. Generate clean storage path
    const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const ext = ["jpg", "jpeg", "png", "webp"].includes(rawExt) ? rawExt : "jpg";
    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 10);
    const storagePath = `proofs/${customerId}/${timestamp}_${randomHex}.${ext}`;

    // 3. Upload to private 'payment-proofs' bucket
    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[RegularRenewalService] Upload failed:", uploadError);
      return {
        success: false,
        error: `Failed to upload payment screenshot: ${uploadError.message}. Please try again.`,
      };
    }

    if (params.category === "STUDENT") {
      if (!params.idempotencyKey) {
        await supabase.storage.from("payment-proofs").remove([storagePath]);
        return { success: false, error: "Renewal request key is missing. Please retry." };
      }
      const method = paymentMethod === "cbe_birr" ? "CBE_BIRR" : "TELEBIRR";
      // The RPC type is generated after the migration is deployed and schema cache refreshed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("request_student_membership_payment", {
        p_customer_id: customerId,
        p_plan_id: plan.id,
        p_payment_method: method,
        p_proof_path: storagePath,
        p_idempotency_key: params.idempotencyKey,
      });
      if (error) {
        await supabase.storage.from("payment-proofs").remove([storagePath]);
        return { success: false, error: error.message };
      }
      const result = data as { payment_id?: string; proof_path?: string; replayed?: boolean } | null;
      if (result?.replayed) await supabase.storage.from("payment-proofs").remove([storagePath]);
      return { success: true, paymentId: result?.payment_id, filePath: result?.proof_path || storagePath };
    }

    // 4. Record pending payment request in Supabase 'payments' table
    const dbPaymentMethod = paymentMethod === "cbe_birr" ? "CBE_BIRR" : "TELEBIRR";
    const notes = `${params.category || "Regular"} renewal request for plan: ${plan.name} (${plan.id}). Payment proof uploaded, awaiting reception verification.`;

    const { data: paymentRow, error: paymentError } = await (supabase
      .from("payments") as any)
      .insert({
        customer_id: customerId,
        membership_id: membershipId || null,
        amount: plan.price,
        payment_method: dbPaymentMethod,
        payment_status: "PENDING",
        transaction_reference: storagePath,
        paid_at: null,
        service_type: "MEMBERSHIP",
        notes,
      })
      .select("id")
      .single();

    if (paymentError) {
      console.error("[RegularRenewalService] Failed to record payment:", paymentError);
      // Clean up orphaned file
      await supabase.storage.from("payment-proofs").remove([storagePath]);
      return {
        success: false,
        error: `Failed to create payment verification request: ${paymentError.message}. Please try again.`,
      };
    }

    const insertedId = paymentRow ? (paymentRow as { id: string }).id : undefined;

    return {
      success: true,
      paymentId: insertedId,
      filePath: storagePath,
    };
  } catch (err: any) {
    console.error("[RegularRenewalService] Unexpected error during submission:", err);
    return {
      success: false,
      error: err?.message || "An unexpected error occurred during payment submission.",
    };
  }
}
