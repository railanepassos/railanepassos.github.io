// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_SOURCES,
  SOURCE_TITLE_MAX,
  SOURCE_URL_MAX,
  draftsToSources,
  mergeSources,
  readSources,
  sourcesError,
} from "../../src/links/sources";

const s = (n: number) => ({ title: `Fonte ${n}`, url: `https://example.com/${n}` });

describe("limits stay in sync with migration 019", () => {
  const sql: string = readFileSync(
    fileURLToPath(new URL("../../supabase/migrations/019_links_sources.sql", import.meta.url)),
    "utf8"
  );
  it("max items", () => {
    expect(sql).toContain(`jsonb_array_length(items) <= ${MAX_SOURCES}`);
  });
  it("title bounds", () => {
    expect(sql).toContain(`not between 1 and ${SOURCE_TITLE_MAX}`);
  });
  it("url bound", () => {
    expect(sql).toContain(`char_length(item ->> 'url') > ${SOURCE_URL_MAX}`);
  });
});

describe("readSources", () => {
  it("keeps valid entries and drops the rest", () => {
    expect(
      readSources([
        s(1),
        { title: "x", url: "http://example.com" },
        { title: "", url: "https://example.com/a" },
        { title: "ok", url: "https://example.com/b", extra: 1 },
        "nope",
        null,
      ])
    ).toEqual([s(1)]);
  });
  it("is empty for non-arrays", () => {
    expect(readSources(null)).toEqual([]);
    expect(readSources({})).toEqual([]);
  });
  it("caps at the limit", () => {
    expect(readSources(Array.from({ length: 12 }, (_, i) => s(i)))).toHaveLength(MAX_SOURCES);
  });
});

describe("draftsToSources", () => {
  it("drops blank rows and trims; nothing left -> empty list", () => {
    expect(draftsToSources([{ title: " ", url: "" }])).toEqual([]);
    expect(draftsToSources([{ title: " Guia ", url: "example.com/a" }, { title: "", url: "" }])).toEqual([
      { title: "Guia", url: "https://example.com/a" },
    ]);
  });
});

describe("sourcesError", () => {
  it("accepts blank rows and valid rows", () => {
    expect(sourcesError([{ title: "", url: "" }, { title: "A", url: "example.com" }])).toBeNull();
  });
  it("needs both title and url on a filled row", () => {
    expect(sourcesError([{ title: "A", url: "" }])).toContain("Fonte 1");
    expect(sourcesError([{ title: "", url: "https://example.com" }])).toContain("Fonte 1");
  });
  it("rejects invalid urls, long fields and too many rows", () => {
    expect(sourcesError([{ title: "A", url: "http://example.com" }]) ).toBeNull(); // normalized to https
    expect(sourcesError([{ title: "A", url: "not a url" }])).toContain("Fonte 1");
    expect(sourcesError([{ title: "t".repeat(SOURCE_TITLE_MAX + 1), url: "https://example.com" }])).toContain("Fonte 1");
    expect(
      sourcesError([{ title: "A", url: "https://example.com/" + "a".repeat(SOURCE_URL_MAX) }])
    ).toContain("Fonte 1");
    expect(sourcesError(Array.from({ length: MAX_SOURCES + 1 }, (_, i) => ({ title: "A", url: `https://example.com/${i}` })))).toContain(String(MAX_SOURCES));
  });
});

describe("mergeSources", () => {
  it("appends proposed after current, deduping by url", () => {
    expect(mergeSources([s(1), s(2)], [{ title: "Outro", url: "https://example.com/2" }, s(3)])).toEqual([
      s(1),
      s(2),
      s(3),
    ]);
  });
  it("dedupes ignoring case of the host and a trailing slash", () => {
    expect(mergeSources([s(1)], [{ title: "x", url: "https://EXAMPLE.com/1/" }])).toEqual([s(1)]);
  });
  it("dedupes inside the proposed list and caps at the limit", () => {
    const current = Array.from({ length: 8 }, (_, i) => s(i));
    const merged = mergeSources(current, [s(8), s(8), s(9), s(10)]);
    expect(merged).toHaveLength(MAX_SOURCES);
    expect(merged.at(-1)).toEqual(s(9));
  });
});
