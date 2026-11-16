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
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe("wishlist");
    expect(result[0].priority).toBe(0);
    expect(result[0].label).toBe("A");
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
    expect(result.id).toBe("new-id");
    expect(result.label).toBe("Example");
    expect(result.status).toBe("wishlist");
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

  it("rejects description exceeding 2000 characters", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, description: "x".repeat(2001) })
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

  it("rejects non-https image_url", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, image_url: "http://cdn.example.com/photo.jpg" })
    ).rejects.toThrow(/image_url/i);
  });

  it("rejects note exceeding 500 characters", async () => {
    const client = makeFakeClient();
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, note: "x".repeat(501) })
    ).rejects.toThrow(/note/i);
  });

  it("accepts label of exactly 200 characters", async () => {
    const createdRow = { id: "new-id", ...validInput, label: "x".repeat(200) };
    const client = makeFakeClient({ links: { data: createdRow, error: null } });
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, label: "x".repeat(200) })
    ).resolves.not.toThrow();
  });

  it("accepts description of exactly 2000 characters", async () => {
    const createdRow = { id: "new-id", ...validInput, description: "x".repeat(2000) };
    const client = makeFakeClient({ links: { data: createdRow, error: null } });
    const repo = createLinksRepo(client);
    await expect(
      repo.createLink({ ...validInput, description: "x".repeat(2000) })
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

// ─── Phase 2 optional fields ─────────────────────────────────────────────────

describe("Phase 2 fields", () => {
  const base = { url: "https://example.com", label: "Example", sort_order: 0 };

  it("normalizes missing new columns to null on read", async () => {
    const client = makeFakeClient({
      links: { data: [{ id: "1", url: "https://example.com", label: "A" }], error: null },
    });
    const [item] = await createLinksRepo(client).listLinks();
    expect(item.cost_text).toBeNull();
    expect(item.city).toBeNull();
    expect(item.address).toBeNull();
    expect(item.source_url).toBeNull();
    expect(item.tags).toBeNull();
    expect(item.people).toBeNull();
  });

  it("keeps new columns that the API returns", async () => {
    const client = makeFakeClient({
      links: {
        data: [{ id: "1", url: "https://example.com", label: "A", cost_text: "R$ 20", city: "Cidade", address: "Rua X, 1" }],
        error: null,
      },
    });
    const [item] = await createLinksRepo(client).listLinks();
    expect(item.cost_text).toBe("R$ 20");
    expect(item.city).toBe("Cidade");
    expect(item.address).toBe("Rua X, 1");
  });

  it("sends the new fields on create", async () => {
    const client = makeFakeClient({ links: { data: { id: "n", ...base }, error: null } });
    await createLinksRepo(client).createLink({ ...base, cost_text: "grátis", city: "Cidade" });
    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ cost_text: "grátis", city: "Cidade" })
    );
  });

  it("rejects over-long cost, city and address", async () => {
    const repo = createLinksRepo(makeFakeClient());
    await expect(repo.createLink({ ...base, cost_text: "x".repeat(201) })).rejects.toThrow(/cost_text/);
    await expect(repo.createLink({ ...base, city: "x".repeat(121) })).rejects.toThrow(/city/);
    await expect(repo.updateLink("1", { address: "x".repeat(301) })).rejects.toThrow(/address/);
  });

  it("rejects over-long dossier and itinerary", async () => {
    const repo = createLinksRepo(makeFakeClient());
    await expect(repo.createLink({ ...base, dossier: "x".repeat(5001) })).rejects.toThrow(/dossier/);
    await expect(repo.updateLink("1", { itinerary: "x".repeat(5001) })).rejects.toThrow(/itinerary/);
    await expect(repo.updateLink("1", { dossier: "x".repeat(5000) })).resolves.toBeUndefined();
  });

  it("rejects a non-https source_url", async () => {
    const repo = createLinksRepo(makeFakeClient());
    await expect(repo.createLink({ ...base, source_url: "http://example.com" })).rejects.toThrow(/source_url/);
    await expect(repo.updateLink("1", { source_url: "javascript:alert(1)" })).rejects.toThrow(/source_url/);
  });

  it("rejects a non-https or oversized memory_url, accepts https or null", async () => {
    const repo = createLinksRepo(makeFakeClient());
    await expect(repo.updateLink("1", { memory_url: "http://example.com" })).rejects.toThrow(/memory_url/);
    await expect(repo.createLink({ ...base, memory_url: "javascript:alert(1)" })).rejects.toThrow(/memory_url/);
    await expect(
      repo.updateLink("1", { memory_url: `https://x.com/${"a".repeat(2000)}` })
    ).rejects.toThrow(/memory_url/);
    await expect(repo.updateLink("1", { memory_url: "https://youtu.be/dQw4w9WgXcQ" })).resolves.toBeUndefined();
    await expect(repo.updateLink("1", { memory_url: null })).resolves.toBeUndefined();
  });

  it("rejects invalid pose_refs and accepts valid ones", async () => {
    const repo = createLinksRepo(makeFakeClient());
    await expect(
      repo.createLink({ ...base, pose_refs: [{ url: "http://example.com" }] })
    ).rejects.toThrow(/pose_refs/);
    await expect(
      repo.updateLink("1", { pose_refs: Array.from({ length: 31 }, () => ({ note: "x" })) })
    ).rejects.toThrow(/pose_refs/);
    await expect(
      repo.updateLink("1", { pose_refs: [{ url: "https://example.com/a", note: "n" }] })
    ).resolves.toBeUndefined();
  });

  it("rejects impressions and lessons beyond the DB limits, accepts valid ones", async () => {
    const repo = createLinksRepo(makeFakeClient());
    await expect(repo.updateLink("1", { impressions: "x".repeat(5001) })).rejects.toThrow(/impressions/);
    await expect(
      repo.updateLink("1", { lessons: Array.from({ length: 21 }, () => "x") })
    ).rejects.toThrow(/lessons/);
    await expect(repo.updateLink("1", { lessons: ["x".repeat(301)] })).rejects.toThrow(/lessons/);
    await expect(
      repo.updateLink("1", { impressions: "Gostei.\nCaro.", lessons: ["levar lanche"] })
    ).resolves.toBeUndefined();
    await expect(repo.updateLink("1", { impressions: null, lessons: null })).resolves.toBeUndefined();
  });

  it("rejects too many or over-long tags", async () => {
    const repo = createLinksRepo(makeFakeClient());
    const many = Array.from({ length: 31 }, (_, i) => `t${i}`);
    await expect(repo.createLink({ ...base, tags: many })).rejects.toThrow(/tags/);
    await expect(repo.updateLink("1", { tags: ["x".repeat(41)] })).rejects.toThrow(/tags/);
    await expect(repo.updateLink("1", { tags: ["praia"] })).resolves.toBeUndefined();
  });

  it("rejects too many or over-long people names", async () => {
    const repo = createLinksRepo(makeFakeClient());
    const many = Array.from({ length: 31 }, (_, i) => `Pessoa ${i}`);
    await expect(repo.createLink({ ...base, people: many })).rejects.toThrow(/people/);
    await expect(repo.updateLink("1", { people: ["x".repeat(81)] })).rejects.toThrow(/people/);
    await expect(repo.updateLink("1", { people: ["Maria Clara"] })).resolves.toBeUndefined();
  });
});

