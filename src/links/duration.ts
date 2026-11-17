/**
 * Duração of an item (how much of a day it takes). Pure module: the values
 * mirror migration 020 (links_duration_valid) and DRAFT_LIMITS.durations in
 * draft.ts (tests/unit/duration.test.ts keeps them in sync). The order is
 * shortest to longest so a "fits in my time" filter can compare ranks.
 */

export const DURATIONS = ["rapido", "meio-periodo", "dia-inteiro"] as const;

export type Duration = (typeof DURATIONS)[number];

export const DURATION_LABELS: Record<Duration, string> = {
  rapido: "Rápido (até 2h)",
  "meio-periodo": "Meio período",
  "dia-inteiro": "Dia inteiro",
};

/** Label of the form control and the detail row. */
export const DURATION_TERM = "Duração";

export function isDuration(value: unknown): value is Duration {
  return typeof value === "string" && (DURATIONS as readonly string[]).includes(value);
}

/** Stored value -> Duration, or null for anything else (null, "", unknown). */
export function readDuration(value: unknown): Duration | null {
  return isDuration(value) ? value : null;
}

export function durationLabel(value: unknown): string | null {
  const duration = readDuration(value);
  return duration === null ? null : DURATION_LABELS[duration];
}

/** 0 = shortest. -1 when the item has no (valid) duration. */
export function durationRank(value: unknown): number {
  const duration = readDuration(value);
  return duration === null ? -1 : DURATIONS.indexOf(duration);
}

/**
 * Whether an item fits in the time available: its duration is at most `limit`.
 * An item without duration never fits (callers decide what to do with those).
 */
export function fitsDuration(value: unknown, limit: Duration): boolean {
  const rank = durationRank(value);
  return rank >= 0 && rank <= DURATIONS.indexOf(limit);
}
