import { describe, expect, it } from "vitest";
import {
  addTag,
  collectTags,
  dedupeTags,
  hasAllTags,
  normalizeTag,
  suggestTags,
  tagKey,
  MAX_TAGS,
  MAX_TAG_LENGTH,
} from "../../src/links/tags";

describe("normalizeTag", () => {
  it("strips #, trims and lowercases", () => {
    expect(normalizeTag("  #Praia ")).toBe("praia");
    expect(normalizeTag("##Grátis")).toBe("grátis");
  });
  it("turns inner whitespace into hyphens so the tag stays one token", () => {
    expect(normalizeTag("#vista  do mar")).toBe("vista-do-mar");
  });
  it("returns empty for blank or only #", () => {
    expect(normalizeTag("  # ")).toBe("");
    expect(normalizeTag("")).toBe("");
  });
  it("truncates to the max length", () => {
    expect(normalizeTag("a".repeat(MAX_TAG_LENGTH + 10))).toHaveLength(MAX_TAG_LENGTH);
  });
});

describe("tagKey", () => {
  it("ignores accents and case", () => {
    expect(tagKey("#Grátis")).toBe("gratis");
    expect(tagKey("gratis")).toBe(tagKey("GRÁTIS"));
  });
});

describe("dedupeTags / addTag", () => {
  it("treats case and accent variants as the same tag and keeps the first display form", () => {
    expect(dedupeTags(["#Praia", "praia", "grátis", "gratis", "#PRAIA"])).toEqual(["praia", "grátis"]);
  });
  it("drops empty entries", () => {
    expect(dedupeTags(["", "#", "ok"])).toEqual(["ok"]);
  });
  it("addTag appends a new tag", () => {
    expect(addTag(["praia"], "#Museu")).toEqual(["praia", "museu"]);
  });
  it("addTag ignores duplicates and blanks", () => {
    const list = ["grátis"];
    expect(addTag(list, "#GRATIS")).toEqual(["grátis"]);
    expect(addTag(list, " # ")).toEqual(["grátis"]);
  });
  it("addTag stops at the maximum", () => {
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
    expect(addTag(full, "extra")).toEqual(full);
  });
});

describe("collectTags / suggestTags", () => {
  const links = [{ tags: ["praia", "grátis"] }, { tags: ["Praia", "museu"] }, { tags: null }, {}];
  it("collects used tags, most used first, deduped by key", () => {
    expect(collectTags(links)).toEqual(["praia", "grátis", "museu"]);
  });
  it("suggests by accent-insensitive substring, excluding already chosen", () => {
    const all = collectTags(links);
    expect(suggestTags(all, "gra", [])).toEqual(["grátis"]);
    expect(suggestTags(all, "#", ["praia"])).toEqual(["grátis", "museu"]);
    expect(suggestTags(all, "ia", [])).toEqual(["praia"]);
    expect(suggestTags(all, "zzz", [])).toEqual([]);
  });
  it("limits the number of suggestions", () => {
    const all = Array.from({ length: 20 }, (_, i) => `t${i}`);
    expect(suggestTags(all, "t", [], 5)).toHaveLength(5);
  });
});

describe("filtering by tag", () => {
  it("hasAllTags is true when the link carries every filter tag (accent-insensitive)", () => {
    expect(hasAllTags({ tags: ["grátis", "praia"] }, ["gratis"])).toBe(true);
    expect(hasAllTags({ tags: ["grátis"] }, ["gratis", "praia"])).toBe(false);
    expect(hasAllTags({ tags: null }, ["praia"])).toBe(false);
    expect(hasAllTags({ tags: null }, [])).toBe(true);
  });
});
