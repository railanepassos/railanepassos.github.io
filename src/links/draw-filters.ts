/**
 * Filters of the "Sortear" sheet. Pure module: the draw pool is narrowed by
 * cost, city, tags and time. Items with unknown cost or duration are kept
 * (not knowing is not a reason to hide a place); an item without city never
 * matches a city filter.
 */

import { fitsDuration, readDuration, type Duration } from "./duration";
import { fold } from "./keyed-list";
import { costNumber } from "./query";
import { hasAllTags } from "./tags";

export type DrawFilters = {
  /** Max cost in R$ (inclusive); null = any. */
  costMax: number | null;
  /** City as typed/picked; null = any. */
  city: string | null;
  /** Tags that must all be present. */
  tags: string[];
  /** Longest duration accepted; null = any. */
  duration: Duration | null;
};

export const EMPTY_DRAW_FILTERS: DrawFilters = {
  costMax: null,
  city: null,
  tags: [],
  duration: null,
};

export type DrawFilterable = {
  cost_text?: string | null;
  city?: string | null;
  tags?: readonly string[] | null;
  duration?: string | null;
};

const FREE_WORDS = ["gratis", "gratuito", "gratuita", "entrada franca"];

/**
 * Cost in R$ for the draw: a number in the text wins ("R$ 20, crianças grátis"
 * = 20); free words count as 0 only when there is no number; null if unknown.
 */
export function drawCost(text: string | null | undefined): number | null {
  const n = costNumber(text);
  if (n !== null) return n;
  const folded = fold(text ?? "");
  return FREE_WORDS.some((w) => folded.includes(w)) ? 0 : null;
}

export function hasActiveDrawFilters(filters: DrawFilters): boolean {
  return (
    filters.costMax !== null ||
    filters.city !== null ||
    filters.tags.length > 0 ||
    filters.duration !== null
  );
}

function matchesCost(link: DrawFilterable, max: number | null): boolean {
  if (max === null) return true;
  const cost = drawCost(link.cost_text);
  return cost === null || cost <= max;
}

function matchesCity(link: DrawFilterable, city: string | null): boolean {
  if (city === null) return true;
  return fold((link.city ?? "").trim()) === fold(city.trim());
}

function matchesDuration(link: DrawFilterable, limit: Duration | null): boolean {
  if (limit === null) return true;
  return readDuration(link.duration) === null || fitsDuration(link.duration, limit);
}

export function applyDrawFilters<T extends DrawFilterable>(
  links: readonly T[],
  filters: DrawFilters
): T[] {
  return links.filter(
    (l) =>
      matchesCost(l, filters.costMax) &&
      matchesCity(l, filters.city) &&
      hasAllTags(l, filters.tags) &&
      matchesDuration(l, filters.duration)
  );
}

/** Known cities, once each (accent/case-insensitive), first display form, sorted. */
export function drawCities(links: ReadonlyArray<{ city?: string | null }>): string[] {
  const byKey = new Map<string, string>();
  for (const l of links) {
    const city = (l.city ?? "").trim();
    if (city === "") continue;
    const key = fold(city);
    if (!byKey.has(key)) byKey.set(key, city);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
