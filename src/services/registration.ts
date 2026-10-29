import { supabase } from "../integrations/supabase/client";
import type { CustomerCategory } from "../types";

interface RegisterCustomerInput {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  planName: string;
  planPrice: number;
  durationDays: number;
  planId: string;
  category: CustomerCategory;
  studentId?: string;
  institution?: string;
}

interface RegisteredCustomer {
  id: string;
  userId: string;
  customerCode: string;
  membershipCreated: boolean;
  studentVerificationPending: boolean;
  sessionCreated: boolean;
}

export async function registerCustomer(input: RegisterCustomerInput): Promise<RegisteredCustomer> {
  if (input.category === "STUDENT" && (!input.studentId?.trim() || !input.institution?.trim())) {
    throw new Error("Student ID number and institution are required.");
  }
  // Resolve category eligibility from the database before creating the Auth user.
  // applicable_categories is added by the student membership migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planQuery = (supabase as any).from("plans");
  const isUuidPlanId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.planId);
  let planResult = isUuidPlanId ? await planQuery
    .select("id, name, price, duration_days, applicable_categories")
    .eq("id", input.planId).eq("is_active", true)
    .contains("applicable_categories", [input.category]).maybeSingle() : { data: null, error: null };
  if (!planResult.data && input.category !== "STUDENT") {
    planResult = await planQuery.select("id, name, price, duration_days, applicable_categories")
      .ilike("name", input.planName.trim()).eq("is_active", true)
      .contains("applicable_categories", [input.category]).maybeSingle();
  }
  if (planResult.error) throw new Error(`Unable to validate membership plan: ${planResult.error.message}`);
  if (!planResult.data && input.category === "STUDENT") throw new Error("The selected Student plan is unavailable.");

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: {
      registration_flow: input.category === "STUDENT" ? "student" : "customer",
      category: input.category,
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      student_id: input.category === "STUDENT" ? input.studentId?.trim() : null,
      institution: input.category === "STUDENT" ? input.institution?.trim() : null,
      plan_id: planResult.data?.id ?? null,
    } },
  });
  if (authError) {
    if (/rate limit|email.*limit|too many requests/i.test(authError.message)) {
      throw new Error("Supabase email limit reached. Wait for the limit to reset or disable email confirmation in Supabase Auth settings while testing.");
    }
    throw new Error(`Registration failed: ${authError.message}`);
  }
  if (!authData.user) throw new Error("Registration failed: Supabase did not return a user.");
  if (authData.user.identities?.length === 0) throw new Error("This email already has an account. Sign in instead of registering again.");
  const customerCode = `PP-${authData.user.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  return { id: authData.user.id, userId: authData.user.id, customerCode,
    membershipCreated: input.category !== "STUDENT" && Boolean(planResult.data), studentVerificationPending: input.category === "STUDENT",
    sessionCreated: Boolean(authData.session) };
}
