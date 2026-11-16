/**
 * Shared helpers for keyed string lists (tags `#` and people `@`). Pure.
 *
 * Both lists use the same two-form model: a display value (what is stored and
 * shown, from a `normalize` function) and an accent/case-insensitive key (what
 * is compared). Dedupe, "most used first" collection and autocomplete work the
 * same way for both, so they live here once.
 */

/** Accent- and case-insensitive form of a text. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Normalize, drop blanks and duplicates (by key); first display form wins. */
export function dedupeBy(
  raws: readonly string[],
  normalize: (raw: string) => string,
  key: (value: string) => string
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of raws) {
    const display = normalize(raw);
    if (display === "") continue;
    const k = key(display);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(display);
  }
  return out;
}

/** Every value used across the lists, most used first (ties keep first-seen order). */
export function collectBy(
  lists: Iterable<readonly string[] | null | undefined>,
  dedupe: (values: readonly string[]) => string[],
  key: (value: string) => string
): string[] {
  const counts = new Map<string, { display: string; count: number }>();
  for (const list of lists) {
    for (const value of dedupe(list ?? [])) {
      const k = key(value);
      const entry = counts.get(k);
      if (entry) entry.count += 1;
      else counts.set(k, { display: value, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).map((e) => e.display);
}

/** Autocomplete: accent-insensitive substring match, minus values already chosen. */
export function suggestBy(
  all: readonly string[],
  query: string,
  chosen: readonly string[],
  key: (value: string) => string,
  limit = 6
): string[] {
  const q = key(query);
  const taken = new Set(chosen.map(key));
  const out: string[] = [];
  for (const candidate of all) {
    const k = key(candidate);
    if (taken.has(k)) continue;
    if (q !== "" && !k.includes(q)) continue;
    out.push(candidate);
    if (out.length >= limit) break;
  }
  return out;
}
