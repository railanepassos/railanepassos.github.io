import { describe, expect, it } from "vitest";
import type { LinkRow } from "../../src/links/links-repo";
import { sortLinksForDisplay, visibleListLinks } from "../../src/links/sort-links";

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

describe("sortLinksForDisplay", () => {
  it("puts scheduled links before unscheduled", () => {
    const olderScheduled = row({
      id: "s",
      label: "Agendado",
      scheduled_start: "2026-08-01T09:00:00-03:00",
      scheduled_end: "2026-08-01T17:00:00-03:00",
      created_at: "2026-01-01T00:00:00Z",
      sort_order: 9,
    });
    const newerUnscheduled = row({
      id: "u",
      label: "Novo",
      created_at: "2026-07-01T00:00:00Z",
      sort_order: 0,
    });

    expect(sortLinksForDisplay([newerUnscheduled, olderScheduled]).map((l) => l.id)).toEqual([
      "s",
      "u",
    ]);
  });

  it("within the same schedule group, sorts most recent created_at first", () => {
    const a = row({
      id: "old",
      created_at: "2026-01-01T00:00:00Z",
      sort_order: 0,
    });
    const b = row({
      id: "new",
      created_at: "2026-06-01T00:00:00Z",
      sort_order: 1,
    });
    const c = row({
      id: "mid",
      created_at: "2026-03-01T00:00:00Z",
      sort_order: 2,
    });

    expect(sortLinksForDisplay([a, b, c]).map((l) => l.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("among scheduled, still prefers newer created_at", () => {
    const early = row({
      id: "early",
      scheduled_start: "2026-09-01T09:00:00-03:00",
      scheduled_end: "2026-09-01T17:00:00-03:00",
      created_at: "2026-02-01T00:00:00Z",
    });
    const late = row({
      id: "late",
      scheduled_start: "2026-08-01T09:00:00-03:00",
      scheduled_end: "2026-08-01T17:00:00-03:00",
      created_at: "2026-05-01T00:00:00Z",
    });

    expect(sortLinksForDisplay([early, late]).map((l) => l.id)).toEqual([
      "late",
      "early",
    ]);
  });
});

describe("visibleListLinks", () => {
  it("omits done items", () => {
    const open = row({ id: "open", status: "wishlist" });
    const done = row({ id: "done", status: "done" });
    expect(visibleListLinks([open, done]).map((l) => l.id)).toEqual(["open"]);
  });
});
