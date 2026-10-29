import { supabase } from "../integrations/supabase/client";

export interface StudentPlan {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  description: string | null;
  benefits: string | null;
  applicableCategories: string[];
}

export interface StudentVerificationRecord {
  id: string;
  customerCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  studentId: string;
  institution: string;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
  verifiedAt: string | null;
  verifiedBy: string | null;
}

export interface StudentPaymentReviewRecord {
  id: string;
  customerId: string;
  fullName: string;
  customerCode: string;
  planName: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  proofUrl: string | null;
  createdAt: string;
}

export type PlanLoadFailureKind = "network" | "permission" | "invalid_category" | "schema" | "server" | "unexpected";

export class PlanLoadError extends Error {
  constructor(
    message: string,
    readonly category: string,
    readonly kind: PlanLoadFailureKind,
    readonly code?: string,
    readonly status?: number,
    readonly details?: string | null,
    readonly hint?: string | null,
  ) {
    super(message);
    this.name = "PlanLoadError";
  }
}

export async function fetchPlansForCategory(category: string): Promise<StudentPlan[]> {
  let result: Awaited<ReturnType<typeof queryPlansForCategory>>;
  try {
    result = await queryPlansForCategory(category);
  } catch (cause) {
    const networkFailure = cause instanceof TypeError;
    const failure = new PlanLoadError(
      networkFailure ? "Network request failed." : "Unexpected plan request failure.",
      category,
      networkFailure ? "network" : "unexpected",
    );
    console.error("membership_plans.fetch_failed", {
      operation: "fetchPlansForCategory",
      category,
      kind: failure.kind,
      message: failure.message,
    });
    throw failure;
  }

  const { data, error } = result;
  if (error) {
    const responseStatus = (error as typeof error & { status?: unknown }).status;
    const status = typeof responseStatus === "number" ? responseStatus : undefined;
    const kind: PlanLoadFailureKind = ["42703", "42P01", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "")
      ? "schema"
      : error.code === "42501" || status === 401 || status === 403
        ? "permission"
        : error.code === "22P02" || error.code === "22023"
          ? "invalid_category"
          : status !== undefined && status >= 500
            ? "server"
            : "unexpected";
    console.error("membership_plans.fetch_failed", {
      operation: "fetchPlansForCategory",
      category,
      kind,
      code: error.code,
      status,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new PlanLoadError(error.message, category, kind, error.code, status, error.details, error.hint);
  }
  if (!Array.isArray(data)) {
    const failure = new PlanLoadError("Unexpected response format.", category, "unexpected");
    console.error("membership_plans.invalid_response", {
      operation: "fetchPlansForCategory",
      category,
      kind: failure.kind,
      responseType: typeof data,
    });
    throw failure;
  }

  return (data ?? []).map((row) => {
    const plan = row as unknown as {
      id: string; name: string; price: number; duration_days: number;
      description: string | null; benefits: string | null; applicable_categories: string[];
    };
    return {
      id: plan.id,
      name: plan.name,
      price: Number(plan.price),
      durationDays: Number(plan.duration_days),
      description: plan.description,
      benefits: plan.benefits,
      applicableCategories: plan.applicable_categories ?? [],
    };
  });
}

function queryPlansForCategory(category: string) {
  return supabase
    .from("plans")
    .select("id, name, price, duration_days, description, benefits, applicable_categories")
    .eq("is_active", true)
    .contains("applicable_categories", [category])
    .order("price", { ascending: true });
}

export async function fetchStudentVerificationQueue(): Promise<StudentVerificationRecord[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, customer_code, first_name, last_name, phone, email, student_id, institution, student_verification_status, student_verified_at, student_verified_by")
    .eq("customer_type", "STUDENT")
    .in("student_verification_status", ["PENDING", "REJECTED"])
    .order("join_date", { ascending: false });
  if (error) throw new Error(`Unable to load student verification requests: ${error.message}`);
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    customerCode: String(row.customer_code ?? ""),
    firstName: String(row.first_name ?? ""),
    lastName: String(row.last_name ?? ""),
    phone: String(row.phone ?? ""),
    email: row.email == null ? null : String(row.email),
    studentId: String(row.student_id ?? ""),
    institution: String(row.institution ?? ""),
    verificationStatus: String(row.student_verification_status ?? "PENDING") as StudentVerificationRecord["verificationStatus"],
    verifiedAt: row.student_verified_at == null ? null : String(row.student_verified_at),
    verifiedBy: row.student_verified_by == null ? null : String(row.student_verified_by),
  }));
}

export async function setStudentVerification(customerId: string, status: "VERIFIED" | "REJECTED"): Promise<void> {
  // The generated Supabase RPC types are refreshed only after applying this migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("set_student_verification", {
    p_customer_id: customerId,
    p_status: status,
  });
  if (error) throw new Error(`Unable to update student verification: ${error.message}`);
}

export async function fetchStudentPaymentReviewQueue(): Promise<StudentPaymentReviewRecord[]> {
  // This field and RPC are introduced by the forward migration; generated client types are stale.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from("payments")
    .select("id, customer_id, membership_plan_id, amount, currency, payment_method, transaction_reference, created_at")
    .eq("service_type", "MEMBERSHIP").eq("payment_status", "PENDING")
    .not("membership_plan_id", "is", null).order("created_at", { ascending: true });
  if (error) throw new Error(`Unable to load student payment requests: ${error.message}`);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const customerIds = [...new Set(rows.map(row => String(row.customer_id)))];
  const planIds = [...new Set(rows.map(row => String(row.membership_plan_id)))];
  const [customersResult, plansResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customerIds.length ? (supabase as any).from("customers").select("id, customer_code, first_name, last_name").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    planIds.length ? (supabase as any).from("plans").select("id, name").in("id", planIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (customersResult.error || plansResult.error) throw new Error(customersResult.error?.message || plansResult.error?.message);
  const customerMap = new Map<string, Record<string, unknown>>((customersResult.data ?? []).map((row: Record<string, unknown>) => [String(row.id), row]));
  const planMap = new Map<string, string>((plansResult.data ?? []).map((row: Record<string, unknown>) => [String(row.id), String(row.name)]));
  return Promise.all(rows.map(async row => {
    const proofPath = row.transaction_reference == null ? "" : String(row.transaction_reference);
    const signed = proofPath ? await supabase.storage.from("payment-proofs").createSignedUrl(proofPath, 300) : null;
    if (signed?.error) throw new Error(`Unable to open payment proof: ${signed.error.message}`);
    const customer = customerMap.get(String(row.customer_id));
    return {
      id: String(row.id), customerId: String(row.customer_id),
      fullName: `${String(customer?.first_name ?? "")} ${String(customer?.last_name ?? "")}`.trim(),
      customerCode: String(customer?.customer_code ?? ""),
      planName: planMap.get(String(row.membership_plan_id)) ?? "Student membership plan",
      amount: Number(row.amount ?? 0), currency: String(row.currency ?? "ETB"),
      paymentMethod: String(row.payment_method ?? ""), proofUrl: signed?.data.signedUrl ?? null,
      createdAt: String(row.created_at ?? ""),
    };
  }));
}

export async function reviewStudentMembershipPayment(paymentId: string, approve: boolean): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("review_student_membership_payment", {
    p_payment_id: paymentId,
    p_approve: approve,
  });
  if (error) throw new Error(`Unable to review student payment: ${error.message}`);
}
