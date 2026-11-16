import { describe, expect, it } from "vitest";
import {
  costNumber,
  matches,
  parseQuery,
  removeChip,
  toggleFilter,
} from "../../src/links/query";
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
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    ...partial,
  };
}

describe("parseQuery", () => {
  it("returns an empty query for blank text", () => {
    const q = parseQuery("   ");
    expect(q.terms).toEqual([]);
    expect(q.tags).toEqual([]);
    expect(q.people).toEqual([]);
    expect(q.city).toBeUndefined();
    expect(q.costMax).toBeUndefined();
    expect(q.chips).toEqual([]);
  });

  it("parses the full one-line syntax", () => {
    const q = parseQuery("#Museu @alana pelourinho cidade:Salvador custo<50");
    expect(q.tags).toEqual(["museu"]);
    expect(q.people).toEqual(["alana"]);
    expect(q.terms).toEqual(["pelourinho"]);
    expect(q.city).toBe("salvador");
    expect(q.costMax).toBe(50);
  });

  it("folds accents and case in tags, people, terms and city", () => {
    const q = parseQuery("#GRÁTIS @Álvaro Recôncavo cidade:SÃO");
    expect(q.tags).toEqual(["gratis"]);
    expect(q.people).toEqual(["alvaro"]);
    expect(q.terms).toEqual(["reconcavo"]);
    expect(q.city).toBe("sao");
  });

  it("reads quoted @ values as multi-word people", () => {
    const q = parseQuery('@"Maria Clara" @bia');
    expect(q.people).toEqual(["maria clara", "bia"]);
  });

  it("keeps what was typed so far when a quote is still open", () => {
    expect(parseQuery('@"maria cl').people).toEqual(["maria cl"]);
  });

  it("supports quoted city and quoted free phrases", () => {
    const q = parseQuery('cidade:"Porto Seguro" "casa grande"');
    expect(q.city).toBe("porto seguro");
    expect(q.terms).toEqual(["casa grande"]);
  });

  it("accepts the cidade: and custo< keywords case-insensitively", () => {
    const q = parseQuery("CIDADE:Lauro Custo<10,5");
    expect(q.city).toBe("lauro");
    expect(q.costMax).toBe(10.5);
    expect(q.terms).toEqual([]);
  });

  it("ignores incomplete tokens while typing", () => {
    const q = parseQuery("# @ cidade: custo<");
    expect(q.tags).toEqual([]);
    expect(q.people).toEqual([]);
    expect(q.terms).toEqual([]);
    expect(q.city).toBeUndefined();
    expect(q.costMax).toBeUndefined();
  });

  it("falls back to free text when custo< has no number", () => {
    expect(parseQuery("custo<abc").terms).toEqual(["custo<abc"]);
  });

  it("dedupes repeated tags and keeps the lowest cost", () => {
    const q = parseQuery("#a #A custo<50 custo<20");
    expect(q.tags).toEqual(["a"]);
    expect(q.costMax).toBe(20);
  });

  it("describes each filter as a chip with its span", () => {
    const text = '#praia @"Bia Ficticia" cidade:Salvador custo<50 livre';
    const q = parseQuery(text);
    expect(q.chips.map((c) => [c.kind, c.label])).toEqual([
      ["tag", "#praia"],
      ["person", "@Bia Ficticia"],
      ["city", "cidade: Salvador"],
      ["cost", "custo < 50"],
    ]);
    expect(text.slice(q.chips[1].start, q.chips[1].end)).toBe('@"Bia Ficticia"');
  });
});

describe("costNumber", () => {
  it("reads the first number of free text", () => {
    expect(costNumber("R$ 40 por pessoa")).toBe(40);
    expect(costNumber("de 30 a 60 reais")).toBe(30);
  });
  it("understands pt-BR decimals and thousands", () => {
    expect(costNumber("R$ 25,50")).toBe(25.5);
    expect(costNumber("R$ 1.200")).toBe(1200);
    expect(costNumber("R$ 1.200,50")).toBe(1200.5);
  });
  it("returns null when there is no number", () => {
    expect(costNumber("grátis")).toBeNull();
    expect(costNumber(null)).toBeNull();
    expect(costNumber("")).toBeNull();
  });
});

