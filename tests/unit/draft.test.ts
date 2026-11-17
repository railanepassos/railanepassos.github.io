import { describe, expect, it } from "vitest";
import {
  DRAFT_LIMITS,
  DRAFT_MAX_BYTES,
  draftPrefill,
  encodeDraft,
  isDraftFragment,
  parseDraft,
  withoutEmptyProposals,
  type Draft,
} from "../../src/links/draft";
import { isHttpsUrl } from "../../src/links/validate";
import { CATEGORY_OPTIONS, MAX_CATEGORIES } from "../../src/links/category";
import { MORE_TEXT_FIELDS } from "../../src/links/more-fields";
import { MAX_PEOPLE, MAX_PERSON_LENGTH } from "../../src/links/people";
import { MAX_PLAN_ITEMS, PLAN_TEXT_MAX } from "../../src/links/plan";
import { MAX_TAGS, MAX_TAG_LENGTH } from "../../src/links/tags";
import { MAX_SOURCES, SOURCE_TITLE_MAX, SOURCE_URL_MAX } from "../../src/links/sources";

const ID = "00000000-0000-4000-8000-0000000000a1";

const NEW_DRAFT: Draft = {
  v: 1,
  kind: "novo",
  fields: {
    url: "https://example.com/lugar-teste",
    label: "Lugar Teste",
    description: "Um lugar fictício",
    source_url: "https://example.com/post-teste",
    category: "museu",
    tags: ["arte", "grátis"],
    people: ["Pessoa Teste"],
    cost_text: "Grátis",
    city: "Cidade Teste",
    address: "Rua Fictícia, 10",
    dossier: "História <b>fictícia</b>\ncom linhas",
    itinerary: "Chegar cedo",
    image_url: "https://example.com/foto.jpg",
  },
};

const UPDATE_DRAFT: Draft = {
  v: 1,
  kind: "atualizacao",
  id: ID,
  fields: { dossier: "Novo dossiê" },
  plan: [
    { text: "Biscoitos", list: "compras" },
    { text: "Levar água", list: "checklist" },
  ],
};

const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

/** base64url of raw bytes, independent of the codec under test. */
function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function frag(json: string): string {
  return "#rascunho=" + b64url(new TextEncoder().encode(json));
}
function fragOf(value: unknown): string {
  return frag(JSON.stringify(value));
}
function reject(hash: string): string {
  const r = parseDraft(hash);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.reason;
}

