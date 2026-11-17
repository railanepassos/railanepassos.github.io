import { describe, expect, it } from "vitest";
import { groupMemories, memoryEntries, memoryTimeline } from "../../src/links/memories";
import type { LinkRow } from "../../src/links/links-repo";

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "id",
    url: "https://example.com",
    label: "Lugar",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
    sort_order: 0,
    scheduled_start: null,
    scheduled_end: null,
    status: "done",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: "2026-11-10T15:00:00Z",
    ...partial,
  };
}

describe("memoryEntries", () => {
  it("keeps only done items with a valid visit date, newest first", () => {
    const entries = memoryEntries([
      row({ id: "old", completed_at: "2025-03-10T15:00:00Z" }),
      row({ id: "new", completed_at: "2026-11-10T15:00:00Z" }),
      row({ id: "nodate", completed_at: null }),
      row({ id: "bad", completed_at: "nope" }),
      row({ id: "wish", status: "wishlist", completed_at: "2026-11-11T15:00:00Z" }),
    ]);
    expect(entries.map((e) => e.link.id)).toEqual(["new", "old"]);
    expect(entries[0]!.time).toBe(Date.parse("2026-11-10T15:00:00Z"));
  });

  it("is stable for the same visit date (input order kept)", () => {
    const entries = memoryEntries([
      row({ id: "a", completed_at: "2026-11-10T15:00:00Z" }),
      row({ id: "b", completed_at: "2026-11-10T15:00:00Z" }),
    ]);
    expect(entries.map((e) => e.link.id)).toEqual(["a", "b"]);
  });
});

describe("groupMemories", () => {
  it("groups by year then month, both newest first, with pt-BR labels", () => {
    const groups = groupMemories([
      row({ id: "a", completed_at: "2025-03-10T15:00:00Z" }),
      row({ id: "b", completed_at: "2026-11-20T15:00:00Z" }),
      row({ id: "c", completed_at: "2026-11-05T15:00:00Z" }),
      row({ id: "d", completed_at: "2026-02-14T15:00:00Z" }),
    ]);
    expect(groups.map((g) => g.year)).toEqual([2026, 2025]);
    expect(groups[0]!.months.map((m) => m.label)).toEqual(["Novembro", "Fevereiro"]);
    expect(groups[0]!.months[0]!.entries.map((e) => e.link.id)).toEqual(["b", "c"]);
    expect(groups[1]!.months.map((m) => m.label)).toEqual(["Março"]);
  });

  it("leaves items without a visit date out and returns [] when nothing remains", () => {
    expect(groupMemories([row({ completed_at: null })])).toEqual([]);
    expect(groupMemories([])).toEqual([]);
  });
});

describe("memoryTimeline", () => {
  it("is the flat list of dated done items", () => {
    expect(
      memoryTimeline([row({ id: "a" }), row({ id: "b", completed_at: null })]).map((l) => l.id)
    ).toEqual(["a"]);
  });
});
