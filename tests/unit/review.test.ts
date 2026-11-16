import { describe, expect, it } from "vitest";
import {
  RATING_MAX,
  RATING_MIN,
  UNMARK_DONE_PATCH,
  formatRating,
  formatVisitDate,
  hasRating,
  isValidRating,
  normalizeRating,
  ratingLabel,
  reviewError,
  reviewFromLink,
  reviewToPatch,
} from "../../src/links/review";

describe("rating validation", () => {
  it("accepts integers 1 to 5 only", () => {
    expect([1, 2, 3, 4, 5].every(isValidRating)).toBe(true);
    for (const bad of [0, 6, -1, 2.5, NaN, Infinity, "3", null, undefined, true]) {
      expect(isValidRating(bad)).toBe(false);
    }
    expect(RATING_MIN).toBe(1);
    expect(RATING_MAX).toBe(5);
  });

  it("normalizes whatever the API returns to a valid rating or null", () => {
    expect(normalizeRating(4)).toBe(4);
    expect(normalizeRating(null)).toBeNull();
    expect(normalizeRating(undefined)).toBeNull();
    expect(normalizeRating(9)).toBeNull();
    expect(normalizeRating("4")).toBeNull();
  });

  it("reviewError: null rating is fine (optional), out-of-range is a PT-BR message", () => {
    expect(reviewError({ rating: null, want_again: false })).toBeNull();
    expect(reviewError({ rating: 3, want_again: true })).toBeNull();
    expect(reviewError({ rating: 6, want_again: false })).toMatch(/nota/i);
    expect(reviewError({ rating: 0, want_again: false })).toMatch(/1 a 5/);
  });
});

describe("rating formatting", () => {
  it("formats the compact and the accessible label", () => {
    expect(formatRating(4)).toBe("4/5");
    expect(ratingLabel(4)).toBe("Nota 4 de 5");
  });
});

describe("review <-> link row", () => {
  it("reads current values from a row, with defaults for legacy rows", () => {
    expect(reviewFromLink({ rating: 4, want_again: true })).toEqual({ rating: 4, want_again: true });
    expect(reviewFromLink({ rating: undefined, want_again: false })).toEqual({
      rating: null,
      want_again: false,
    });
    expect(reviewFromLink({ rating: 99, want_again: false }).rating).toBeNull();
  });

  it("builds the PATCH payload; clearing the rating sends null", () => {
    expect(reviewToPatch({ rating: 5, want_again: true })).toEqual({ rating: 5, want_again: true });
    expect(reviewToPatch({ rating: null, want_again: false })).toEqual({
      rating: null,
      want_again: false,
    });
  });

  it("hasRating only for done places with a valid rating", () => {
    expect(hasRating({ status: "done", rating: 3 })).toBe(true);
    expect(hasRating({ status: "done", rating: null })).toBe(false);
    expect(hasRating({ status: "wishlist", rating: 3 })).toBe(false);
  });

  it("unmarking done touches only status and completed_at", () => {
    expect(UNMARK_DONE_PATCH).toEqual({ status: "wishlist", completed_at: null });
  });
});

describe("formatVisitDate", () => {
  it("formats an ISO timestamp in pt-BR and tolerates garbage", () => {
    expect(formatVisitDate("2026-12-12T15:00:00Z")).toBe("12 de dezembro de 2026");
    expect(formatVisitDate("nope")).toBe("");
    expect(formatVisitDate(null)).toBe("");
  });
});