describe("encodeDraft / parseDraft round-trip", () => {
  it("round-trips a new draft with every field (incl. accents and HTML-like text)", () => {
    const hash = encodeDraft(NEW_DRAFT);
    expect(hash).toMatch(/^#rascunho=[A-Za-z0-9_-]+$/);
    expect(parseDraft(hash)).toEqual({ ok: true, draft: NEW_DRAFT });
  });

  it("round-trips an update draft with plan", () => {
    expect(parseDraft(encodeDraft(UPDATE_DRAFT))).toEqual({ ok: true, draft: UPDATE_DRAFT });
  });

  it("encodes to the same bytes an independent base64url produces", () => {
    expect(encodeDraft(NEW_DRAFT)).toBe(frag(JSON.stringify(NEW_DRAFT)));
  });

  it("accepts a minimal new draft (url only)", () => {
    const d = { v: 1, kind: "novo", fields: { url: "https://example.com/x" } };
    expect(parseDraft(fragOf(d))).toEqual({ ok: true, draft: d });
  });
});

describe("isDraftFragment", () => {
  it("is true only for #rascunho=", () => {
    expect(isDraftFragment("#rascunho=abc")).toBe(true);
    expect(isDraftFragment("#plano=abc")).toBe(false);
    expect(isDraftFragment("")).toBe(false);
  });
});

describe("parseDraft rejections", () => {
  it("rejects a hash that is not a draft", () => {
    expect(reject("#plano=abc")).toBeTruthy();
    expect(reject("")).toBeTruthy();
  });
  it("rejects empty payload", () => expect(reject("#rascunho=")).toBeTruthy());
  it("rejects broken base64 (bad characters)", () => {
    expect(reject("#rascunho=@@@@")).toBeTruthy();
    expect(reject("#rascunho=abc+/=")).toBeTruthy();
  });
  it("rejects base64 with impossible length", () => expect(reject("#rascunho=a")).toBeTruthy());
  it("rejects invalid UTF-8", () => {
    expect(reject("#rascunho=" + b64url(new Uint8Array([0xff, 0xfe, 0xfd])))).toBeTruthy();
  });
  it("rejects invalid JSON", () => expect(reject(frag("{nope"))).toBeTruthy());
  it.each([
    ["array", "[]"],
    ["null", "null"],
    ["string", '"x"'],
    ["number", "1"],
  ])("rejects non-object JSON (%s)", (_n, json) => expect(reject(frag(json))).toBeTruthy());
  it.each([[2], [0], ["1"], [undefined]])("rejects wrong version %s", (v) => {
    expect(reject(fragOf({ ...NEW_DRAFT, v }))).toBeTruthy();
  });
  it("rejects unknown kind", () => {
    expect(reject(fragOf({ ...NEW_DRAFT, kind: "outro" }))).toBeTruthy();
  });
  it("rejects unknown top-level keys", () => {
    expect(reject(fragOf({ ...NEW_DRAFT, extra: 1 }))).toContain("extra");
  });
  it.each(["who", "done", "id", "plan", "note", "status"])(
    "rejects field key %s inside a new draft's fields",
    (key) => {
      const d = { ...NEW_DRAFT, fields: { ...NEW_DRAFT.fields, [key]: "x" } };
      expect(reject(fragOf(d))).toContain(key);
    }
  );
  it("rejects who/done inside plan items", () => {
    const d = { ...UPDATE_DRAFT, plan: [{ text: "a", list: "compras", who: "Ana" }] };
    expect(reject(fragOf(d))).toContain("who");
    const e = { ...UPDATE_DRAFT, plan: [{ text: "a", list: "compras", done: true }] };
    expect(reject(fragOf(e))).toContain("done");
  });
  it("rejects plan on a new draft and id on a new draft", () => {
    expect(reject(fragOf({ ...NEW_DRAFT, plan: [] }))).toContain("plan");
    expect(reject(fragOf({ ...NEW_DRAFT, id: ID }))).toContain("id");
  });
  it("requires url on a new draft", () => {
    expect(reject(fragOf({ v: 1, kind: "novo", fields: { label: "x" } }))).toContain("url");
    expect(reject(fragOf({ v: 1, kind: "novo" }))).toBeTruthy();
  });
  it("requires a uuid id on an update", () => {
    expect(reject(fragOf({ v: 1, kind: "atualizacao", fields: { city: "x" } }))).toContain("id");
    expect(reject(fragOf({ ...UPDATE_DRAFT, id: "not-a-uuid" }))).toContain("id");
  });
  it("rejects an update that changes nothing", () => {
    expect(reject(fragOf({ v: 1, kind: "atualizacao", id: ID }))).toBeTruthy();
    expect(reject(fragOf({ v: 1, kind: "atualizacao", id: ID, fields: {}, plan: [] }))).toBeTruthy();
  });
  it.each([
    ["http url", { url: "http://example.com/x" }],
    ["javascript url", { url: "javascript:alert(1)" }],
    ["data url", { url: "data:text/html,hi" }],
    ["not a url", { url: "example.com" }],
    ["bad source_url", { url: "https://example.com", source_url: "ftp://x.com" }],
    ["bad image_url", { url: "https://example.com", image_url: "http://x.com/a.png" }],
  ])("rejects %s", (_n, fields) => {
    expect(reject(fragOf({ v: 1, kind: "novo", fields }))).toBeTruthy();
  });
  it("rejects unknown category", () => {
    const fields = { ...NEW_DRAFT.fields, category: "zoologico" };
    expect(reject(fragOf({ ...NEW_DRAFT, fields }))).toContain("category");
  });
  describe("categories", () => {
    const withCats = (extra: object) =>
      fragOf({ v: 1, kind: "novo", fields: { url: "https://example.com", ...extra } });
    it("accepts 1 to 4 distinct allowed values, in order", () => {
      for (const categories of [["museu"], ["museu", "parque"], ["bar", "evento", "praia", "trilha"]]) {
        expect(parseDraft(withCats({ categories }))).toMatchObject({ ok: true });
      }
    });
    it.each([
      ["empty list", []],
      ["more than 4", ["museu", "bar", "praia", "trilha", "parque"]],
      ["duplicates", ["museu", "bar", "museu"]],
      ["unknown value", ["museu", "zoologico"]],
      ["non-string item", ["museu", 3]],
      ["not a list", "museu"],
    ])("rejects %s", (_n, categories) => {
      expect(reject(withCats({ categories }))).toContain("categories");
    });
    it("still accepts a single category", () => {
      expect(parseDraft(withCats({ category: "museu" }))).toMatchObject({ ok: true });
    });
    it("rejects category and categories together", () => {
      expect(reject(withCats({ category: "museu", categories: ["bar"] }))).toContain("categories");
    });
    it("update drafts: an empty categories list is rejected (1 to 4)", () => {
      const frag = fragOf({ v: 1, kind: "atualizacao", id: ID, fields: { categories: [], city: "X" } });
      expect(reject(frag)).toContain("1 a 4");
    });
    it("withoutEmptyProposals still drops empty lists", () => {
      expect(withoutEmptyProposals({ categories: [], city: "X" })).toEqual({ city: "X" });
    });
    it("draftPrefill maps categories to main + extras", () => {
      expect(draftPrefill({ label: "A", categories: ["bar", "praia", "museu"] })).toEqual({
        label: "A",
        category: "bar",
        extra_categories: ["praia", "museu"],
      });
      expect(draftPrefill({ category: "bar" })).toEqual({ category: "bar" });
    });
  });
  describe("sources", () => {
    const withSources = (sources: unknown) =>
      fragOf({ v: 1, kind: "novo", fields: { url: "https://example.com", sources } });
    const S = (n: number) => ({ title: `Fonte ${n}`, url: `https://example.com/f${n}` });
    it("accepts 1 to 10 well-formed sources", () => {
      for (const n of [1, 3, 10]) {
        expect(parseDraft(withSources(Array.from({ length: n }, (_, i) => S(i))))).toMatchObject({ ok: true });
      }
    });
    it.each([
      ["more than 10", Array.from({ length: 11 }, (_, i) => S(i))],
      ["not a list", "https://example.com"],
      ["item not an object", ["https://example.com"]],
      ["unknown key", [{ title: "A", url: "https://example.com", note: "x" }]],
      ["missing url", [{ title: "A" }]],
      ["blank title", [{ title: "  ", url: "https://example.com" }]],
      ["title too long", [{ title: "a".repeat(121), url: "https://example.com" }]],
      ["http url", [{ title: "A", url: "http://example.com" }]],
      ["url with space", [{ title: "A", url: "https://example.com/a b" }]],
      ["url too long", [{ title: "A", url: "https://example.com/" + "a".repeat(2000) }]],
      ["non-string title", [{ title: 3, url: "https://example.com" }]],
    ])("rejects %s", (_n, sources) => {
      expect(reject(withSources(sources))).toContain("sources");
    });
    it("accepts title at 120 chars and url at 2000", () => {
      const url = "https://example.com/" + "a".repeat(2000 - 20);
      expect(parseDraft(withSources([{ title: "a".repeat(120), url }]))).toMatchObject({ ok: true });
    });
    it("update drafts: an empty sources list is no proposal", () => {
      const frag = fragOf({ v: 1, kind: "atualizacao", id: ID, fields: { sources: [], city: "X" } });
      expect(parseDraft(frag)).toMatchObject({ ok: true });
      expect(withoutEmptyProposals({ sources: [], city: "X" })).toEqual({ city: "X" });
    });
    it("an update draft with only an empty sources list proposes nothing", () => {
      expect(reject(fragOf({ v: 1, kind: "atualizacao", id: ID, fields: { sources: [] } }))).toContain("nada");
    });
  });
  describe("duration", () => {
    const withDuration = (duration: unknown, kind: "novo" | "atualizacao" = "novo") =>
      fragOf(
        kind === "novo"
          ? { v: 1, kind, fields: { url: "https://example.com", duration } }
          : { v: 1, kind, id: ID, fields: { duration, city: "X" } }
      );

    it.each(["rapido", "meio-periodo", "dia-inteiro"])("accepts %s", (duration) => {
      expect(parseDraft(withDuration(duration)).ok).toBe(true);
      expect(parseDraft(withDuration(duration, "atualizacao")).ok).toBe(true);
    });
    it("accepts an empty string (no proposal on an update)", () => {
      expect(parseDraft(withDuration("")).ok).toBe(true);
      expect(withoutEmptyProposals({ duration: "", city: "X" })).toEqual({ city: "X" });
    });
    it.each([["unknown value", "longo"], ["label instead of value", "Rápido (até 2h)"], ["non-string", 2], ["null", null]])(
      "rejects %s",
      (_n, duration) => {
        expect(reject(withDuration(duration))).toContain("duration");
      }
    );
    it("an update draft with only an empty duration proposes nothing", () => {
      const only = fragOf({ v: 1, kind: "atualizacao", id: ID, fields: { duration: "" } });
      expect(reject(only)).toContain("nada");
    });
  });
  it("rejects non-string field values and non-string tags", () => {
    const f = (extra: object) => fragOf({ v: 1, kind: "novo", fields: { url: "https://example.com", ...extra } });
    expect(reject(f({ city: 5 }))).toContain("city");
    expect(reject(f({ tags: "a" }))).toContain("tags");
    expect(reject(f({ tags: [1] }))).toContain("tags");
  });
  it("rejects bad plan items", () => {
    const bad = (plan: unknown) => reject(fragOf({ ...UPDATE_DRAFT, plan }));
    expect(bad("x")).toContain("plan");
    expect(bad([{ text: "", list: "compras" }])).toContain("plan");
    expect(bad([{ text: "   ", list: "compras" }])).toContain("plan");
    expect(bad([{ text: "a", list: "outra" }])).toContain("plan");
    expect(bad([{ text: 1, list: "compras" }])).toContain("plan");
    expect(bad(["a"])).toContain("plan");
  });
});

describe("parseDraft limits (boundary accepted, +1 rejected)", () => {
  const withField = (key: string, value: string) => ({
    v: 1,
    kind: "novo",
    fields: { url: "https://example.com", [key]: value },
  });

  const textMaxima: Array<[string, number]> = [
    ...MORE_TEXT_FIELDS.map((f): [string, number] => [f.key, f.max]),
    ["label", 200],
    ["description", 2000],
  ];
  it.each(textMaxima)("%s max %i", (key, max) => {
    expect(parseDraft(fragOf(withField(key, "a".repeat(max)))).ok).toBe(true);
    expect(reject(fragOf(withField(key, "a".repeat(max + 1))))).toContain(key);
  });

  it("tags: count and length", () => {
    const f = (tags: string[]) => ({ v: 1, kind: "novo", fields: { url: "https://example.com", tags } });
    const many = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    expect(parseDraft(fragOf(f(many(MAX_TAGS)))).ok).toBe(true);
    expect(reject(fragOf(f(many(MAX_TAGS + 1))))).toContain("tags");
    expect(parseDraft(fragOf(f(["a".repeat(MAX_TAG_LENGTH)]))).ok).toBe(true);
    expect(reject(fragOf(f(["a".repeat(MAX_TAG_LENGTH + 1)])))).toContain("tags");
  });

  it("people: count and length", () => {
    const f = (people: string[]) => ({ v: 1, kind: "novo", fields: { url: "https://example.com", people } });
    const many = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
    expect(parseDraft(fragOf(f(many(MAX_PEOPLE)))).ok).toBe(true);
    expect(reject(fragOf(f(many(MAX_PEOPLE + 1))))).toContain("people");
    expect(reject(fragOf(f(["a".repeat(MAX_PERSON_LENGTH + 1)])))).toContain("people");
  });

  it("plan: item count and text length", () => {
    const plan = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `i${i}`, list: "compras" }));
    expect(parseDraft(fragOf({ ...UPDATE_DRAFT, plan: plan(MAX_PLAN_ITEMS) })).ok).toBe(true);
    expect(reject(fragOf({ ...UPDATE_DRAFT, plan: plan(MAX_PLAN_ITEMS + 1) }))).toContain("plan");
    const one = (n: number) => [{ text: "a".repeat(n), list: "compras" }];
    expect(parseDraft(fragOf({ ...UPDATE_DRAFT, plan: one(PLAN_TEXT_MAX) })).ok).toBe(true);
    expect(reject(fragOf({ ...UPDATE_DRAFT, plan: one(PLAN_TEXT_MAX + 1) }))).toContain("plan");
  });

  it("rejects a payload over 16 KB decoded even if every field is within its own limit", () => {
    expect(DRAFT_MAX_BYTES).toBe(16 * 1024);
    const fields = (ch: string) => ({
      url: "https://example.com",
      dossier: ch.repeat(5000),
      itinerary: ch.repeat(5000),
      description: ch.repeat(2000),
      label: ch.repeat(200),
      address: ch.repeat(300),
      city: ch.repeat(120),
      cost_text: ch.repeat(200),
    });
    const ascii = { v: 1, kind: "novo", fields: fields("a") };
    expect(utf8Length(JSON.stringify(ascii))).toBeLessThan(DRAFT_MAX_BYTES);
    expect(parseDraft(fragOf(ascii)).ok).toBe(true);
    const heavy = { v: 1, kind: "novo", fields: fields("é") };
    expect(utf8Length(JSON.stringify(heavy))).toBeGreaterThan(DRAFT_MAX_BYTES);
    expect(reject(fragOf(heavy))).toMatch(/16 KB/);
  });

  it("rejects a gigantic fragment", () => {
    expect(reject("#rascunho=" + "A".repeat(200_000))).toMatch(/16 KB/);
  });
});

