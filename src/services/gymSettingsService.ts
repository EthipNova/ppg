import { supabase } from "../integrations/supabase/client";
import { DEFAULT_SETTINGS } from "../constants";
import type { GymSettings } from "../types";

const SETTINGS_STORAGE_KEY = "powerplus_gym_settings";

/**
 * Reads cached settings from localStorage if available.
 */
export function getLocalGymSettings(): GymSettings {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_SETTINGS;
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GymSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn("Unable to read gym settings from local storage:", err);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Saves settings to localStorage for fast startup retrieval.
 */
export function saveLocalGymSettings(settings: GymSettings): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("Unable to save gym settings to local storage:", err);
  }
}

/**
 * Fetches real gym settings from Supabase database (public.settings).
 * Falls back to local cached settings or defaults.
 */
export async function fetchGymSettings(): Promise<GymSettings> {
  try {
    let { data, error } = await (supabase.from("settings") as any)
      .select("*")
      .eq("id", "gym")
      .maybeSingle();

    if (!data) {
      const res = await (supabase.from("settings") as any)
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      data = res.data;
      error = res.error;
    }

    if (!error && data) {
      const mapped: GymSettings = {
        gymName: data.gym_name || DEFAULT_SETTINGS.gymName,
        tagline: data.tagline ?? DEFAULT_SETTINGS.tagline,
        description: data.description ?? DEFAULT_SETTINGS.description,
        email: data.email ?? DEFAULT_SETTINGS.email,
        phone: data.phone ?? DEFAULT_SETTINGS.phone,
        address: data.address ?? DEFAULT_SETTINGS.address,
        operatingHours: data.operating_hours ?? DEFAULT_SETTINGS.operatingHours,
        inactivityThresholdDays: Number(data.inactivity_threshold_days) || DEFAULT_SETTINGS.inactivityThresholdDays,
        currency: data.currency || DEFAULT_SETTINGS.currency,
        steamEnabled: data.steam_enabled ?? DEFAULT_SETTINGS.steamEnabled,
        steamModel: (data.steam_model as GymSettings["steamModel"]) || DEFAULT_SETTINGS.steamModel,
        steamPackagePrice: Number(data.steam_package_price) || DEFAULT_SETTINGS.steamPackagePrice,
        steamPackageDays: Number(data.steam_validity_days || data.steam_package_days) || DEFAULT_SETTINGS.steamPackageDays,
        steamPackageVisits: Number(data.steam_package_visits) || DEFAULT_SETTINGS.steamPackageVisits,
        steamPerVisitPrice: Number(data.steam_per_visit_price) || DEFAULT_SETTINGS.steamPerVisitPrice,
        steamExpiringSoonDays: Number(data.steam_expiring_soon_days) || DEFAULT_SETTINGS.steamExpiringSoonDays,
      };

      saveLocalGymSettings(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn("Failed to fetch gym settings from Supabase, using local fallback:", err);
  }

  return getLocalGymSettings();
}

/**
 * Updates gym settings in Supabase database and persists locally.
 * Writes only valid, supported database columns to prevent schema-cache errors.
 */
export async function updateGymSettings(updates: Partial<GymSettings>): Promise<GymSettings> {
  const current = getLocalGymSettings();
  const merged: GymSettings = { ...current, ...updates };

  // Only include columns that genuinely exist in public.settings
  const dbPayload: Record<string, unknown> = {
    id: "gym",
    updated_at: new Date().toISOString(),
  };

  if (merged.gymName !== undefined) dbPayload.gym_name = merged.gymName.trim();
  if (merged.tagline !== undefined) dbPayload.tagline = merged.tagline ? merged.tagline.trim() : null;
  if (merged.description !== undefined) dbPayload.description = merged.description ? merged.description.trim() : null;
  if (merged.email !== undefined) dbPayload.email = merged.email ? merged.email.trim() : null;
  if (merged.phone !== undefined) dbPayload.phone = merged.phone ? merged.phone.trim() : null;
  if (merged.address !== undefined) dbPayload.address = merged.address ? merged.address.trim() : null;
  if (merged.operatingHours !== undefined) dbPayload.operating_hours = merged.operatingHours ? merged.operatingHours.trim() : null;

  // Preserve existing numeric/system settings if columns exist in DB
  if (merged.inactivityThresholdDays !== undefined) dbPayload.inactivity_threshold_days = merged.inactivityThresholdDays;
  if (merged.currency !== undefined) dbPayload.currency = merged.currency;

  const { error } = await (supabase.from("settings") as any)
    .upsert(dbPayload, { onConflict: "id" });

  if (error) {
    console.error("Error updating gym settings in Supabase:", error);
    throw new Error(error.message || "Failed to update gym information.");
  }

  // Also sync the baseline 00000000-0000-0000-0000-000000000000 record if present
  try {
    const updateOnly = { ...dbPayload };
    delete updateOnly.id;
    await (supabase.from("settings") as any)
      .update(updateOnly)
      .eq("id", "00000000-0000-0000-0000-000000000000");
  } catch (syncErr) {
    console.warn("Sync to secondary settings row skipped:", syncErr);
  }

  saveLocalGymSettings(merged);

  // Notify active components of real-time update
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("powerplus:settings-updated", { detail: merged }));
  }

  return merged;
}

/**
 * Fetches the real aggregate active members count from Supabase.
 * Exposes only the aggregate count without revealing private customer data.
 */
export async function fetchPublicActiveMembersCount(): Promise<number> {
  try {
    // 1. Try secure aggregate RPC first
    const { data: rpcCount, error: rpcError } = await (supabase.rpc as any)("get_public_active_members_count");

    if (!rpcError && typeof rpcCount === "number") {
      return rpcCount;
    }

    // 2. Fallback: Query active memberships count directly
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await (supabase.from("memberships") as any)
      .select("customer_id")
      .eq("status", "ACTIVE")
      .gte("end_date", today);

    if (!error && Array.isArray(data)) {
      const uniqueCustomerIds = new Set((data as Array<{ customer_id?: string }>).map(m => m.customer_id).filter(Boolean));
      return uniqueCustomerIds.size;
    }
  } catch (err) {
    console.warn("Failed to fetch live active members count from Supabase:", err);
  }

  return 0;
}
