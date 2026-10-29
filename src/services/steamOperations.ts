import { supabase } from "../integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// These feature tables and RPCs are introduced by the accompanying unapplied SQL migration.
const steamDb = supabase as unknown as SupabaseClient;

export interface SteamServiceOffering {
  id: string;
  name: string;
  description: string;
  price: number;
  active: boolean;
  accessType: "package" | "per-visit";
  durationDays: number;
  usageLimit: number | null;
  trackUsage: boolean;
}

export interface SteamEntitlementRow {
  id: string;
  customerId: string;
  customerName: string;
  serviceId: string | null;
  serviceName: string;
  price: number;
  currency: string;
  paymentId: string | null;
  paymentStatus: string;
  paymentMethod: string;
  purchaseDate: string;
  startDate: string;
  endDate: string;
  status: string;
  usageCount: number;
  usageLimit: number | null;
  trackUsage: boolean;
}

export interface SteamCustomerOption {
  id: string;
  name: string;
  code: string;
  phone: string | null;
}

export interface PendingSteamPayment {
  id: string;
  customerId: string;
  customerName: string;
  serviceName: string;
  amount: number;
  paymentMethod: string;
  createdAt: string;
}

export async function fetchSteamServiceOfferings(): Promise<SteamServiceOffering[]> {
  const optionsResult = await supabase
    .from("steam_service_options")
    .select("service_id, access_type, duration_days, usage_limit, track_usage");
  if (optionsResult.error) throw new Error(`Unable to load Steam offerings: ${optionsResult.error.message}`);
  const options = optionsResult.data ?? [];
  if (options.length === 0) return [];

  const serviceResult = await supabase
    .from("services")
    .select("id, name, description, price, is_active")
    .in("id", options.map(option => option.service_id));
  if (serviceResult.error) throw new Error(`Unable to load Steam service details: ${serviceResult.error.message}`);
  const services = new Map((serviceResult.data ?? []).map(service => [service.id, service]));
  return options.flatMap(option => {
    const service = services.get(option.service_id);
    if (!service) return [];
    return [{
      id: service.id,
      name: service.name,
      description: service.description ?? "",
      price: Number(service.price),
      active: Boolean(service.is_active),
      accessType: option.access_type as SteamServiceOffering["accessType"],
      durationDays: Number(option.duration_days),
      usageLimit: option.usage_limit === null ? null : Number(option.usage_limit),
      trackUsage: Boolean(option.track_usage),
    }];
  });
}

export async function searchSteamCustomers(search: string): Promise<SteamCustomerOption[]> {
  const query = search.trim().replace(/[,%()]/g, " ");
  if (query.length < 2) return [];
  const { data, error } = await steamDb.from("customers")
    .select("id, customer_code, first_name, last_name, phone")
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,customer_code.ilike.%${query}%,phone.ilike.%${query}%`)
    .order("last_name")
    .limit(15);
  if (error) throw new Error(`Unable to search customers: ${error.message}`);
  return (data ?? []).map(customer => ({
    id: customer.id,
    name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
    code: customer.customer_code,
    phone: customer.phone,
  }));
}

export async function fetchSteamEntitlements(): Promise<SteamEntitlementRow[]> {
  const [accessResult, paymentResult] = await Promise.all([
    steamDb.from("steam_access").select("id, customer_id, service_id, price, currency, payment_id, start_date, end_date, status, usage_count, usage_limit, track_usage, created_at, cancelled_at").order("created_at", { ascending: false }).limit(500),
    steamDb.from("payments").select("id, customer_id, service_id, amount, payment_method, payment_status, paid_at, created_at").eq("service_type", "STEAM").order("created_at", { ascending: false }).limit(1000),
  ]);
  const error = accessResult.error ?? paymentResult.error;
  if (error) throw new Error(`Unable to load Steam purchase history: ${error.message}`);
  const accessRows = accessResult.data ?? [];
  const paymentRows = paymentResult.data ?? [];
  const customerIds = [...new Set([...accessRows.map(row => row.customer_id), ...paymentRows.map(row => row.customer_id)])];
  const serviceIds = [...new Set([...accessRows.map(row => row.service_id), ...paymentRows.map(row => row.service_id)].filter((id): id is string => Boolean(id)))];
  const [customersResult, servicesResult] = await Promise.all([
    customerIds.length ? steamDb.from("customers").select("id, first_name, last_name").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    serviceIds.length ? steamDb.from("services").select("id, name").in("id", serviceIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedError = customersResult.error ?? servicesResult.error;
  if (relatedError) throw new Error(`Unable to load Steam purchase details: ${relatedError.message}`);
  const customers = new Map((customersResult.data ?? []).map(customer => [customer.id, `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()]));
  const services = new Map((servicesResult.data ?? []).map(service => [service.id, service.name]));
  const payments = new Map(paymentRows.map(payment => [payment.id, payment]));
  return accessRows.map(row => {
    const payment = row.payment_id ? payments.get(row.payment_id) : undefined;
    const accessStatus = row.cancelled_at
      ? "Cancelled"
      : payment?.payment_status !== "PAID"
        ? "Unpaid / pending"
        : row.end_date < new Date().toISOString().slice(0, 10)
          || (row.track_usage && row.usage_limit !== null && Number(row.usage_count) >= Number(row.usage_limit))
            ? "Expired"
            : row.status;
    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: customers.get(row.customer_id) ?? "Customer",
      serviceId: row.service_id,
      serviceName: row.service_id ? services.get(row.service_id) ?? "Historical Steam service" : "Historical Steam service",
      price: Number(row.price ?? payment?.amount ?? 0),
      currency: row.currency ?? "ETB",
      paymentId: row.payment_id,
      paymentStatus: payment?.payment_status ?? "UNKNOWN",
      paymentMethod: payment?.payment_method ?? "UNKNOWN",
      purchaseDate: payment?.paid_at ?? payment?.created_at ?? row.created_at,
      startDate: row.start_date,
      endDate: row.end_date,
      status: accessStatus,
      usageCount: Number(row.usage_count ?? 0),
      usageLimit: row.usage_limit === null ? null : Number(row.usage_limit),
      trackUsage: Boolean(row.track_usage),
    };
  });
}

