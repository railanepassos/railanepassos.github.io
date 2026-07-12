export type SupabaseConfig = { url: string; anonKey: string };

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: (import.meta.env.VITE_SUPABASE_URL ?? "").trim(),
    anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim(),
  };
}

/** Browser must use anon/publishable — never service_role / sb_secret. */
export function isBrowserSafeAnonKey(anonKey: string): boolean {
  const key = anonKey.trim();
  if (!key) return false;
  if (key.startsWith("sb_secret_")) return false;
  return true;
}

export function isSupabaseConfigured(config: SupabaseConfig): boolean {
  return (
    config.url.trim().length > 0 &&
    config.anonKey.trim().length > 0 &&
    isBrowserSafeAnonKey(config.anonKey)
  );
}
