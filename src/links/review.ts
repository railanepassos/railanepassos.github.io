import type { LinkRow } from "./links-repo";

/**
 * "Como foi" (Phase 3): what the visit was like. Pure helpers shared by the
 * sheet, the card, the detail view and (later) ranking and search.
 *
 * Tickets that add a field (impressions, lessons, memory link) extend
 * `ReviewValues`, `reviewFromLink`, `reviewToPatch` and `reviewError` here, and
 * add one control in review-sheet.ts.
 */

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** Mirrors the DB check constraints of migration 012. */
export const REVIEW_LIMITS = {
  impressionsMax: 5000,
  lessonsMax: 20,
  lessonMax: 300,
  memoryUrlMax: 2000,
} as const;

export function isValidRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= RATING_MIN &&
    value <= RATING_MAX
  );
}

/** Whatever the API returned -> a valid rating or null. */
export function normalizeRating(value: unknown): number | null {
  return isValidRating(value) ? value : null;
}

/** Editable "Como foi" values (everything optional). */
export type ReviewValues = {
  rating: number | null;
  want_again: boolean;
};

/** The columns of `LinkRow` the review reads. */
export type ReviewSource = Partial<Pick<LinkRow, "rating" | "want_again">>;

export function reviewFromLink(link: ReviewSource): ReviewValues {
  return {
    rating: normalizeRating(link.rating),
    want_again: Boolean(link.want_again),
  };
}

/** Columns written by the sheet (a cleared rating is an explicit null). */
export type ReviewPatch = { rating: number | null; want_again: boolean };

export function reviewToPatch(values: ReviewValues): ReviewPatch {
  return { rating: values.rating, want_again: values.want_again };
}

/** First problem found (PT-BR), or null. */
export function reviewError(values: ReviewValues): string | null {
  if (values.rating !== null && !isValidRating(values.rating)) {
    return `A nota deve ser de ${RATING_MIN} a ${RATING_MAX}.`;
  }
  return null;
}

/** Compact form for the card: "4/5". */
export function formatRating(rating: number): string {
  return `${rating}/${RATING_MAX}`;
}

/** Spoken form: "Nota 4 de 5". */
export function ratingLabel(rating: number): string {
  return `Nota ${rating} de ${RATING_MAX}`;
}

/** Card/detail show the rating only for done places that have one. */
export function hasRating(link: Pick<LinkRow, "status" | "rating">): boolean {
  return link.status === "done" && isValidRating(link.rating);
}

/** Unmarking done never touches the "Como foi" columns. */
export const UNMARK_DONE_PATCH = { status: "wishlist", completed_at: null } as const;

export function formatVisitDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