describe("DRAFT_LIMITS stays in sync with the app (the codec is import-free)", () => {
  it("matches the app constants", () => {
    expect(DRAFT_LIMITS.categories).toEqual([...CATEGORY_OPTIONS]);
    expect(DRAFT_LIMITS.maxCategories).toBe(MAX_CATEGORIES);
    for (const f of MORE_TEXT_FIELDS) {
      expect(DRAFT_LIMITS.text[f.key]).toBe(f.max);
    }
    expect(DRAFT_LIMITS.text.label).toBe(200);
    expect(DRAFT_LIMITS.text.description).toBe(2000);
    expect(DRAFT_LIMITS.maxTags).toBe(MAX_TAGS);
    expect(DRAFT_LIMITS.maxTagLength).toBe(MAX_TAG_LENGTH);
    expect(DRAFT_LIMITS.maxPeople).toBe(MAX_PEOPLE);
    expect(DRAFT_LIMITS.maxPersonLength).toBe(MAX_PERSON_LENGTH);
    expect(DRAFT_LIMITS.maxPlanItems).toBe(MAX_PLAN_ITEMS);
    expect(DRAFT_LIMITS.planTextMax).toBe(PLAN_TEXT_MAX);
    expect(DRAFT_LIMITS.maxSources).toBe(MAX_SOURCES);
    expect(DRAFT_LIMITS.sourceTitleMax).toBe(SOURCE_TITLE_MAX);
    expect(DRAFT_LIMITS.sourceUrlMax).toBe(SOURCE_URL_MAX);
  });
});

