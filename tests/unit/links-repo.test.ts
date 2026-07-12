import { describe, expect, it, vi, beforeEach } from "vitest";
import { createLinksRepo } from "../../src/links/links-repo";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Query builder fake ──────────────────────────────────────────────────────

type FakeResult = { data: unknown; error: unknown };

function makeQueryBuilder(result: FakeResult) {
  const builder: Record<string, unknown> = {};

  const terminal = vi.fn().mockResolvedValue(result);

  // Chainable methods that return `this`
  const chain = (name: string) => {
    builder[name] = vi.fn().mockReturnValue(builder);
  };

  chain("select");
  chain("order");
  chain("insert");
  chain("update");
  chain("delete");
  chain("eq");
  chain("upsert");

  // Terminal: single() resolves the result
  builder["single"] = terminal;

  // Make the builder itself thenable so `await from(...).select().order()` works
  builder["then"] = (resolve: (v: FakeResult) => void) => {
    Promise.resolve(result).then(resolve);
  };

  return builder;
}

function makeFakeClient(resultOverrides: Partial<Record<string, FakeResult>> = {}) {
  const defaultResult: FakeResult = { data: [], error: null };

  const fromMock = vi.fn((table: string) => {
    const result = resultOverrides[table] ?? defaultResult;
    return makeQueryBuilder(result);
  });

  return {
    from: fromMock,
  } as unknown as SupabaseClient;
}

// ─── listLinks ───────────────────────────────────────────────────────────────

describe("listLinks", () => {
  it("selects from links table ordered by sort_order ascending", async () => {
    const rows = [
      { id: "1", url: "https://a.com", label: "A", description: null, icon_preset: null, icon_url: null, sort_order: 0, scheduled_start: null, scheduled_end: null },
      { id: "2", url: "https://b.com", label: "B", description: null, icon_preset: null, icon_url: null, sort_order: 1, scheduled_start: null, scheduled_end: null },
    ];
    const client = makeFakeClient({ links: { data: rows, error: null } });
    const repo = createLinksRepo(client);
    const result = await repo.listLinks();

    expect(client.from).toHaveBeenCalledWith("links");
    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.select).toHaveBeenCalled();
    expect(builder.order).toHaveBeenCalledWith("sort_order", { ascending: true });
    expect(result).toEqual(rows);
  });

  it("throws when supabase returns an error", async () => {
    const client = makeFakeClient({ links: { data: null, error: { message: "DB error" } } });
    const repo = createLinksRepo(client);
    await expect(repo.listLinks()).rejects.toThrow("DB error");
  });
});

// ─── createLink ──────────────────────────────────────────────────────────────

describe("createLink", () => {
  const validInput = {
    url: "https://example.com",
    label: "Example",
    description: null,
    icon_preset: null,
    icon_url: null,
    sort_order: 0,
    scheduled_start: null,
    scheduled_end: null,
  };

  it("passes valid payloads through to supabase", async () => {
    const createdRow = { id: "new-id", ...validInput };
    const client = makeFakeClient({ links: { data: createdRow, error: null } });
    const repo = createLinksRepo(client);
    const result = await repo.createLink(validInput);

    expect(client.from).toHaveBeenCalledWith("links");
    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.insert).toHaveBeenCalled();
    expect(result).toEqual(createdRow);
  });

  it("rejects http:// url", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, url: "http://example.com" })
    ).rejects.toThrow(/url/i);
  });

  it("rejects empty label", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, label: "" })
    ).rejects.toThrow(/label/i);
  });

  it("rejects label exceeding 200 characters", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, label: "x".repeat(201) })
    ).rejects.toThrow(/label/i);
  });

  it("rejects description exceeding 500 characters", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, description: "x".repeat(501) })
    ).rejects.toThrow(/description/i);
  });

  it("rejects non-https icon_url", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, icon_url: "http://cdn.example.com/icon.png" })
    ).rejects.toThrow(/icon_url/i);
  });

  it("accepts valid https icon_url", async () => {
    const createdRow = { id: "new-id", ...validInput, icon_url: "https://cdn.example.com/icon.png" };
    const client = makeFakeClient({ links: { data: createdRow, error: null } });
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, icon_url: "https://cdn.example.com/icon.png" })
    ).resolves.not.toThrow();
  });

  it("accepts null icon_url (skips validation)", async () => {
    const createdRow = { id: "new-id", ...validInput };
    const client = makeFakeClient({ links: { data: createdRow, error: null } });
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, icon_url: null })
    ).resolves.not.toThrow();
  });

  it("accepts label of exactly 200 characters", async () => {
    const createdRow = { id: "new-id", ...validInput, label: "x".repeat(200) };
    const client = makeFakeClient({ links: { data: createdRow, error: null } });
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, label: "x".repeat(200) })
    ).resolves.not.toThrow();
  });

  it("accepts description of exactly 500 characters", async () => {
    const createdRow = { id: "new-id", ...validInput, description: "x".repeat(500) };
    const client = makeFakeClient({ links: { data: createdRow, error: null } });
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, description: "x".repeat(500) })
    ).resolves.not.toThrow();
  });
});

