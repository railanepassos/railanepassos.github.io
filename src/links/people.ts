/**
 * Pure people helpers (Phase 2, `@name`). No DOM, no I/O.
 *
 * Same two-form model as tags (see `tags.ts`): a display form that is stored
 * and shown, and an accent/case-insensitive key that is compared. Differences:
 * names keep their case and inner spaces ("Maria Clara" is ONE person), so the
 * display form only trims, strips a leading `@` and collapses whitespace.
 *
 * Names are personal data (LGPD): they live only in the authenticated surface.
 */

export const MAX_PEOPLE = 30;
export const MAX_PERSON_LENGTH = 80;

/** Strip leading `@`, trim, collapse whitespace into a single space, cap length. */
export function normalizePerson(raw: string, maxLength: number = MAX_PERSON_LENGTH): string {
  return raw
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Accent- and case-insensitive comparison key of a person. */
export function personKey(raw: string): string {
  return normalizePerson(raw).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Normalize, drop blanks and duplicates (by key); first display form wins. */
export function dedupePeople(people: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of people) {
    const display = normalizePerson(raw);
    if (display === "") continue;
    const key = personKey(display);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out;
}

/** Every person used across the links, most used first (ties keep first-seen order). */
export function collectPeople(links: ReadonlyArray<{ people?: readonly string[] | null }>): string[] {
  const counts = new Map<string, { display: string; count: number }>();
  for (const link of links) {
    for (const person of dedupePeople(link.people ?? [])) {
      const key = personKey(person);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { display: person, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .map((e) => e.display);
}
