/**
 * Lessons learned ("levar lanche", "chegar antes das 9h"): a short ordered list
 * stored per place in links.lessons (text[]). Pure helpers; the editable list
 * follows the pose-list pattern (add, remove, reorder, blank rows dropped).
 */

/** Mirror the DB check constraints of migration 012. */
export const MAX_LESSONS = 20;
export const LESSON_MAX = 300;

/** Drafts -> payload. Items are trimmed, blank rows dropped; nothing left -> null. */
export function normalizeLessons(drafts: readonly string[]): string[] | null {
  const out = drafts.map((d) => d.trim()).filter((d) => d !== "");
  return out.length > 0 ? out : null;
}

/** First problem found in the drafts (PT-BR, names the lesson), or null. */
export function lessonsError(drafts: readonly string[]): string | null {
  if ((normalizeLessons(drafts) ?? []).length > MAX_LESSONS) {
    return `Use no máximo ${MAX_LESSONS} lições.`;
  }
  for (let i = 0; i < drafts.length; i++) {
    if (drafts[i]!.trim().length > LESSON_MAX) {
      return `Lição ${i + 1}: deve ter no máximo ${LESSON_MAX} caracteres.`;
    }
  }
  return null;
}

/** Defensive read of the stored array: only non-blank strings survive. */
export function readLessons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}
