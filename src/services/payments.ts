import { supabase } from "../integrations/supabase/client";

export interface PaymentRecord {
  id: string;
  customer_id: string;
  membership_id: string | null;
  amount: number | string | null;
  payment_method: string | null;
  payment_status: string | null;
  transaction_reference: string | null;
  paid_at: string | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  customer: { first_name: string; last_name: string; customer_code: string } | null;
  planName: string | null;
}

export interface PaymentPage {
  payments: PaymentRecord[];
  total: number;
  paidRevenue: number;
}

interface CustomerRow {
  id: string;
  first_name: string;
  last_name: string;
  customer_code: string;
}

interface MembershipRow {
  id: string;
  plan_id: string | null;
}

interface PlanRow {
  id: string;
  name: string;
}

interface PaymentRow {
  id: string;
  customer_id: string;
  membership_id: string | null;
  amount: number | string | null;
  payment_method: string | null;
  payment_status: string | null;
  transaction_reference: string | null;
  paid_at: string | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
}

const PAGE_SIZE = 25;
const PAYMENT_FIELDS = "id, customer_id, membership_id, amount, payment_method, payment_status, transaction_reference, paid_at, recorded_by, notes, created_at";

function cleanSearch(value: string) {
  return value.trim().replace(/[,%()]/g, " ");
}

export async function fetchPayments({ search, status, method, page }: { search: string; status: string; method: string; page: number }): Promise<PaymentPage> {
  const normalizedSearch = cleanSearch(search);
  let matchingCustomerIds: string[] | null = null;
  let matchingPaymentIds: string[] | null = null;

  if (normalizedSearch) {
    const [customersResult, referencesResult] = await Promise.all([
      supabase.from("customers").select("id").or(`first_name.ilike.%${normalizedSearch}%,last_name.ilike.%${normalizedSearch}%,customer_code.ilike.%${normalizedSearch}%`),
      supabase.from("payments").select("id").ilike("transaction_reference", `%${normalizedSearch}%`),
    ]);
    const searchError = customersResult.error ?? referencesResult.error;
    if (searchError) throw new Error(`Unable to search payments: ${searchError.message}`);
    matchingCustomerIds = (customersResult.data ?? []).map(row => row.id);
    matchingPaymentIds = (referencesResult.data ?? []).map(row => row.id);
    if (matchingCustomerIds.length === 0 && matchingPaymentIds.length === 0) return { payments: [], total: 0, paidRevenue: 0 };
  }

  let query = supabase.from("payments").select(PAYMENT_FIELDS, { count: "exact" }).order("paid_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (status !== "all") query = query.ilike("payment_status", status);
  if (method !== "all") {
    if (method.toUpperCase() === "CASH") {
      query = query.ilike("payment_method", "cash");
    } else if (method.toUpperCase() === "TELEBIRR") {
      query = query.ilike("payment_method", "telebirr");
    } else if (method.toUpperCase() === "CBE_BIRR") {
      query = query.or("payment_method.eq.CBE_BIRR,payment_method.ilike.%cbe%");
    } else {
      query = query.eq("payment_method", method);
    }
  }
  if (matchingCustomerIds && matchingPaymentIds) {
    const searchClauses = [];
    if (matchingCustomerIds.length > 0) searchClauses.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
    if (matchingPaymentIds.length > 0) searchClauses.push(`id.in.(${matchingPaymentIds.join(",")})`);
    query = query.or(searchClauses.join(","));
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Unable to load payments: ${error.message}`);

  const paymentRows = (data ?? []) as PaymentRow[];
  const customerIds = [...new Set(paymentRows.map(payment => payment.customer_id))];
  const membershipIds = [...new Set(paymentRows.map(payment => payment.membership_id).filter((id): id is string => Boolean(id)))];
  const [customersResult, membershipsResult] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("id, first_name, last_name, customer_code").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    membershipIds.length ? supabase.from("memberships").select("id, plan_id").in("id", membershipIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedError = customersResult.error ?? membershipsResult.error;
  if (relatedError) throw new Error(`Unable to load payment relationships: ${relatedError.message}`);

  const customers = new Map(((customersResult.data ?? []) as CustomerRow[]).map(customer => [customer.id, customer]));
  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  const planIds = [...new Set(memberships.map(membership => membership.plan_id).filter((id): id is string => Boolean(id)))];
  const plansResult = planIds.length ? await supabase.from("plans").select("id, name").in("id", planIds) : { data: [], error: null };
  if (plansResult.error) throw new Error(`Unable to load payment plans: ${plansResult.error.message}`);
  const plans = new Map((plansResult.data as PlanRow[]).map(plan => [plan.id, plan.name]));
  const membershipPlans = new Map(memberships.map(membership => [membership.id, membership.plan_id ? plans.get(membership.plan_id) ?? null : null]));

  const payments = paymentRows.map(payment => ({
    ...payment,
    customer: customers.get(payment.customer_id) ?? null,
    planName: payment.membership_id ? membershipPlans.get(payment.membership_id) ?? null : null,
  }));
  const paidRevenue = payments.reduce((total, payment) => payment.payment_status === "PAID" ? total + (Number(payment.amount) || 0) : total, 0);
  return { payments, total: count ?? 0, paidRevenue };
}

export { PAGE_SIZE as PAYMENT_PAGE_SIZE };
