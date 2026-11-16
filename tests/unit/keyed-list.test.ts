import { describe, expect, it } from "vitest";
import { collectBy, dedupeBy, fold, suggestBy } from "../../src/links/keyed-list";

const lower = (s: string): string => s.trim().toLowerCase();
const key = (s: string): string => fold(lower(s));

describe("fold", () => {
  it("drops accents and case", () => {
    expect(fold("GRÁTIS Ção")).toBe("gratis cao");
  });
});

describe("dedupeBy", () => {
  it("normalizes, drops blanks and duplicates by key; first display wins", () => {
    expect(dedupeBy(["Grátis", "gratis", "", "  ", "Museu"], lower, key)).toEqual(["grátis", "museu"]);
  });
});

describe("collectBy", () => {
  it("lists values most used first; ties keep first-seen order", () => {
    const lists = [["a", "b"], null, ["B", "c"], undefined, ["b"]];
    expect(collectBy(lists, (l) => dedupeBy(l, lower, key), key)).toEqual(["b", "a", "c"]);
  });
});

describe("suggestBy", () => {
  const all = ["praia", "grátis", "museu"];
  it("matches by accent-insensitive substring and skips chosen values", () => {
    expect(suggestBy(all, "gra", [], key)).toEqual(["grátis"]);
    expect(suggestBy(all, "", ["praia"], key)).toEqual(["grátis", "museu"]);
    expect(suggestBy(all, "zzz", [], key)).toEqual([]);
  });
  it("respects the limit", () => {
    expect(suggestBy(["a1", "a2", "a3"], "a", [], key, 2)).toEqual(["a1", "a2"]);
  });
});
