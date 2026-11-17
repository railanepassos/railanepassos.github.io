/**
 * "Sugestões das suas lições" for the plan sheet: lessons learned (links.lessons)
 * from done places, offered as checklist items. Pure. Same accent/case-insensitive
 * key and "most used first" ordering as tags and people (see keyed-list.ts).
 */

import { collectBy, dedupeBy, fold } from "./keyed-list";
import { readLessons } from "./lessons";
import { PLAN_TEXT_MAX } from "./plan";

function normalizeLesson(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Accent- and case-insensitive comparison key of a lesson. */
export function lessonKey(raw: string): string {
  return fold(normalizeLesson(raw));
}

/**
 * Lessons of every done place, deduped, most frequent first (a lesson counts
 * once per place). Lessons longer than a plan item can hold are left out.
 */
export function collectLessons(
  links: ReadonlyArray<{ status?: string; lessons?: unknown }>
): string[] {
  const lists = links
    .filter((l) => l.status === "done")
    .map((l) => readLessons(l.lessons).filter((t) => normalizeLesson(t).length <= PLAN_TEXT_MAX));
  return collectBy(lists, (values) => dedupeBy(values, normalizeLesson, lessonKey), lessonKey);
}

/** Candidates minus the ones already written in the plan (compared by key). */
export function suggestLessons(
  candidates: readonly string[],
  planTexts: readonly string[]
): string[] {
  const taken = new Set(planTexts.map(lessonKey));
  return candidates.filter((c) => !taken.has(lessonKey(c)));
}
