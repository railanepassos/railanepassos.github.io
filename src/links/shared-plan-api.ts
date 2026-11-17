import type { SupabaseConfig } from "./config";
import { classifyPlanWriteError, type PlanWriteError } from "./plan-share";

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

/** A failed tick, already classified (see classifyPlanWriteError). */
export class SharedPlanWriteFailure extends Error {
  constructor(readonly kind: PlanWriteError) {
    super(`shared plan write failed (${kind})`);
  }
}

/**
 * Ticks one item through links_shared_plan_set_done. Same rules as the read:
 * plain fetch, anon key only, no cookies, no Authorization, no Referer.
 * Resolves with the updated plan; throws SharedPlanWriteFailure otherwise.
 */
export async function setSharedPlanDone(
  config: SupabaseConfig,
  args: { token: string; idx: number; expectedText: string; done: boolean },
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.url}/rest/v1/rpc/links_shared_plan_set_done`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        token: args.token,
        idx: args.idx,
        expected_text: args.expectedText,
        done: args.done,
      }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new SharedPlanWriteFailure("error");
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new SharedPlanWriteFailure(classifyPlanWriteError(response.status, body));
  }
  return response.json();
}
