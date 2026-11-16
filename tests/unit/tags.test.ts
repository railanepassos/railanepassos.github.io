import { describe, expect, it } from "vitest";
import {
  collectTags,
  dedupeTags,
  hasAllTags,
  normalizeTag,
  tagKey,
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

describe("dedupeTags", () => {
  it("treats case and accent variants as the same tag and keeps the first display form", () => {
    expect(dedupeTags(["#Praia", "praia", "grátis", "gratis", "#PRAIA"])).toEqual(["praia", "grátis"]);
  });
  it("drops empty entries", () => {
    expect(dedupeTags(["", "#", "ok"])).toEqual(["ok"]);
  });
});

describe("collectTags", () => {
  const links = [{ tags: ["praia", "grátis"] }, { tags: ["Praia", "museu"] }, { tags: null }, {}];
  it("collects used tags, most used first, deduped by key", () => {
    expect(collectTags(links)).toEqual(["praia", "grátis", "museu"]);
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
