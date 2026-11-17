import type { SupabaseConfig } from "./config";
import { classifyPlanWriteError, type PlanWriteError } from "./plan-share";

/**
 * Public read of a shared plan. Deliberately NOT supabase-js: creating a client
 * initialises the auth session (reads localStorage, may refresh tokens). The
 * public page must never touch auth, so this is a plain fetch to PostgREST with
 * the anon key the bundle already has: no cookies, no Authorization header, no
 * Referer.
 */

/** One public rpc call: plain fetch, anon key only, no cookies, no Authorization, no Referer. */
function postRpc(
  config: SupabaseConfig,
  rpc: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch
): Promise<Response> {
  return fetchImpl(`${config.url}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
}

/** Resolves with the plan payload, or null when the token is inactive/unknown. Throws on network/server errors. */
export async function fetchSharedPlan(
  config: SupabaseConfig,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  const response = await postRpc(config, "links_shared_plan_get", { token }, fetchImpl);
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

async function callWrite(
  config: SupabaseConfig,
  rpc: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch
): Promise<unknown> {
  let response: Response;
  try {
    response = await postRpc(config, rpc, body, fetchImpl);
  } catch {
    throw new SharedPlanWriteFailure("error");
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    throw new SharedPlanWriteFailure(classifyPlanWriteError(response.status, data));
  }
  return response.json();
}

/**
 * Ticks one item through links_shared_plan_set_done. Same rules as the read:
 * plain fetch, anon key only, no cookies, no Authorization, no Referer.
 * Resolves with the updated plan; throws SharedPlanWriteFailure otherwise.
 */
export function setSharedPlanDone(
  config: SupabaseConfig,
  args: { token: string; idx: number; expectedText: string; done: boolean },
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  return callWrite(
    config,
    "links_shared_plan_set_done",
    { token: args.token, idx: args.idx, expected_text: args.expectedText, done: args.done },
    fetchImpl
  );
}

/** Claims ("Eu levo") or, with who null, releases one item through links_shared_plan_set_who. */
export function setSharedPlanWho(
  config: SupabaseConfig,
  args: { token: string; idx: number; expectedText: string; who: string | null },
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  return callWrite(
    config,
    "links_shared_plan_set_who",
    { token: args.token, idx: args.idx, expected_text: args.expectedText, who: args.who },
    fetchImpl
  );
}
