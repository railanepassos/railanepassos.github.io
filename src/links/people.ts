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

import { collectBy, dedupeBy, fold } from "./keyed-list";

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
  return fold(normalizePerson(raw));
}

/** Normalize, drop blanks and duplicates (by key); first display form wins. */
export function dedupePeople(people: readonly string[]): string[] {
  return dedupeBy(people, normalizePerson, personKey);
}

/** Every person used across the links, most used first (ties keep first-seen order). */
export function collectPeople(links: ReadonlyArray<{ people?: readonly string[] | null }>): string[] {
  return collectBy(
    links.map((l) => l.people),
    dedupePeople,
    personKey
  );
}

/** True when the link has, for every filter key, a person whose key EQUALS it. */
export function hasAllPeople(
  link: { people?: readonly string[] | null },
  filterKeys: readonly string[]
): boolean {
  if (filterKeys.length === 0) return true;
  const own = new Set((link.people ?? []).map(personKey));
  return filterKeys.every((k) => own.has(personKey(k)));
}
