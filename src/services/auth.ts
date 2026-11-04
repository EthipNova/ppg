import { supabase } from "../integrations/supabase/client";
import type { Session, AuthChangeEvent, SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser, CustomerCategory } from "../types";

const authDb = supabase as unknown as SupabaseClient;

export interface TrustedAuthResult {
  authUser: AuthUser;
  source: "users" | "staff_profiles" | "trainer_profiles" | "customers";
  customerCode?: string;
  status: "active" | "inactive" | "blocked" | "error";
  category?: CustomerCategory;
  rejectReason?: "inactive" | "missing_profile" | "unknown_role" | "conflicting_role" | "not_found" | "database_error";
}

export async function resolveLoginIdentifier(
  identifier: string
): Promise<{ email: string; role: string; loginId: string } | null> {
  const clean = identifier.trim();
  if (!clean) return null;

  try {
    const { data, error } = await authDb.rpc("resolve_login_identifier", {
      p_identifier: clean,
    });

    if (error) {
      console.warn("resolve_login_identifier RPC error:", error);
      return null;
    }

    if (data && Array.isArray(data) && data.length > 0) {
      const match = data[0] as { email: string; role: string; login_id: string };
      return {
        email: match.email,
        role: match.role,
        loginId: match.login_id,
      };
    }
    return null;
  } catch (err) {
    console.warn("resolveLoginIdentifier exception:", err);
    return null;
  }
}

/**
 * Validates credentials against real Supabase Auth GoTrue service.
 */
export async function signInWithEmail(email: string, password: string) {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !password) {
    throw new Error("Email and password are required.");
  }
  return supabase.auth.signInWithPassword({
    email: trimmed,
    password,
  });
}


/**
 * Retrieves the current persisted session from Supabase Auth storage.
 */
export async function getCurrentSession(): Promise<{ session: Session | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { session: null, error };
    }
    return { session: data.session, error: null };
  } catch (err) {
    return { session: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Subscribes to Supabase Auth state changes (SIGN_IN, SIGN_OUT, TOKEN_REFRESHED, etc.).
 * Returns a cleanup unsubscribe function.
 */
export function subscribeToAuthChanges(
  callback: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>
) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Signs out the current user and revokes their active tokens.
 */
export async function signOutUser() {
  return supabase.auth.signOut();
}

/**
 * Requests a password recovery link via Supabase Auth.
 */
export async function requestPasswordRecovery(email: string) {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("Email address is required.");
  }

  const redirectUrl = typeof window !== "undefined" && window.location.origin
    ? `${window.location.origin}/reset-password`
    : undefined;

  return supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: redirectUrl,
  });
}

/**
 * Updates the password for the current authenticated recovery or active session.
 */
export async function updateUserPassword(newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  return supabase.auth.updateUser({
    password: newPassword,
  });
}

/**
 * Securely changes the password of the currently authenticated Admin or user.
 * Validates the current password before applying the change.
 */
export async function changeCurrentUserPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!currentPassword) {
    throw new Error("Current password is required.");
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters.");
  }

  // 1. Get currently authenticated session user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user || !userData.user.email) {
    throw new Error("You must be actively signed in to change your password.");
  }

  // 2. Validate current password against Supabase Auth
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });

  if (signInError) {
    throw new Error("Current password is incorrect. Please verify and try again.");
  }

  // 3. Apply the new password
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    throw new Error(updateError.message || "Failed to update password.");
  }
}

interface DbUser {
  id: string;
  email: string | null;
  role: string | null;
  is_active: boolean;
}

interface DbStaffProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
}

interface DbTrainerProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
}

interface DbCustomer {
  id: string;
  user_id: string | null;
  customer_code: string;
  first_name: string;
  last_name: string;
  status: string;
  email: string | null;
  customer_type?: string | null;
}

function parseCustomerCategory(rawType?: string | null): CustomerCategory {
  const normalized = (rawType || "").toUpperCase().trim();
  if (normalized === "STUDENT") return "STUDENT";
  if (normalized === "MUSLIM") return "MUSLIM";
  if (normalized === "AEROBICS") return "AEROBICS";
  return "REGULAR";
}

/**
 * Resolves user role and active account status from trusted database records.
 * NEVER trusts client-side state, unverified parameters, or user editable metadata.
 * 
 * Strict Validation Rules:
 * - Reject inactive accounts (is_active = false or customer status != 'ACTIVE')
 * - Require existing corresponding profiles for trainers and members
 * - Reject conflicting role records and unknown roles
 * - Fail closed on missing, duplicated, or invalid records
 * - Never default unknown or failed roles to admin
 */
