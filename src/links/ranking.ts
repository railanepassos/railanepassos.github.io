import type { LinkRow } from "./links-repo";
import { isValidRating } from "./review";

/**
 * Ranking of done places (Phase 3). Pure: no DOM, no I/O.
 *
 * Order: rating desc, unrated last; ties go to the most recent visit
 * (`completed_at` desc, a missing date after every dated visit).
 */

export type DoneFilters = {
  /** Keep only places rated at least this (unrated never pass). */
  minRating?: number;
  /** Keep only places marked "Voltaria". */
  wantAgain?: boolean;
};

/** True when the place has a valid rating >= min. */
export function meetsMinRating(link: Pick<LinkRow, "rating">, min: number): boolean {
  return isValidRating(link.rating) && link.rating >= min;
}

function ratingOf(link: Pick<LinkRow, "rating">): number {
  return isValidRating(link.rating) ? link.rating : 0;
}

function visitMs(link: Pick<LinkRow, "completed_at">): number {
  const t = link.completed_at ? Date.parse(link.completed_at) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

export function rankDone(links: readonly LinkRow[]): LinkRow[] {
  return [...links].sort((a, b) => {
    const byRating = ratingOf(b) - ratingOf(a);
    if (byRating !== 0) return byRating;
    const ta = visitMs(a);
    const tb = visitMs(b);
    if (ta === tb) return 0;
    return tb > ta ? 1 : -1;
  });
}

export function filterDone(links: readonly LinkRow[], filters: DoneFilters): LinkRow[] {
  return links.filter((link) => {
    if (filters.minRating !== undefined && !meetsMinRating(link, filters.minRating)) return false;
    if (filters.wantAgain && !link.want_again) return false;
    return true;
  });
}

export function rankedDone(links: readonly LinkRow[], filters: DoneFilters = {}): LinkRow[] {
  return rankDone(filterDone(links, filters));
}