export async function fetchPendingSteamPayments(): Promise<PendingSteamPayment[]> {
  const { data, error } = await steamDb.from("payments")
    .select("id, customer_id, service_id, amount, payment_method, created_at")
    .eq("service_type", "STEAM").eq("payment_status", "PENDING")
    .order("created_at", { ascending: true }).limit(200);
  if (error) throw new Error(`Unable to load pending Steam payments: ${error.message}`);
  const payments = data ?? [];
  if (!payments.length) return [];
  const customerIds = [...new Set(payments.map(row => row.customer_id))];
  const serviceIds = [...new Set(payments.map(row => row.service_id).filter((id): id is string => Boolean(id)))];
  const [customersResult, servicesResult] = await Promise.all([
    steamDb.from("customers").select("id, first_name, last_name").in("id", customerIds),
    serviceIds.length ? steamDb.from("services").select("id, name").in("id", serviceIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedError = customersResult.error ?? servicesResult.error;
  if (relatedError) throw new Error(`Unable to load Steam payment details: ${relatedError.message}`);
  const customers = new Map((customersResult.data ?? []).map(customer => [customer.id, `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()]));
  const services = new Map((servicesResult.data ?? []).map(service => [service.id, service.name]));
  return payments.map(row => ({
    id: row.id,
    customerId: row.customer_id,
    customerName: customers.get(row.customer_id) ?? "Customer",
    serviceName: row.service_id ? services.get(row.service_id) ?? "Historical Steam service" : "Steam service",
    amount: Number(row.amount),
    paymentMethod: row.payment_method ?? "UNKNOWN",
    createdAt: row.created_at,
  }));
}

export async function saveSteamOffering(input: Omit<SteamServiceOffering, "active"> & { active: boolean }): Promise<void> {
  const { error } = await steamDb.rpc("save_steam_service", {
    p_service_id: input.id || null,
    p_name: input.name,
    p_description: input.description,
    p_price: input.price,
    p_access_type: input.accessType,
    p_duration_days: input.durationDays,
    p_usage_limit: input.usageLimit,
    p_track_usage: input.trackUsage,
    p_is_active: input.active,
  });
  if (error) throw new Error(`Unable to save Steam service: ${error.message}`);
}

export async function purchaseSteamWithCash(customerId: string, serviceId: string, idempotencyKey: string): Promise<void> {
  const { error } = await steamDb.rpc("purchase_steam_cash", {
    p_customer_id: customerId,
    p_service_id: serviceId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(`Unable to process cash purchase: ${error.message}`);
}

export async function recordSteamCheckin(accessId: string): Promise<void> {
  const { error } = await steamDb.rpc("record_steam_checkin", {
    p_access_id: accessId,
    p_request_id: crypto.randomUUID(),
    p_note: "Reception steam check-in",
  });
  if (error) throw new Error(`Steam check-in denied: ${error.message}`);
}

export async function cancelSteamEntitlement(accessId: string, reason: string): Promise<void> {
  const { error } = await steamDb.rpc("cancel_steam_access", { p_access_id: accessId, p_reason: reason });
  if (error) throw new Error(`Unable to cancel Steam access: ${error.message}`);
}

export async function approveSteamPayment(paymentId: string): Promise<void> {
  const { error } = await steamDb.rpc("approve_steam_payment", { p_payment_id: paymentId });
  if (error) throw new Error(`Unable to verify Steam payment: ${error.message}`);
}

export async function rejectSteamPayment(paymentId: string, reason: string): Promise<void> {
  const { error } = await steamDb.rpc("reject_steam_payment", { p_payment_id: paymentId, p_reason: reason });
  if (error) throw new Error(`Unable to reject Steam payment: ${error.message}`);
}