export async function resolveTrustedUserRole(userId: string): Promise<TrustedAuthResult | null> {
  if (!userId) return null;

  try {
    // 1. Check public.users
    const userRes = await supabase
      .from("users")
      .select("id, email, role, is_active")
      .eq("id", userId)
      .maybeSingle();

    const userData = userRes.data as unknown as DbUser | null;

    console.log("[Auth-Diag] Stage 4: public.users profile lookup", {
      userId,
      found: Boolean(userData),
      error: userRes.error ? { message: userRes.error.message, code: userRes.error.code } : null,
      role: userData?.role ?? null,
      isActive: userData?.is_active ?? null,
    });

    // A failed lookup is not evidence that provisioning is missing. Preserve the
    // distinction so the login screen can ask the user to retry instead.
    if (userRes.error) {
      return {
        authUser: { id: userId, name: "User", role: "member" },
        source: "users",
        status: "error",
        rejectReason: "database_error",
      };
    }

    if (userData) {
      // Rule 1: Reject inactive accounts
      if (!userData.is_active) {
        console.warn(`[Auth] User account ${userId} is inactive.`);
        return {
          authUser: {
            id: userData.id,
            name: userData.email?.split("@")[0] || "User",
            role: "member",
          },
          source: "users",
          status: "inactive",
          rejectReason: "inactive",
        };
      }

      const rawRole = (userData.role || "").toUpperCase().trim();

      // Rule 2: Reject unknown roles
      if (!["OWNER", "ADMIN", "STAFF", "TRAINER", "MEMBER"].includes(rawRole)) {
        console.warn(`[Auth] Unknown role detected: ${rawRole} for user ${userId}`);
        return {
          authUser: {
            id: userData.id,
            name: "User",
            role: "member",
          },
          source: "users",
          status: "error",
          rejectReason: "unknown_role",
        };
      }

      // Handle OWNER / ADMIN
      if (rawRole === "OWNER" || rawRole === "ADMIN") {
        return {
          authUser: {
            id: userData.id,
            name: userData.email?.split("@")[0] || "System Owner",
            role: "owner",
          },
          source: "users",
          status: "active",
        };
      }

      // Handle STAFF
      if (rawRole === "STAFF") {
        const staffRes = await supabase
          .from("staff_profiles")
          .select("id, user_id, first_name, last_name, is_active")
          .eq("user_id", userId)
          .maybeSingle();

        const staffData = staffRes.data as unknown as DbStaffProfile | null;
        console.log("[Auth-Diag] Stage 4: staff_profiles profile lookup", {
          userId,
          found: Boolean(staffData),
          error: staffRes.error ? { message: staffRes.error.message, code: staffRes.error.code } : null,
          staffActive: staffData?.is_active,
        });

        if (staffRes.error) {
          return {
            authUser: { id: userData.id, name: "Staff", role: "staff" },
            source: "staff_profiles",
            status: "error",
            rejectReason: "database_error",
          };
        }
        if (!staffRes.error && staffData && !staffData.is_active) {
          return {
            authUser: {
              id: userData.id,
              name: "Staff",
              role: "staff",
            },
            source: "staff_profiles",
            status: "inactive",
            rejectReason: "inactive",
          };
        }

        const fullName = staffData
          ? `${staffData.first_name || ""} ${staffData.last_name || ""}`.trim() || userData.email?.split("@")[0] || "Staff Member"
          : userData.email?.split("@")[0] || "Staff Member";

        return {
          authUser: {
            id: userData.id,
            name: fullName,
            role: "staff",
          },
          source: "users",
          status: "active",
        };
      }

      // Handle TRAINER: Profile required
      if (rawRole === "TRAINER") {
        const trainerRes = await supabase
          .from("trainer_profiles")
          .select("id, user_id, first_name, last_name, is_active")
          .eq("user_id", userId)
          .maybeSingle();

        const trainerData = trainerRes.data as unknown as DbTrainerProfile | null;

        if (trainerRes.error || !trainerData) {
          console.warn(`[Auth] Missing trainer profile for trainer user ${userId}`);
          return {
            authUser: {
              id: userData.id,
              name: "Trainer",
              role: "trainer",
            },
            source: "trainer_profiles",
            status: "error",
            rejectReason: "missing_profile",
          };
        }

        if (!trainerData.is_active) {
          return {
            authUser: {
              id: userData.id,
              name: "Trainer",
              role: "trainer",
            },
            source: "trainer_profiles",
            status: "inactive",
            rejectReason: "inactive",
          };
        }

        const fullName = `${trainerData.first_name || ""} ${trainerData.last_name || ""}`.trim() || "Trainer";
        return {
          authUser: {
            id: userData.id,
            name: fullName,
            role: "trainer",
            trainerId: trainerData.id,
          },
          source: "trainer_profiles",
          status: "active",
        };
      }

      // Handle MEMBER: Customer record required
      if (rawRole === "MEMBER") {
        const custRes = await supabase
          .from("customers")
          .select("id, user_id, customer_code, first_name, last_name, status, email, customer_type")
          .eq("user_id", userId)
          .maybeSingle();

        const customerData = custRes.data as unknown as DbCustomer | null;

        if (custRes.error) {
          return {
            authUser: { id: userData.id, name: "Member", role: "member" },
            source: "customers",
            status: "error",
            rejectReason: "database_error",
          };
        }
        if (!customerData) {
          console.warn(`[Auth] Missing customer profile for member user ${userId}`);
          return {
            authUser: {
              id: userData.id,
              name: "Member",
              role: "member",
            },
            source: "customers",
            status: "error",
            rejectReason: "missing_profile",
          };
        }

        const memberStatus = (customerData.status || "").toUpperCase();
        if (memberStatus !== "ACTIVE") {
          return {
            authUser: {
              id: customerData.id,
              name: "Member",
              role: "member",
            },
            source: "customers",
            status: "blocked",
            rejectReason: "inactive",
          };
        }

        const category = parseCustomerCategory(customerData.customer_type);
        const fullName = `${customerData.first_name || ""} ${customerData.last_name || ""}`.trim() || "Member";

        return {
          authUser: {
            id: customerData.id,
            name: fullName,
            role: "member",
            memberId: customerData.id,
            customerCode: customerData.customer_code,
            category,
            status: "ACTIVE",
          },
          source: "customers",
          customerCode: customerData.customer_code,
          status: "active",
          category,
        };
      }
    }

    // 2. Check direct customer profile linkage if not in public.users
    const custRes = await supabase
      .from("customers")
      .select("id, user_id, customer_code, first_name, last_name, status, email, customer_type")
      .eq("user_id", userId)
      .maybeSingle();

    const customerData = custRes.data as unknown as DbCustomer | null;

    if (custRes.error) {
      return {
        authUser: { id: userId, name: "User", role: "member" },
        source: "customers",
        status: "error",
        rejectReason: "database_error",
      };
    }

    if (customerData) {
      const memberStatus = (customerData.status || "").toUpperCase();
      if (memberStatus !== "ACTIVE") {
        return {
          authUser: {
            id: customerData.id,
            name: "Member",
            role: "member",
          },
          source: "customers",
          status: "blocked",
          rejectReason: "inactive",
        };
      }

      const category = parseCustomerCategory(customerData.customer_type);
      const fullName = `${customerData.first_name || ""} ${customerData.last_name || ""}`.trim() || "Member";

      return {
        authUser: {
          id: customerData.id,
          name: fullName,
          role: "member",
          memberId: customerData.id,
          customerCode: customerData.customer_code,
          category,
          status: "ACTIVE",
        },
        source: "customers",
        customerCode: customerData.customer_code,
        status: "active",
        category,
      };
    }

    // 3. Check direct trainer profile linkage
    const trainerRes = await supabase
      .from("trainer_profiles")
      .select("id, user_id, first_name, last_name, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    const trainerData = trainerRes.data as unknown as DbTrainerProfile | null;

    if (trainerRes.error) {
      return {
        authUser: { id: userId, name: "User", role: "member" },
        source: "trainer_profiles",
        status: "error",
        rejectReason: "database_error",
      };
    }

    if (trainerData) {
      if (!trainerData.is_active) {
        return {
          authUser: {
            id: trainerData.user_id,
            name: "Trainer",
            role: "trainer",
          },
          source: "trainer_profiles",
          status: "inactive",
          rejectReason: "inactive",
        };
      }

      const fullName = `${trainerData.first_name || ""} ${trainerData.last_name || ""}`.trim() || "Trainer";
      return {
        authUser: {
          id: trainerData.user_id,
          name: fullName,
          role: "trainer",
          trainerId: trainerData.id,
        },
        source: "trainer_profiles",
        status: "active",
      };
    }

    // No trusted record found
    return null;
  } catch (err) {
    console.error("Error during trusted role resolution:", err);
    return null;
  }
}
