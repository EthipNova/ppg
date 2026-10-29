const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

function isValidSupabaseUrl(value: string): boolean {
  if (!value || /your[_ -]?(supabase|project)|placeholder|example|\[YOUR/i.test(value)) return false;

  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function isConfiguredKey(value: string): boolean {
  return Boolean(value) && !/your[_ -]?supabase|your[_ -]?anon|placeholder|example|\[YOUR/i.test(value);
}

export const supabaseConfig = {
  url,
  anonKey,
  urlIsValid: isValidSupabaseUrl(url),
  keyIsPresent: isConfiguredKey(anonKey),
};

export const missingSupabaseSettings = [
  ...(!supabaseConfig.urlIsValid ? ["VITE_SUPABASE_URL"] : []),
  ...(!supabaseConfig.keyIsPresent ? ["VITE_SUPABASE_ANON_KEY"] : []),
];

export const isSupabaseConfigured = missingSupabaseSettings.length === 0;