describe("the codec's https rule agrees with isHttpsUrl (the codec is import-free)", () => {
  const CASES = [
    "https://example.com",
    "https://example.com/a?b=1#c",
    "HTTPS://EXAMPLE.COM",
    "http://example.com",
    "//example.com",
    "example.com",
    "ftp://example.com",
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "https:",
    "https://",
    "https:example.com",
    " https://example.com",
    "",
    "not a url",
  ];
  for (const value of CASES) {
    it(`url ${JSON.stringify(value)}`, () => {
      const accepted = parseDraft(fragOf({ v: 1, kind: "novo", fields: { url: value } })).ok;
      expect(accepted).toBe(isHttpsUrl(value));
    });
  }
});

describe("update draft: empty proposed values are no proposal", () => {
  it("withoutEmptyProposals drops empty strings and empty lists, keeps the rest", () => {
    expect(withoutEmptyProposals({ category: "", city: "Cidade", tags: [], people: ["A"], dossier: "" })).toEqual({
      city: "Cidade",
      people: ["A"],
    });
    expect(withoutEmptyProposals({})).toEqual({});
  });

  it("an update draft whose fields are all empty (and no plan) proposes nothing", () => {
    expect(reject(fragOf({ v: 1, kind: "atualizacao", id: ID, fields: { category: "", city: "" } }))).toMatch(/não propõe nada/);
    expect(parseDraft(fragOf({ v: 1, kind: "atualizacao", id: ID, fields: { category: "", city: "" }, plan: [{ text: "x", list: "compras" }] })).ok).toBe(true);
  });
});
