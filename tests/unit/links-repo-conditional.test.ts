import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLinksRepo } from "../../src/links/links-repo";

type Result = { data: unknown; error: unknown };

function fake(result: Result) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const name of ["update", "eq", "select"]) {
    builder[name] = vi.fn((...args: unknown[]) => {
      calls.push([name, args]);
      return builder;
    });
  }
  builder.single = vi.fn().mockResolvedValue(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (resolve: (v: Result) => void) => void Promise.resolve(result).then(resolve);
  const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
  return { client, calls };
}

describe("updateLinkIfUnchanged", () => {
  it("filters by id and the loaded updated_at and returns the new updated_at", async () => {
    const { client, calls } = fake({ data: [{ updated_at: "2026-11-17T12:00:05+00:00" }], error: null });
    const res = await createLinksRepo(client).updateLinkIfUnchanged(
      "abc",
      { plan_items: [{ list: "checklist", text: "Ingressos", done: true }] },
      "2026-11-17T12:00:00+00:00"
    );
    expect(res).toEqual({ updated_at: "2026-11-17T12:00:05+00:00" });
    expect(calls).toContainEqual(["eq", ["id", "abc"]]);
    expect(calls).toContainEqual(["eq", ["updated_at", "2026-11-17T12:00:00+00:00"]]);
    expect(calls.some(([n]) => n === "select")).toBe(true);
  });

  it("returns null when no row matched (someone else saved first)", async () => {
    const { client } = fake({ data: [], error: null });
    await expect(
      createLinksRepo(client).updateLinkIfUnchanged("abc", { people: ["Ana"] }, "2026-11-17T12:00:00+00:00")
    ).resolves.toBeNull();
  });

  it("surfaces server errors", async () => {
    const { client } = fake({ data: null, error: { message: "boom" } });
    await expect(
      createLinksRepo(client).updateLinkIfUnchanged("abc", { people: ["Ana"] }, "t")
    ).rejects.toThrow("boom");
  });

  it("still validates the patch", async () => {
    const { client } = fake({ data: [], error: null });
    await expect(
      createLinksRepo(client).updateLinkIfUnchanged("abc", { label: "" }, "t")
    ).rejects.toThrow("label");
  });
});

describe("getLink", () => {
  it("returns the normalized row, or null when gone", async () => {
    const row = { id: "abc", url: "https://a.example", label: "A", updated_at: "t1" };
    const found = fake({ data: row, error: null });
    expect((await createLinksRepo(found.client).getLink("abc"))?.updated_at).toBe("t1");
    const gone = fake({ data: null, error: null });
    expect(await createLinksRepo(gone.client).getLink("abc")).toBeNull();
  });
});
