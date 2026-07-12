export type SupabaseConfig = { url: string; anonKey: string };

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: import.meta.env.VITE_SUPABASE_URL ?? "",
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  };
}

export function isSupabaseConfigured(config: SupabaseConfig): boolean {
  return config.url.length > 0 && config.anonKey.length > 0;
}