// ─── Phase 3 "Como foi" fields ───────────────────────────────────────────────

describe("Phase 3 fields", () => {
  const base = { url: "https://example.com", label: "Example", sort_order: 0 };

  it("normalizes missing and invalid rating to null on read, keeps a valid one", async () => {
    const client = makeFakeClient({
      links: {
        data: [
          { id: "1", url: "https://example.com", label: "A" },
          { id: "2", url: "https://example.com", label: "B", rating: 4, impressions: "ótimo" },
          { id: "3", url: "https://example.com", label: "C", rating: 9 },
        ],
        error: null,
      },
    });
    const [a, b, c] = await createLinksRepo(client).listLinks();
    expect(a!.rating).toBeNull();
    expect(a!.impressions).toBeNull();
    expect(a!.lessons).toBeNull();
    expect(a!.memory_url).toBeNull();
    expect(b!.rating).toBe(4);
    expect(b!.impressions).toBe("ótimo");
    expect(c!.rating).toBeNull();
  });

  it("rejects ratings outside 1-5 (integers) and accepts null to clear", async () => {
    const repo = createLinksRepo(makeFakeClient());
    await expect(repo.createLink({ ...base, rating: 0 })).rejects.toThrow(/rating/);
    await expect(repo.updateLink("1", { rating: 6 })).rejects.toThrow(/rating/);
    await expect(repo.updateLink("1", { rating: 2.5 })).rejects.toThrow(/rating/);
    await expect(repo.updateLink("1", { rating: 5 })).resolves.toBeUndefined();
    await expect(repo.updateLink("1", { rating: null })).resolves.toBeUndefined();
  });
});
