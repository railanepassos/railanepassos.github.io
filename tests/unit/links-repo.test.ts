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
