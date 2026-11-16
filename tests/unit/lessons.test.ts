import { describe, expect, it } from "vitest";
import {
  LESSON_MAX,
  MAX_LESSONS,
  lessonsError,
  normalizeLessons,
  readLessons,
} from "../../src/links/lessons";

describe("normalizeLessons", () => {
  it("trims items and drops blank rows, keeping order", () => {
    expect(normalizeLessons(["  levar lanche ", "", "   ", "chegar antes das 9h"])).toEqual([
      "levar lanche",
      "chegar antes das 9h",
    ]);
  });

  it("returns null when nothing is left", () => {
    expect(normalizeLessons([])).toBeNull();
    expect(normalizeLessons(["", "  "])).toBeNull();
  });
});

describe("lessonsError", () => {
  it("accepts up to 20 items of up to 300 characters (matches the DB checks)", () => {
    expect(MAX_LESSONS).toBe(20);
    expect(LESSON_MAX).toBe(300);
    expect(lessonsError(Array.from({ length: 20 }, () => "x".repeat(300)))).toBeNull();
  });

  it("rejects more than 20 non-blank items, ignoring blank rows", () => {
    expect(lessonsError(Array.from({ length: 21 }, () => "x"))).toMatch(/20/);
    expect(lessonsError([...Array.from({ length: 20 }, () => "x"), "", " "])).toBeNull();
  });

  it("rejects an over-long item and names its position", () => {
    expect(lessonsError(["ok", "x".repeat(301)])).toMatch(/Lição 2.*300/);
  });

  it("counts the trimmed length", () => {
    expect(lessonsError([` ${"x".repeat(300)} `])).toBeNull();
  });
});

describe("readLessons", () => {
  it("keeps only non-blank strings from the stored array", () => {
    expect(readLessons(["levar lanche", "", 3, null, "  ", "chegar cedo"])).toEqual([
      "levar lanche",
      "chegar cedo",
    ]);
  });

  it("tolerates anything that is not an array", () => {
    expect(readLessons(null)).toEqual([]);
    expect(readLessons(undefined)).toEqual([]);
    expect(readLessons("levar lanche")).toEqual([]);
  });
});
