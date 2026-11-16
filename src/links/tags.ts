/**
 * Pure tag helpers (Phase 2). No DOM, no I/O.
 *
 * A tag has two forms:
 *  - display: what is stored and shown (`normalizeTag`): `#` stripped, trimmed,
 *    lowercased, inner whitespace turned into `-`. Accents are kept ("grátis").
 *  - key: what is compared (`tagKey`): the display form without accents, so
 *    `#Grátis`, `gratis` and `GRÁTIS` are the same tag.
 *
 * The generic dedupe/collect/suggest logic is shared with people (`keyed-list.ts`).
 * `hasAllTags` backs the `#tag` search filter.
 */

import { collectBy, dedupeBy, fold } from "./keyed-list";

export const MAX_TAGS = 30;
export const MAX_TAG_LENGTH = 40;

/** Strip leading `#`, trim, lowercase, collapse whitespace into `-`, cap length. */
export function normalizeTag(raw: string, maxLength: number = MAX_TAG_LENGTH): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, maxLength);
}

/** Accent- and case-insensitive comparison key of a tag. */
export function tagKey(raw: string): string {
  return fold(normalizeTag(raw));
}

/** Normalize, drop blanks and duplicates (by key); first display form wins. */
export function dedupeTags(tags: readonly string[], maxLength: number = MAX_TAG_LENGTH): string[] {
  return dedupeBy(tags, (raw) => normalizeTag(raw, maxLength), tagKey);
}

/** Every tag used across the links, most used first (ties keep first-seen order). */
export function collectTags(links: ReadonlyArray<{ tags?: readonly string[] | null }>): string[] {
  return collectBy(
    links.map((l) => l.tags),
    (tags) => dedupeTags(tags),
    tagKey
  );
}

/** True when the link carries every one of the filter tags (compared by key). */
export function hasAllTags(
  link: { tags?: readonly string[] | null },
  filterKeys: readonly string[]
): boolean {
  if (filterKeys.length === 0) return true;
  const own = new Set((link.tags ?? []).map(tagKey));
  return filterKeys.every((k) => own.has(tagKey(k)));
}
