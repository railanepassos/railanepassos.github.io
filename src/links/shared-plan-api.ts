import type { SupabaseConfig } from "./config";

/**
 * Public read of a shared plan. Deliberately NOT supabase-js: creating a client
 * initialises the auth session (reads localStorage, may refresh tokens). The
 * public page must never touch auth, so this is a plain fetch to PostgREST with
 * the anon key the bundle already has: no cookies, no Authorization header, no
 * Referer.
 */

/** Resolves with the plan payload, or null when the token is inactive/unknown. Throws on network/server errors. */
export async function fetchSharedPlan(
  config: SupabaseConfig,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  const response = await fetchImpl(`${config.url}/rest/v1/rpc/links_shared_plan_get`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`shared plan request failed (${response.status})`);
  const data: unknown = await response.json();
  return data ?? null;
}
