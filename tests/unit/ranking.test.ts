import { describe, expect, it } from "vitest";
import { filterDone, meetsMinRating, rankDone } from "../../src/links/ranking";
import type { LinkRow } from "../../src/links/links-repo";

function done(id: string, rating: number | null, completed: string | null, want = false): LinkRow {
  return {
    id,
    url: `https://example.com/${id}`,
    label: id,
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
    sort_order: 0,
    scheduled_start: null,
    scheduled_end: null,
    status: "done",
    priority: 0,
    want_again: want,
    image_url: null,
    note: null,
    completed_at: completed,
    rating,
  } as LinkRow;
}

const ids = (rows: LinkRow[]): string[] => rows.map((r) => r.id);

describe("rankDone", () => {
  it("sorts by rating desc, unrated last", () => {
    const rows = [done("a", null, "2026-01-05T00:00:00Z"), done("b", 3, null), done("c", 5, null)];
    expect(ids(rankDone(rows))).toEqual(["c", "b", "a"]);
  });

  it("breaks ties by most recent completed_at; missing date goes after dated", () => {
    const rows = [
      done("old", 4, "2026-01-01T00:00:00Z"),
      done("none", 4, null),
      done("new", 4, "2026-03-01T00:00:00Z"),
      done("u-old", null, "2026-01-01T00:00:00Z"),
      done("u-new", null, "2026-02-01T00:00:00Z"),
    ];
    expect(ids(rankDone(rows))).toEqual(["new", "old", "none", "u-new", "u-old"]);
  });

  it("does not mutate the input and treats invalid ratings as unrated", () => {
    const rows = [done("x", 9, null), done("y", 1, null)];
    const copy = [...rows];
    expect(ids(rankDone(rows))).toEqual(["y", "x"]);
    expect(rows).toEqual(copy);
  });
});

describe("filters", () => {
  const rows = [done("a", 5, null, true), done("b", 3, null, false), done("c", null, null, true)];

  it("meetsMinRating: unrated never meets a minimum", () => {
    expect(meetsMinRating(done("a", 4, null), 4)).toBe(true);
    expect(meetsMinRating(done("a", 3, null), 4)).toBe(false);
    expect(meetsMinRating(done("a", null, null), 1)).toBe(false);
  });

  it("filters by voltaria", () => {
    expect(ids(filterDone(rows, { wantAgain: true }))).toEqual(["a", "c"]);
    expect(ids(filterDone(rows, {}))).toEqual(["a", "b", "c"]);
  });
});
