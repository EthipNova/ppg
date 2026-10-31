import { supabase } from "../integrations/supabase/client";
import type { CustomerCategory } from "../types";

const MAX_PROOF_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface RegisterMemberInput {
  name: string;
  phone: string;
  gender?: "Male" | "Female" | string | null;
  category: CustomerCategory;
  planId: string;
  planName?: string;
  proofFile?: File | null;
  paymentMethod?: string;
  studentId?: string;
  institution?: string;
  needsTrainer?: boolean;
  trainerId?: string;
}

export interface RegisterMemberResult {
  customerId: string;
  customerCode: string;
  loginId: string;
  tempPassword?: string;
  customerName?: string;
  membershipId: string;
  paymentId: string;
  expiryDate: string;
  proofPath?: string | null;
  trainerAssigned?: boolean;
  trainerId?: string | null;
  trainerFee?: number;
  totalAmount?: number;
  gender?: string | null;
}

/**
 * Validates the uploaded payment proof photo for allowed types and file size limit.
 */
export function validatePaymentProofFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Invalid file format. Please upload a JPEG, PNG, or WEBP image.",
    };
  }
  if (file.size > MAX_PROOF_SIZE_BYTES) {
    return {
      valid: false,
      error: "Image exceeds 5MB limit. Please choose a smaller photo.",
    };
  }
  return { valid: true };
}

/**
 * Uploads a customer's registration payment receipt / screenshot to the private 'payment-proofs' bucket.
 */
export async function uploadRegistrationPaymentProof(file: File): Promise<string> {
  const validation = validatePaymentProofFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = ["jpg", "jpeg", "png", "webp"].includes(rawExt) ? rawExt : "jpg";
  const timestamp = Date.now();
  const randomHex = Math.random().toString(36).substring(2, 10);
  const storagePath = `proofs/registration/${timestamp}_${randomHex}.${ext}`;

  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (error || !data?.path) {
    console.error("Storage upload error for registration proof:", error);
    throw new Error(`Failed to upload payment photo: ${error?.message || "Storage error"}`);
  }

  return data.path;
}

/**
 * Generates an authenticated, short-lived signed URL to securely view private payment proof images.
 */
export async function getPaymentProofSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(path, 3600); // 1-hour validity

  if (error || !data?.signedUrl) {
    console.error("Failed to generate signed URL:", error);
    throw new Error(`Unable to load payment image: ${error?.message || "Image not found"}`);
  }

  return data.signedUrl;
}

/**
 * Registers a new member through Reception in Supabase.
 * For Cash payments: no photo is uploaded; proof path is NULL.
 * For electronic payments (Telebirr, CBE Birr): photo is uploaded to 'payment-proofs' first.
 * Atomically registers customer, active membership, and payment record.
 * Automatically cleans up the uploaded file if database registration fails.
 */
export async function registerMemberByReception(input: RegisterMemberInput): Promise<RegisterMemberResult> {
  if (!input.name.trim()) {
    throw new Error("Full name is required.");
  }
  if (!input.phone.trim()) {
    throw new Error("Phone number is required.");
  }
  if (input.category === "STUDENT" && (!input.studentId?.trim() || !input.institution?.trim())) {
    throw new Error("Student ID number and institution are required for Student category.");
  }

  const method = (input.paymentMethod || "CASH").toUpperCase().trim();
  if (!["CASH", "TELEBIRR", "CBE_BIRR"].includes(method)) {
    throw new Error("Invalid payment method. Only Cash, Telebirr, and CBE Birr are supported.");
  }

  let proofPath: string | null = null;

  // 1. If electronic payment method, validate and upload payment photo
  if (method !== "CASH") {
    if (!input.proofFile) {
      throw new Error(`Payment photo is required for ${input.paymentMethod}. Please capture or upload receipt evidence.`);
    }
    proofPath = await uploadRegistrationPaymentProof(input.proofFile);
  }

  // 2. Call atomic registration RPC
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.planId);
  const needsTrainer = Boolean(input.needsTrainer);
  const trainerId = needsTrainer && input.trainerId ? input.trainerId : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("register_member_by_reception", {
    p_name: input.name.trim(),
    p_phone: input.phone.trim(),
    p_category: input.category,
    p_plan_id: isUuid ? input.planId : null,
    p_plan_name: input.planName?.trim() || null,
    p_proof_path: proofPath,
    p_payment_method: method,
    p_student_id: input.category === "STUDENT" ? input.studentId?.trim() || null : null,
    p_institution: input.category === "STUDENT" ? input.institution?.trim() || null : null,
    p_needs_trainer: needsTrainer,
    p_trainer_id: trainerId,
    p_gender: input.gender ? input.gender.trim() : null,
  });

  if (error) {
    console.error("register_member_by_reception RPC failed:", error);
    // Safe cleanup of orphan uploaded file
    if (proofPath) {
      try {
        await supabase.storage.from("payment-proofs").remove([proofPath]);
      } catch (cleanupErr) {
        console.warn("Storage cleanup failed:", cleanupErr);
      }
    }
    throw new Error(`Registration failed: ${error.message}`);
  }

  const result = data as {
    success: boolean;
    customer_id: string;
    customer_code: string;
    login_id?: string;
    temp_password?: string;
    membership_id: string;
    payment_id: string;
    expiry_date: string;
    trainer_assigned?: boolean;
    trainer_id?: string | null;
    trainer_fee?: number;
    total_amount?: number;
    gender?: string | null;
  };

  return {
    customerId: result.customer_id,
    customerCode: result.customer_code,
    loginId: result.login_id || result.customer_code,
    tempPassword: result.temp_password,
    customerName: input.name.trim(),
    membershipId: result.membership_id,
    paymentId: result.payment_id,
    expiryDate: result.expiry_date,
    proofPath,
    trainerAssigned: result.trainer_assigned,
    trainerId: result.trainer_id,
    trainerFee: result.trainer_fee,
    totalAmount: result.total_amount,
    gender: result.gender || input.gender || null,
  };
}
