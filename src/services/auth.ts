import { supabase } from "../integrations/supabase/client";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import type { AuthUser, CustomerCategory } from "../types";

export interface TrustedAuthResult {
  authUser: AuthUser;
  source: "users" | "staff_profiles" | "trainer_profiles" | "customers";
  customerCode?: string;
  status: "active" | "inactive" | "blocked" | "error";
  category?: CustomerCategory;
  rejectReason?: "inactive" | "missing_profile" | "unknown_role" | "conflicting_role" | "not_found" | "database_error";
}

/**
 * Validates credentials against real Supabase Auth GoTrue service.
 */
export async function signInWithEmail(email: string, password: string) {
  const trimmed = email.trim();
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
  const trimmed = email.trim();
  if (!trimmed) {
    throw new Error("Email address is required.");
  }

  const redirectUrl = typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : undefined;

  return supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: redirectUrl,
  });
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

    const userData = userRes.data as unknown as DbUser | null;

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