describe("matches", () => {
  const link = row({
    label: "Casa do Recôncavo",
    description: "Ir na quarta",
    note: "Café no jardim",
    category: "museu",
    city: "Salvador",
    address: "Rua Fictícia 10",
    cost_text: "R$ 40",
    tags: ["praia", "Grátis"],
    people: ["Maria Clara Teste", "Bia Ficticia"],
  });
  const m = (text: string, l: LinkRow = link): boolean => matches(l, parseQuery(text));

  it("matches everything for a blank query", () => {
    expect(m("  ")).toBe(true);
  });

  it("is case- and accent-insensitive on free text (reconcavo finds Recôncavo)", () => {
    expect(m("reconcavo")).toBe(true);
    expect(m("RECÔNCAVO")).toBe(true);
  });

  it("searches title, description, note, category, city, address, tags, people", () => {
    for (const t of ["casa", "quarta", "cafe", "museu", "salvador", "ficticia", "praia", "clara"]) {
      expect(m(t)).toBe(true);
    }
    expect(m("praia-inexistente")).toBe(false);
  });

  it("matches the category label", () => {
    expect(m("turístico", row({ category: "ponto-turistico" }))).toBe(true);
  });

  it("requires every term (AND) and phrases are contiguous", () => {
    expect(m("casa quarta")).toBe(true);
    expect(m("casa praiaX")).toBe(false);
    expect(m('"ir na"')).toBe(true);
    expect(m('"na ir"')).toBe(false);
  });

  it("filters by #tag with accents and case", () => {
    expect(m("#gratis")).toBe(true);
    expect(m("#GRÁTIS #praia")).toBe(true);
    expect(m("#museu")).toBe(false);
  });

  it("filters by @person: always the exact name, never a prefix", () => {
    expect(m("@maria")).toBe(false);
    expect(m("@clara")).toBe(false);
    expect(m('@"maria clara"')).toBe(false);
    expect(m('@"Maria Clara Teste"')).toBe(true);
    expect(m('@"MARIA clará teste"')).toBe(true);
    expect(m("@bia")).toBe(false);
    expect(m("@ficticia")).toBe(false);
    expect(m("@BIA", row({ people: ["Bia"] }))).toBe(true);
    expect(m('@"Maria Clara Teste" @"Bia Ficticia"')).toBe(true);
    expect(m('@"Maria Clara Teste" @zeca')).toBe(false);
  });

  it("searches dossier, itinerary and cost text as free text", () => {
    const l = row({ dossier: "Construído no século XVIII", itinerary: "Começar pela capela", cost_text: "Grátis às quartas" });
    expect(m("seculo", l)).toBe(true);
    expect(m("capela", l)).toBe(true);
    expect(m("quartas", l)).toBe(true);
    expect(m("naoexiste", l)).toBe(false);
  });

  it("filters by cidade: as an accent-insensitive substring", () => {
    expect(m("cidade:salvador")).toBe(true);
    expect(m("cidade:salv")).toBe(true);
    expect(m("cidade:recife")).toBe(false);
    expect(m("cidade:x", row())).toBe(false);
  });

  it("filters by custo< on the first number, strictly below", () => {
    expect(m("custo<50")).toBe(true);
    expect(m("custo<40")).toBe(false);
    expect(m("custo<30")).toBe(false);
  });

  it("does not match a cost filter when the cost has no number", () => {
    expect(m("custo<50", row({ cost_text: "grátis" }))).toBe(false);
    expect(m("custo<50", row({ cost_text: null }))).toBe(false);
  });

  it("combines everything with AND", () => {
    expect(m('#praia @"maria clara teste" reconcavo cidade:salvador custo<50')).toBe(true);
    expect(m('#praia @"maria clara teste" reconcavo cidade:salvador custo<10')).toBe(false);
    expect(m('#praia @"maria clara teste" reconcavo cidade:recife custo<50')).toBe(false);
  });

});

describe("toggleFilter / removeChip (chip tap == typing)", () => {
  it("appends a tag token and removes it on second tap", () => {
    const on = toggleFilter("museu", "tag", "Praia");
    expect(on).toBe("museu #praia");
    expect(parseQuery(on).tags).toEqual(["praia"]);
    expect(toggleFilter(on, "tag", "praia")).toBe("museu");
  });

  it("emits @word for single-word names and quotes only names with spaces", () => {
    const one = toggleFilter("", "person", "Alana");
    expect(one).toBe("@Alana");
    expect(toggleFilter(one, "person", "alana")).toBe("");
    const two = toggleFilter("", "person", "Maria Clara Teste");
    expect(two).toBe('@"Maria Clara Teste"');
    expect(parseQuery(two).people).toEqual(["maria clara teste"]);
    expect(toggleFilter(two, "person", "maria clara teste")).toBe("");
  });

  it("tapping gives the same result as typing the same filter", () => {
    const links = [
      row({ id: "a", people: ["Alana"], tags: ["praia"] }),
      row({ id: "b", people: ["Alana Souza"], tags: ["praia"] }),
    ];
    const ids = (t: string): string[] =>
      links.filter((l) => matches(l, parseQuery(t))).map((l) => l.id);
    const tapped = toggleFilter(toggleFilter("", "tag", "praia"), "person", "Alana");
    expect(ids(tapped)).toEqual(["a"]);
    expect(ids(tapped)).toEqual(ids("#praia @alana"));
    const tappedFull = toggleFilter("", "person", "Alana Souza");
    expect(ids(tappedFull)).toEqual(["b"]);
    expect(ids(tappedFull)).toEqual(ids('@"alana souza"'));
  });

  it("removeChip cuts only that token and tidies spaces", () => {
    const text = "foo #a cidade:Salvador bar";
    const chip = parseQuery(text).chips.find((c) => c.kind === "city");
    expect(chip).toBeDefined();
    expect(removeChip(text, chip!)).toBe("foo #a bar");
  });
});
