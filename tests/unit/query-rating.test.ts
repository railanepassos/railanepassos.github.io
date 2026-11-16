import { describe, expect, it } from "vitest";
import { matches, parseQuery, removeChip, setMinRating } from "../../src/links/query";
import type { LinkRow } from "../../src/links/links-repo";

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "id-1",
    url: "https://example.com",
    label: "Exemplo",
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
    completed_at: null,
    ...partial,
  } as LinkRow;
}

describe("nota>=N token", () => {
  it("parses nota>=N into a minRating and a removable chip", () => {
    const q = parseQuery("nota>=4");
    expect(q.minRating).toBe(4);
    expect(q.chips).toEqual([{ kind: "rating", label: "nota ≥ 4", key: "4", start: 0, end: 7 }]);
    const typed = "praia nota>=4";
    expect(removeChip(typed, parseQuery(typed).chips[0]!)).toBe("praia");
  });

  it("matches only rated places at or above N; unrated never match", () => {
    const q = parseQuery("nota>=4");
    expect(matches(row({ rating: 5 }), q)).toBe(true);
    expect(matches(row({ rating: 4 }), q)).toBe(true);
    expect(matches(row({ rating: 3 }), q)).toBe(false);
    expect(matches(row({ rating: null }), q)).toBe(false);
  });

  it("ignores invalid or incomplete N (no filter, no chip, no term)", () => {
    for (const text of ["nota>=", "nota>=0", "nota>=6", "nota>=x", "nota>=2.5", "nota>=10"]) {
      const q = parseQuery(text);
      expect(q.minRating, text).toBeUndefined();
      expect(q.chips, text).toEqual([]);
      expect(q.terms, text).toEqual([]);
    }
  });

  it("combines with #tag, @pessoa, cidade: and custo<", () => {
    const place = row({
      rating: 5,
      tags: ["praia"],
      people: ["Bia"],
      city: "Salvador",
      cost_text: "R$ 40",
    });
    expect(matches(place, parseQuery("#praia @bia cidade:salvador custo<50 nota>=4"))).toBe(true);
    expect(matches(place, parseQuery("#praia nota>=5 custo<10"))).toBe(false);
    expect(matches({ ...place, rating: 3 }, parseQuery("#praia nota>=4"))).toBe(false);
  });

  it("is case-insensitive and the strictest of several wins", () => {
    expect(parseQuery("NOTA>=2 nota>=4").minRating).toBe(4);
  });
});

describe("setMinRating", () => {
  it("adds, replaces and clears the token", () => {
    expect(setMinRating("praia", 4)).toBe("praia nota>=4");
    expect(setMinRating("praia nota>=2 #x", 5)).toBe("praia #x nota>=5");
    expect(setMinRating("praia nota>=2", null)).toBe("praia");
    expect(setMinRating("", 3)).toBe("nota>=3");
  });
});
