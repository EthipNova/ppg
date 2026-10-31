import { supabase } from "../integrations/supabase/client";

export interface CustomerProfileData {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  gender: string | null;
  customerType: string;
  status: string;
  joinDate: string;
  studentId: string | null;
  institution: string | null;
  photoUrl: string | null;
}

export type CustomerProfileState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "not_found"; message: string }
  | { status: "success"; data: CustomerProfileData };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateProfilePhoto(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: "Invalid file format. Please upload a JPEG, PNG, or WEBP photo.",
    };
  }
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return {
      valid: false,
      error: "Photo exceeds 5MB limit. Please choose a smaller image file.",
    };
  }
  return { valid: true };
}

export async function fetchCustomerProfile(customerId: string): Promise<CustomerProfileState> {
  if (!customerId) {
    return { status: "error", error: "Customer ID is required." };
  }

  try {
    let query = supabase
      .from("customers")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id, customer_code, first_name, last_name, phone, status, join_date, gender, customer_type, student_id, institution, photo_url" as any);

    if (UUID_REGEX.test(customerId)) {
      query = query.eq("id", customerId);
    } else {
      query = query.eq("customer_code", customerId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("[customerProfileService] Error loading profile:", error);
      return { status: "error", error: "Unable to load profile records. Please check your connection." };
    }

    if (!data) {
      return { status: "not_found", message: "No customer profile found." };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;
    const fullName = `${row.first_name || ""} ${row.last_name || ""}`.trim();

    return {
      status: "success",
      data: {
        id: row.id,
        customerCode: row.customer_code,
        fullName: fullName || "Valued Member",
        phone: row.phone || "—",
        gender: row.gender ?? null,
        customerType: row.customer_type || "REGULAR",
        status: (row.status || "ACTIVE").toUpperCase(),
        joinDate: row.join_date || "—",
        studentId: row.student_id ?? null,
        institution: row.institution ?? null,
        photoUrl: row.photo_url ?? null,
      },
    };
  } catch (err) {
    console.error("[customerProfileService] Unexpected error:", err);
    return { status: "error", error: "Failed to connect to the database." };
  }
}

export async function uploadCustomerProfilePhoto(
  customerId: string,
  file: File
): Promise<{ success: boolean; photoUrl?: string; error?: string }> {
  const validation = validateProfilePhoto(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const ext = ["jpg", "jpeg", "png", "webp"].includes(rawExt) ? rawExt : "jpg";
    const timestamp = Date.now();
    const storagePath = `customers/${customerId}_${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("[customerProfileService] Storage upload failed:", uploadError);
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    const { data: urlData } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // First attempt to update via secure RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc("update_customer_profile_photo", {
      p_photo_url: publicUrl,
    });

    if (rpcError) {
      // Direct update fallback where RLS permits self-update
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from("customers")
        .update({ photo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", customerId);

      if (updateError) {
        console.error("[customerProfileService] Database update failed:", updateError);
        return { success: false, error: "Photo uploaded to storage, but could not update customer record." };
      }
    }

    return { success: true, photoUrl: publicUrl };
  } catch (err) {
    console.error("[customerProfileService] Unexpected photo upload error:", err);
    return { success: false, error: "An unexpected error occurred while uploading your profile photo." };
  }
}
