import type { LinkRow } from "./links-repo";
import { lessonsError, normalizeLessons, readLessons, storedLessonsError } from "./lessons";
import { httpsUrlError, isOptionalHttpsUrl } from "./validate";

/**
 * "Como foi" (Phase 3): what the visit was like. Pure helpers shared by the
 * sheet, the card, the detail view and (later) ranking and search.
 *
 * Tickets that add a field (impressions, lessons, memory link) extend
 * `ReviewValues`, `reviewFromLink`, `reviewToPatch` and `reviewError` here, and
 * add one control in review-sheet.ts.
 */

export const MEMORY_URL_TERM = "Link da memória";

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** Mirrors the DB check constraints of migration 012. */
export const REVIEW_LIMITS = {
  impressionsMax: 5000,
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
  /** Free text (line breaks kept); "" when empty. */
  impressions: string;
  /** Short items, in order; blank rows are dropped on save. */
  lessons: string[];
  /** Raw text of the memory link field ("" when empty). */
  memory_url: string;
};

/** The "Como foi" columns of a link: the one place their shape is declared. */
export type ReviewColumns = {
  rating?: number | null;
  impressions?: string | null;
  lessons?: string[] | null;
  memory_url?: string | null;
};

/** The columns of `LinkRow` the review reads. */
export type ReviewSource = ReviewColumns & Pick<Partial<LinkRow>, "want_again">;

/**
 * First problem (English, for API callers) in the stored review columns, or
 * null. Shared by every write path (create and update).
 */
export function reviewColumnsError(fields: ReviewColumns): string | null {
  if (fields.rating != null && !isValidRating(fields.rating)) {
    return `rating must be an integer from ${RATING_MIN} to ${RATING_MAX}`;
  }
  if (fields.impressions != null && fields.impressions.length > REVIEW_LIMITS.impressionsMax) {
    return `impressions must not exceed ${REVIEW_LIMITS.impressionsMax} characters`;
  }
  if (fields.lessons != null) {
    const problem = storedLessonsError(fields.lessons);
    if (problem) return `lessons invalid: ${problem}`;
  }
  if (!isOptionalHttpsUrl(fields.memory_url)) return "memory_url must be a valid https URL";
  if (fields.memory_url != null && fields.memory_url.length > REVIEW_LIMITS.memoryUrlMax) {
    return `memory_url must not exceed ${REVIEW_LIMITS.memoryUrlMax} characters`;
  }
  return null;
}

export function reviewFromLink(link: ReviewSource): ReviewValues {
  return {
    rating: normalizeRating(link.rating),
    want_again: Boolean(link.want_again),
    impressions: link.impressions ?? "",
    lessons: readLessons(link.lessons),
    memory_url: link.memory_url ?? "",
  };
}

/** Columns written by the sheet (a cleared rating is an explicit null). */
export type ReviewPatch = {
  rating: number | null;
  want_again: boolean;
  impressions: string | null;
  lessons: string[] | null;
  memory_url: string | null;
};

export function reviewToPatch(values: ReviewValues): ReviewPatch {
  const impressions = values.impressions.trim();
  const memoryUrl = values.memory_url.trim();
  return {
    rating: values.rating,
    want_again: values.want_again,
    impressions: impressions === "" ? null : impressions,
    lessons: normalizeLessons(values.lessons),
    memory_url: memoryUrl === "" ? null : memoryUrl,
  };
}

/** First problem found (PT-BR), or null. */
export function reviewError(values: ReviewValues): string | null {
  if (values.rating !== null && !isValidRating(values.rating)) {
    return `A nota deve ser de ${RATING_MIN} a ${RATING_MAX}.`;
  }
  if (values.impressions.trim().length > REVIEW_LIMITS.impressionsMax) {
    return `Impressões devem ter no máximo ${REVIEW_LIMITS.impressionsMax} caracteres.`;
  }
  const lessonsProblem = lessonsError(values.lessons);
  if (lessonsProblem) return lessonsProblem;
  return memoryUrlError(values.memory_url);
}

/** Inline-friendly check of the memory link field alone (PT-BR), or null. */
export function memoryUrlError(value: string): string | null {
  const problem = httpsUrlError(value, MEMORY_URL_TERM);
  if (problem) return problem;
  if (value.trim().length > REVIEW_LIMITS.memoryUrlMax) {
    return `${MEMORY_URL_TERM} deve ter no máximo ${REVIEW_LIMITS.memoryUrlMax} caracteres.`;
  }
  return null;
}

/** Compact form for the card: "4/5". */
export function formatRating(rating: number): string {
  return `${rating}/${RATING_MAX}`;
}

/** Spoken value: "4 de 5". */
export function ratingOutOf(rating: number): string {
  return `${rating} de ${RATING_MAX}`;
}

/** Spoken form: "Nota 4 de 5". */
export function ratingLabel(rating: number): string {
  return `Nota ${ratingOutOf(rating)}`;
}

/** Card/detail show the rating only for done places that have one. */
export function hasRating<T extends Pick<LinkRow, "status" | "rating">>(
  link: T
): link is T & { rating: number } {
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
