import { describe, expect, it } from "vitest";
import { anniversaries, groupMemories, memoryEntries, memoryTimeline } from "../../src/links/memories";
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

describe("anniversaries", () => {
  const at = (iso: string) => new Date(iso);
  const names = (links: LinkRow[], now: Date) =>
    anniversaries(links, now).map((a) => `${a.link.id}:${a.yearsAgo}`);

  it("keeps earlier-year visits within 7 days either side of today", () => {
    const now = at("2026-11-17T12:00:00");
    const links = [
      row({ id: "same-day", completed_at: "2025-11-17T15:00:00" }),
      row({ id: "minus7", completed_at: "2024-11-10T15:00:00" }),
      row({ id: "plus7", completed_at: "2023-11-24T15:00:00" }),
      row({ id: "minus8", completed_at: "2025-11-09T15:00:00" }),
      row({ id: "plus8", completed_at: "2025-11-25T15:00:00" }),
    ];
    expect(names(links, now)).toEqual(["same-day:1", "minus7:2", "plus7:3"]);
  });

  it("ignores this year's visits, non-memories and wishlist items", () => {
    const now = at("2026-11-17T12:00:00");
    const links = [
      row({ id: "now", completed_at: "2026-11-15T15:00:00" }),
      row({ id: "wish", status: "wishlist", completed_at: "2025-11-17T15:00:00" }),
      row({ id: "nodate", completed_at: null }),
    ];
    expect(anniversaries(links, now)).toEqual([]);
  });

  it("crosses the year boundary in both directions", () => {
    const early = at("2027-01-03T12:00:00");
    expect(names([row({ id: "dec", completed_at: "2025-12-30T15:00:00" })], early)).toEqual([
      "dec:1",
    ]);
    const late = at("2026-12-30T12:00:00");
    expect(names([row({ id: "jan", completed_at: "2025-01-02T15:00:00" })], late)).toEqual([
      "jan:2",
    ]);
    expect(names([row({ id: "recent", completed_at: "2026-12-29T15:00:00" })], early)).toEqual([]);
  });

  it("handles Feb 29 visits in non-leap and leap years", () => {
    const links = [row({ id: "leap", completed_at: "2024-02-29T15:00:00" })];
    expect(names(links, at("2026-03-03T12:00:00"))).toEqual(["leap:2"]);
    expect(names(links, at("2026-02-25T12:00:00"))).toEqual(["leap:2"]);
    expect(names(links, at("2028-03-05T12:00:00"))).toEqual(["leap:4"]);
    expect(names(links, at("2028-03-08T12:00:00"))).toEqual([]);
  });

  it("orders by closeness to today, then most recent visit", () => {
    const now = at("2026-11-17T12:00:00");
    const links = [
      row({ id: "far", completed_at: "2025-11-22T15:00:00" }),
      row({ id: "old", completed_at: "2022-11-17T15:00:00" }),
      row({ id: "new", completed_at: "2025-11-17T15:00:00" }),
    ];
    expect(names(links, now)).toEqual(["new:1", "old:4", "far:1"]);
  });
});
