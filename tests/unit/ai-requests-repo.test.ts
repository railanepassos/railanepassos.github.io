import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAiRequestsRepo } from "../../src/links/ai-requests-repo";

type Result = { data: unknown; error: { message: string } | null };

/** Chainable, awaitable query builder: every method returns the builder itself. */
function builder(result: Result) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "in", "order", "limit", "eq"]) b[m] = vi.fn(() => b);
  b.single = vi.fn(() => Promise.resolve(result));
  b.maybeSingle = vi.fn(() => Promise.resolve(result));
  b.then = (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return b as Record<string, ReturnType<typeof vi.fn>> & { then: unknown };
}

function clientWith(result: Result) {
  const b = builder(result);
  const from = vi.fn(() => b);
  return { client: { from } as unknown as SupabaseClient, from, b };
}

const ROW = {
  id: "r1",
  kind: "agenda",
  status: "pendente",
  payload: { range_start: "2026-12-01", range_end: "2026-12-31" },
  result: null,
  error: null,
  created_at: "2026-11-22T10:00:00Z",
  updated_at: "2026-11-22T10:00:00Z",
  processed_at: null,
};

describe("ai requests repo: list", () => {
  it("reads active and finished-but-not-closed rows, newest first, limit 50", async () => {
    const { client, from, b } = clientWith({ data: [ROW], error: null });
    const rows = await createAiRequestsRepo(client).list();
    expect(rows).toEqual([ROW]);
    expect(from).toHaveBeenCalledWith("links_ai_requests");
    expect(b.in).toHaveBeenCalledWith("status", ["pendente", "processando", "pronto", "erro"]);
    expect(b.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(b.limit).toHaveBeenCalledWith(50);
  });

  it("returns [] for null data and throws on error", async () => {
    expect(await createAiRequestsRepo(clientWith({ data: null, error: null }).client).list()).toEqual([]);
    await expect(
      createAiRequestsRepo(clientWith({ data: null, error: { message: "boom" } }).client).list()
    ).rejects.toThrow("boom");
  });
});

describe("ai requests repo: create", () => {
  it("validates, inserts a pending row and returns it", async () => {
    const { client, from, b } = clientWith({ data: ROW, error: null });
    const row = await createAiRequestsRepo(client).create("agenda", {
      range_start: "2026-12-01",
      range_end: "2026-12-31",
      junk: 1,
    });
    expect(row).toEqual(ROW);
    expect(from).toHaveBeenCalledWith("links_ai_requests");
    expect(b.insert).toHaveBeenCalledWith({
      kind: "agenda",
      status: "pendente",
      payload: { range_start: "2026-12-01", range_end: "2026-12-31" },
    });
  });

  it("does not touch the network when the payload is invalid", async () => {
    const { client, from } = clientWith({ data: ROW, error: null });
    await expect(
      createAiRequestsRepo(client).create("instagram", { post_urls: ["https://example.com"], from_dms: false })
    ).rejects.toThrow(/Instagram/);
    expect(from).not.toHaveBeenCalled();
  });

  it("surfaces insert errors", async () => {
    const { client } = clientWith({ data: null, error: { message: "denied" } });
    await expect(
      createAiRequestsRepo(client).create("agenda", { range_start: "2026-12-01", range_end: "2026-12-02" })
    ).rejects.toThrow("denied");
  });
});

describe("ai requests repo: discard / markApplied", () => {
  it("discard sets status descartado by id", async () => {
    const { client, b } = clientWith({ data: [{ id: "r1" }], error: null });
    await createAiRequestsRepo(client).discard("r1");
    expect(b.update).toHaveBeenCalledWith({ status: "descartado" });
    expect(b.eq).toHaveBeenCalledWith("id", "r1");
  });

  it("markApplied sets status aplicado by id", async () => {
    const { client, b } = clientWith({ data: [{ id: "r1" }], error: null });
    await createAiRequestsRepo(client).markApplied("r1");
    expect(b.update).toHaveBeenCalledWith({ status: "aplicado" });
    expect(b.eq).toHaveBeenCalledWith("id", "r1");
  });

  it("throws on error, and when no row was changed (RLS hides closed rows)", async () => {
    await expect(
      createAiRequestsRepo(clientWith({ data: null, error: { message: "boom" } }).client).discard("r1")
    ).rejects.toThrow("boom");
    await expect(
      createAiRequestsRepo(clientWith({ data: [], error: null }).client).markApplied("r1")
    ).rejects.toThrow();
  });
});

describe("ai requests repo: lastRun", () => {
  it("reads links_ai_runs.last_run_at", async () => {
    const { client, from, b } = clientWith({ data: { last_run_at: "2026-11-22T11:00:00Z" }, error: null });
    expect(await createAiRequestsRepo(client).lastRun()).toBe("2026-11-22T11:00:00Z");
    expect(from).toHaveBeenCalledWith("links_ai_runs");
    expect(b.select).toHaveBeenCalledWith("last_run_at");
  });

  it("is null when never run or no row, and throws on error", async () => {
    expect(await createAiRequestsRepo(clientWith({ data: { last_run_at: null }, error: null }).client).lastRun()).toBeNull();
    expect(await createAiRequestsRepo(clientWith({ data: null, error: null }).client).lastRun()).toBeNull();
    await expect(
      createAiRequestsRepo(clientWith({ data: null, error: { message: "boom" } }).client).lastRun()
    ).rejects.toThrow("boom");
  });
});
