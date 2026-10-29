import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { isSupabaseConfigured, missingSupabaseSettings, supabaseConfig } from "./config";

if (!isSupabaseConfigured) {
  throw new Error(`Supabase configuration is incomplete or invalid: ${missingSupabaseSettings.join(", ")}`);
}

export const supabase = createClient<Database>(supabaseConfig.url, supabaseConfig.anonKey);

