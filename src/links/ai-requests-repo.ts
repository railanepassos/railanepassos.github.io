import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAiPayload, type AiRequestKind, type AiRequestRow } from "./ai-requests";

type Failure = { message: string } | null;

/** Statuses the panel still cares about; aplicado / descartado are closed. */
const OPEN_STATUSES = ["pendente", "processando", "pronto", "erro"] as const;
const LIST_LIMIT = 50;

/**
 * Claude request queue (migration 021). Editors queue and close requests; the
 * processor writes the rest, so nothing here touches result / error.
 */
export function createAiRequestsRepo(client: SupabaseClient) {
  async function setStatus(id: string, status: "aplicado" | "descartado"): Promise<void> {
    const result = await (client
      .from("links_ai_requests")
      .update({ status })
      .eq("id", id)
      .select("id") as unknown as Promise<{ data: { id: string }[] | null; error: Failure }>);
    if (result.error) throw new Error(result.error.message);
    // RLS hides closed / processing rows from update: zero rows means nothing changed.
    if (!result.data || result.data.length === 0) throw new Error("request not found or already closed");
  }

  return {
    /** Open requests (queued, processing, ready, failed), newest first. */
    async list(): Promise<AiRequestRow[]> {
      const result = await (client
        .from("links_ai_requests")
        .select("*")
        .in("status", [...OPEN_STATUSES])
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT) as unknown as Promise<{ data: AiRequestRow[] | null; error: Failure }>);
      if (result.error) throw new Error(result.error.message);
      return result.data ?? [];
    },

    /** Validates first (no network on a bad payload), then queues a pending row. */
    async create(kind: AiRequestKind, payload: unknown): Promise<AiRequestRow> {
      const checked = validateAiPayload(kind, payload);
      if (!checked.ok) throw new Error(checked.reason);
      const result = await (client
        .from("links_ai_requests")
        .insert({ kind, status: "pendente", payload: checked.payload })
        .select()
        .single() as unknown as Promise<{ data: AiRequestRow | null; error: Failure }>);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },

    discard(id: string): Promise<void> {
      return setStatus(id, "descartado");
    },

    markApplied(id: string): Promise<void> {
      return setStatus(id, "aplicado");
    },

    /** When the processor last ran (links_ai_runs), or null if it never did. */
    async lastRun(): Promise<string | null> {
      const result = await (client
        .from("links_ai_runs")
        .select("last_run_at")
        .eq("id", 1)
        .maybeSingle() as unknown as Promise<{ data: { last_run_at: string | null } | null; error: Failure }>);
      if (result.error) throw new Error(result.error.message);
      return result.data?.last_run_at ?? null;
    },
  };
}
