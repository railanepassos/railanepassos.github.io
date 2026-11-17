import { describe, expect, it } from "vitest";
import { collectLessons, suggestLessons } from "../../src/links/lesson-suggestions";

const done = (lessons: unknown) => ({ status: "done", lessons });
const wish = (lessons: unknown) => ({ status: "wishlist", lessons });

describe("collectLessons", () => {
  it("only reads lessons of done places", () => {
    expect(collectLessons([done(["Levar lanche"]), wish(["Chegar cedo"])])).toEqual(["Levar lanche"]);
  });

  it("dedupes accent- and case-insensitively, first display form wins", () => {
    expect(collectLessons([done(["Chegar antes das 9h"]), done(["CHEGAR ANTES DAS 9H"])])).toEqual([
      "Chegar antes das 9h",
    ]);
    expect(collectLessons([done(["Água"]), done(["agua"])])).toEqual(["Água"]);
  });

  it("orders most frequent first, ties keep first-seen order", () => {
    const links = [done(["A", "B"]), done(["C", "b"]), done(["b", "C"])];
    expect(collectLessons(links)).toEqual(["B", "C", "A"]);
  });

  it("counts a lesson once per place", () => {
    expect(collectLessons([done(["A", "a"]), done(["B"]), done(["B"])])).toEqual(["B", "A"]);
  });

  it("tolerates missing or malformed lessons and drops blanks", () => {
    expect(collectLessons([done(null), done(undefined), done("x"), done(["  ", "Ok"])])).toEqual(["Ok"]);
  });

  it("skips lessons too long to be a plan item", () => {
    expect(collectLessons([done(["x".repeat(201)])])).toEqual([]);
  });
});

describe("suggestLessons", () => {
  it("excludes lessons already in the plan, by the same key", () => {
    expect(suggestLessons(["Levar água", "Chegar cedo"], ["levar AGUA"])).toEqual(["Chegar cedo"]);
  });

  it("returns everything when the plan is empty and nothing when all are used", () => {
    expect(suggestLessons(["A", "B"], [])).toEqual(["A", "B"]);
    expect(suggestLessons(["A"], ["a"])).toEqual([]);
  });
});
