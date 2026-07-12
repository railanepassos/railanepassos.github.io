import { describe, expect, it } from "vitest";
import type { LinkRow } from "../../src/links/links-repo";
import { linksForDeck, nextPriority, skipFront } from "../../src/links/deck-queue";

function row(partial: Partial<LinkRow>): LinkRow {
  return {
    id: "x",
    url: "https://example.com",
    label: "X",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: null,
    sort_order: 0,
    scheduled_start: null,
    scheduled_end: null,
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    created_at: null,
    ...partial,
  };
}

describe("linksForDeck", () => {
  it("filters by tab and sorts wishlist by priority desc", () => {
    const links = [
      row({ id: "low", priority: 1, created_at: "2026-06-01T00:00:00Z" }),
      row({ id: "high", priority: 5, created_at: "2026-01-01T00:00:00Z" }),
      row({ id: "done", status: "done", priority: 9 }),
    ];
    expect(linksForDeck(links, "wishlist").map((l) => l.id)).toEqual(["high", "low"]);
    expect(linksForDeck(links, "done").map((l) => l.id)).toEqual(["done"]);
  });

  it("puts want_again first on done tab", () => {
    const links = [
      row({ id: "a", status: "done", want_again: false, created_at: "2026-06-01T00:00:00Z" }),
      row({ id: "b", status: "done", want_again: true, created_at: "2026-01-01T00:00:00Z" }),
    ];
    expect(linksForDeck(links, "done").map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("skipFront", () => {
  it("rotates head to end", () => {
    const q = [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })];
    expect(skipFront(q).map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("leaves single-item queue unchanged", () => {
    expect(skipFront([row({ id: "a" })]).map((l) => l.id)).toEqual(["a"]);
  });
});

describe("nextPriority", () => {
  it("returns max + 1", () => {
    expect(nextPriority([])).toBe(1);
    expect(nextPriority([row({ priority: 2 }), row({ priority: 7 })])).toBe(8);
  });
});