// ─── updateLink ──────────────────────────────────────────────────────────────

describe("updateLink", () => {
  it("calls update with id filter", async () => {
    const client = makeFakeClient({ links: { data: {}, error: null } });
    const repo = createLinksRepo(client);
    await repo.updateLink("some-id", { label: "Updated" });

    expect(client.from).toHaveBeenCalledWith("links");
    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.update).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("id", "some-id");
  });

  it("rejects invalid url in patch", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(
      repo.updateLink("some-id", { url: "http://example.com" })
    ).rejects.toThrow(/url/i);
  });

  it("rejects overlong label in patch", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(
      repo.updateLink("some-id", { label: "x".repeat(201) })
    ).rejects.toThrow(/label/i);
  });
});

// ─── deleteLink ──────────────────────────────────────────────────────────────

describe("deleteLink", () => {
  it("calls delete with id filter", async () => {
    const client = makeFakeClient({ links: { data: {}, error: null } });
    const repo = createLinksRepo(client);
    await repo.deleteLink("del-id");

    expect(client.from).toHaveBeenCalledWith("links");
    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("id", "del-id");
  });
});

// ─── saveOrder ───────────────────────────────────────────────────────────────

describe("saveOrder", () => {
  it("performs two-phase update: negatives first, then finals", async () => {
    const callLog: Array<{ phase: string; id: string; sort_order: number }> = [];

    // We need to intercept the actual update+eq calls in sequence
    let callCount = 0;
    const fromMock = vi.fn(() => {
      callCount++;
      const currentCall = callCount;
      const builder: Record<string, unknown> = {};

      builder["update"] = vi.fn((patch: { sort_order: number }) => {
        const phase = patch.sort_order < 0 ? "negative" : "final";
        return {
          eq: vi.fn((col: string, id: string) => {
            callLog.push({ phase, id, sort_order: patch.sort_order });
            return Promise.resolve({ data: {}, error: null });
          }),
        };
      });

      return builder;
    });

    const client = { from: fromMock } as unknown as SupabaseClient;
    const repo = createLinksRepo(client);

    const items = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ];

    await repo.saveOrder(items);

    // Phase 1: all negative updates
    const negativeUpdates = callLog.filter((e) => e.phase === "negative");
    const finalUpdates = callLog.filter((e) => e.phase === "final");

    expect(negativeUpdates).toHaveLength(3);
    expect(finalUpdates).toHaveLength(3);

    // All negatives must appear before any final
    const lastNegIndex = callLog.findLastIndex((e) => e.phase === "negative");
    const firstFinalIndex = callLog.findIndex((e) => e.phase === "final");
    expect(lastNegIndex).toBeLessThan(firstFinalIndex);

    // Negatives use -(index+1)
    expect(negativeUpdates[0].sort_order).toBe(-1);
    expect(negativeUpdates[1].sort_order).toBe(-2);
    expect(negativeUpdates[2].sort_order).toBe(-3);

    // Finals use the provided sort_order values
    expect(finalUpdates.map((e) => e.sort_order).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("throws on first error in phase 1", async () => {
    let callIndex = 0;
    const fromMock = vi.fn(() => {
      callIndex++;
      const idx = callIndex;
      return {
        update: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({
              data: null,
              error: idx === 2 ? { message: "Phase 1 error" } : null,
            })
          ),
        })),
      };
    });

    const client = { from: fromMock } as unknown as SupabaseClient;
    const repo = createLinksRepo(client);

    const items = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
    ];

    await expect(repo.saveOrder(items)).rejects.toThrow("Phase 1 error");
  });

  it("throws on first error in phase 2", async () => {
    const items = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
    ];
    // Total calls: 2 phase-1 (negative) + 2 phase-2 (final) = 4
    // Make the 3rd call (first phase-2 update) fail
    let callIndex = 0;
    const fromMock = vi.fn(() => {
      callIndex++;
      const idx = callIndex;
      return {
        update: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({
              data: null,
              error: idx === 3 ? { message: "Phase 2 error" } : null,
            })
          ),
        })),
      };
    });

    const client = { from: fromMock } as unknown as SupabaseClient;
    const repo = createLinksRepo(client);

    await expect(repo.saveOrder(items)).rejects.toThrow("Phase 2 error");
  });

  it("resolves immediately with empty items array", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(repo.saveOrder([])).resolves.toBeUndefined();
    expect(client.from).not.toHaveBeenCalled();
  });
});
