import { supabase } from "../integrations/supabase/client";
import type { Plan, CustomerCategory } from "../types";

const STORAGE_KEY = "powerplus_plans";

export function getLocalPlans(): Plan[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Unable to read plans from local storage", err);
  }
  return [];
}

export function saveLocalPlans(plans: Plan[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch (err) {
    console.warn("Unable to save plans to local storage", err);
  }
}

export function planMatchesCategory(plan: Plan, category: CustomerCategory | string): boolean {
  if (!plan.active) return false;
  const applicable = plan.applicableCategories;
  if (applicable === "ALL") return true;
  if (Array.isArray(applicable)) {
    return applicable.includes("ALL" as any) || applicable.includes(category as any);
  }
  return false;
}

export async function fetchPlans(categoryFilter?: string, includeInactive = false): Promise<Plan[]> {
  try {
    let query = (supabase.from("plans") as any).select("*").order("price", { ascending: true });
    if (!includeInactive) {
      query = query.eq("is_active", true);
    }
    const { data, error } = await query;
    if (!error && data) {
      const mapped: Plan[] = (data as Array<{
        id: string;
        name: string;
        price: number;
        duration_days?: number | null;
        benefits?: string | null;
        is_active?: boolean | null;
        applicable_categories?: string[] | null;
        description?: string | null;
      }>).map(row => {
        const rawCats = row.applicable_categories;
        const isAll = !rawCats || rawCats.length === 0 || (Array.isArray(rawCats) && rawCats.includes("ALL"));
        return {
          id: row.id,
          name: row.name,
          price: Number(row.price),
          durationDays: Number(row.duration_days) || 30,
          perks: row.benefits ? row.benefits.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          active: Boolean(row.is_active ?? true),
          applicableCategories: isAll ? "ALL" : (rawCats as CustomerCategory[]),
          description: row.description || "",
        };
      });

      // Save real plans to local storage as fallback cache
      saveLocalPlans(mapped);

      if (categoryFilter) {
        return mapped.filter(p => planMatchesCategory(p, categoryFilter));
      }
      return mapped;
    }
    if (error) {
      console.warn("Error fetching plans from Supabase:", error);
    }
  } catch (err) {
    console.warn("Exception querying plans from Supabase:", err);
  }

  const local = getLocalPlans();
  if (categoryFilter) {
    return local.filter(p => planMatchesCategory(p, categoryFilter));
  }
  return local;
}

export async function createPlan(input: {
  name: string;
  price: number;
  durationDays: number;
  perks: string[];
  applicableCategories: CustomerCategory[] | "ALL";
  description?: string;
  id?: string;
}): Promise<Plan> {
  const categoriesToStore = input.applicableCategories === "ALL"
    ? ["ALL"]
    : input.applicableCategories;

  const insertPayload: Record<string, any> = {
    name: input.name.trim(),
    price: Number(input.price),
    duration_days: Number(input.durationDays) || 30,
    description: input.description?.trim() || "",
    benefits: input.perks.join(", "),
    applicable_categories: categoriesToStore,
    is_active: true,
  };

  // If a valid UUID id was passed, include it, otherwise let database generate gen_random_uuid()
  if (input.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)) {
    insertPayload.id = input.id;
  }

  const { data, error } = await (supabase.from("plans") as any).insert([insertPayload]).select();
  if (error) {
    console.error("Failed to insert plan to Supabase:", error);
    throw new Error(error.message);
  }

  const savedRow = (data as any)?.[0];
  const createdPlan: Plan = {
    id: savedRow ? savedRow.id : (input.id || `p_${Date.now()}`),
    name: savedRow?.name ?? input.name.trim(),
    price: Number(savedRow?.price ?? input.price),
    durationDays: Number(savedRow?.duration_days ?? input.durationDays) || 30,
    perks: savedRow?.benefits ? String(savedRow.benefits).split(",").map((s: string) => s.trim()).filter(Boolean) : input.perks,
    active: Boolean(savedRow?.is_active ?? true),
    applicableCategories: input.applicableCategories,
    description: savedRow?.description ?? (input.description?.trim() || ""),
  };

  const current = getLocalPlans().filter(p => p.id !== createdPlan.id);
  saveLocalPlans([...current, createdPlan]);

  return createdPlan;
}

export async function updatePlan(plan: Plan): Promise<Plan> {
  const categoriesToStore = plan.applicableCategories === "ALL"
    ? ["ALL"]
    : plan.applicableCategories;

  const updatePayload = {
    name: plan.name.trim(),
    price: Number(plan.price),
    duration_days: Number(plan.durationDays) || 30,
    description: plan.description?.trim() || "",
    benefits: plan.perks.join(", "),
    applicable_categories: categoriesToStore,
    is_active: plan.active,
    updated_at: new Date().toISOString(),
  };

  const { error } = await (supabase.from("plans") as any).update(updatePayload).eq("id", plan.id);
  if (error) {
    console.error("Failed to update plan in Supabase:", error);
    throw new Error(error.message);
  }

  const current = getLocalPlans();
  const next = current.map(p => p.id === plan.id ? plan : p);
  saveLocalPlans(next);

  return plan;
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await (supabase.from("plans") as any).delete().eq("id", id);
  if (error) {
    console.error("Failed to delete plan from Supabase:", error);
    throw new Error(error.message);
  }

  const current = getLocalPlans();
  const next = current.filter(p => p.id !== id);
  saveLocalPlans(next);
}
