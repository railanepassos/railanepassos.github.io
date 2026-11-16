/**
 * Pure tag helpers (Phase 2). No DOM, no I/O.
 *
 * A tag has two forms:
 *  - display: what is stored and shown (`normalizeTag`): `#` stripped, trimmed,
 *    lowercased, inner whitespace turned into `-`. Accents are kept ("grátis").
 *  - key: what is compared (`tagKey`): the display form without accents, so
 *    `#Grátis`, `gratis` and `GRÁTIS` are the same tag.
 *
 * Reused by the people input (`@`) and the search syntax: both rely on these
 * shapes (`normalizeTag`/`tagKey`) and on `toggleKey`/`hasAllTags` for filters.
 */

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
  return normalizeTag(raw).normalize("NFD").replace(/\p{M}/gu, "");
}

/** Normalize, drop blanks and duplicates (by key); first display form wins. */
export function dedupeTags(tags: readonly string[], maxLength: number = MAX_TAG_LENGTH): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const display = normalizeTag(raw, maxLength);
    if (display === "") continue;
    const key = tagKey(display);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out;
}

/** Returns a new list with `raw` appended unless blank, duplicate or list is full. */
export function addTag(
  tags: readonly string[],
  raw: string,
  max: number = MAX_TAGS,
  maxLength: number = MAX_TAG_LENGTH
): string[] {
  const current = dedupeTags(tags, maxLength);
  if (current.length >= max) return current;
  return dedupeTags([...current, raw], maxLength);
}

/** Every tag used across the links, most used first (ties keep first-seen order). */
export function collectTags(links: ReadonlyArray<{ tags?: readonly string[] | null }>): string[] {
  const counts = new Map<string, { display: string; count: number }>();
  for (const link of links) {
    for (const tag of dedupeTags(link.tags ?? [])) {
      const key = tagKey(tag);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { display: tag, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .map((e) => e.display);
}

/** Autocomplete: accent-insensitive substring match, minus tags already chosen. */
export function suggestTags(
  all: readonly string[],
  query: string,
  chosen: readonly string[],
  limit = 6
): string[] {
  const q = tagKey(query);
  const taken = new Set(chosen.map(tagKey));
  const out: string[] = [];
  for (const tag of all) {
    const key = tagKey(tag);
    if (taken.has(key)) continue;
    if (q !== "" && !key.includes(q)) continue;
    out.push(tag);
    if (out.length >= limit) break;
  }
  return out;
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

/** Toggle a tag in a list of filter keys (returns a new list of keys). */
export function toggleKey(keys: readonly string[], raw: string): string[] {
  const key = tagKey(raw);
  if (key === "") return [...keys];
  return keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
}
