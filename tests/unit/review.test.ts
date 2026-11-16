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
  REVIEW_LIMITS,
  type ReviewValues,
} from "../../src/links/review";

const blank = (over: Partial<ReviewValues> = {}): ReviewValues => ({
  rating: null,
  want_again: false,
  impressions: "",
  lessons: [],
  memory_url: "",
  ...over,
});

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
    expect(reviewError(blank())).toBeNull();
    expect(reviewError(blank({ rating: 3, want_again: true }))).toBeNull();
    expect(reviewError(blank({ rating: 6 }))).toMatch(/nota/i);
    expect(reviewError(blank({ rating: 0 }))).toMatch(/1 a 5/);
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
    expect(reviewFromLink({ rating: 4, want_again: true })).toEqual(
      blank({ rating: 4, want_again: true })
    );
    expect(reviewFromLink({ rating: undefined, want_again: false })).toEqual(blank());
    expect(reviewFromLink({ rating: 99, want_again: false }).rating).toBeNull();
  });

  it("reads impressions and lessons, tolerating nulls and junk", () => {
    expect(
      reviewFromLink({ impressions: "Valeu a pena.\nVoltaria.", lessons: ["levar lanche", ""] })
    ).toMatchObject({ impressions: "Valeu a pena.\nVoltaria.", lessons: ["levar lanche"] });
    expect(reviewFromLink({ impressions: null, lessons: null })).toMatchObject({
      impressions: "",
      lessons: [],
    });
  });

  it("builds the PATCH payload; clearing the rating sends null", () => {
    expect(reviewToPatch(blank({ rating: 5, want_again: true }))).toEqual({
      rating: 5,
      want_again: true,
      impressions: null,
      lessons: null,
      memory_url: null,
    });
    expect(
      reviewToPatch(blank({ memory_url: "  https://photos.app.goo.gl/x  " })).memory_url
    ).toBe("https://photos.app.goo.gl/x");
  });

  it("reads the memory link from a row", () => {
    expect(reviewFromLink({ memory_url: "https://youtu.be/dQw4w9WgXcQ" }).memory_url).toBe(
      "https://youtu.be/dQw4w9WgXcQ"
    );
  });

  it("memory link: empty and https are fine, anything else is a PT-BR message", () => {
    expect(reviewError(blank({ memory_url: "https://youtu.be/dQw4w9WgXcQ" }))).toBeNull();
    expect(reviewError(blank({ memory_url: "http://youtu.be/dQw4w9WgXcQ" }))).toMatch(/https/);
    expect(reviewError(blank({ memory_url: "foto" }))).toMatch(/Link da memória/);
    expect(reviewError(blank({ memory_url: `https://x.com/${"a".repeat(2000)}` }))).toMatch(/2000/);
  });

  it("PATCH trims impressions, drops blank lessons, and sends null when empty", () => {
    expect(
      reviewToPatch(
        blank({ impressions: "  Gostei muito.\nCaro.  ", lessons: [" levar lanche ", "", "  "] })
      )
    ).toMatchObject({ impressions: "Gostei muito.\nCaro.", lessons: ["levar lanche"] });
    expect(reviewToPatch(blank({ impressions: "   ", lessons: ["", " "] }))).toMatchObject({
      impressions: null,
      lessons: null,
    });
  });

  it("reviewError enforces the migration limits for impressions and lessons", () => {
    expect(REVIEW_LIMITS.impressionsMax).toBe(5000);
    expect(reviewError(blank({ impressions: "x".repeat(5000) }))).toBeNull();
    expect(reviewError(blank({ impressions: "x".repeat(5001) }))).toMatch(/Impressões.*5000/);
    expect(reviewError(blank({ lessons: Array.from({ length: 21 }, () => "x") }))).toMatch(/20/);
    expect(reviewError(blank({ lessons: ["x".repeat(301)] }))).toMatch(/Lição 1/);
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
