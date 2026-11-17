import type { LinkRow } from "./links-repo";

/**
 * Memórias: pure view-model for the timeline of done items. Only done items
 * with a valid visit date (`completed_at`) are memories, newest first.
 * Dates are read in local time, like the visit date shown on cards.
 * No DOM, no I/O. `memoryEntries` is the shared base: other memory features
 * (e.g. an anniversary highlight) should build on it.
 */

export type MemoryEntry = { link: LinkRow; time: number };

export type MemoryMonth = { month: number; label: string; entries: MemoryEntry[] };

export type MemoryYear = { year: number; months: MemoryMonth[] };

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Done items with a valid visit date, most recent visit first (stable). */
export function memoryEntries(links: readonly LinkRow[]): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  for (const link of links) {
    if ((link.status ?? "wishlist") !== "done" || !link.completed_at) continue;
    const time = Date.parse(link.completed_at);
    if (Number.isNaN(time)) continue;
    entries.push({ link, time });
  }
  return entries.sort((a, b) => b.time - a.time);
}

/** Memory links only, newest first (what the section lists and counts). */
export function memoryTimeline(links: readonly LinkRow[]): LinkRow[] {
  return memoryEntries(links).map((e) => e.link);
}

/** Year → month groups, both newest first. */
export function groupMemories(links: readonly LinkRow[]): MemoryYear[] {
  const years: MemoryYear[] = [];
  for (const entry of memoryEntries(links)) {
    const date = new Date(entry.time);
    const year = date.getFullYear();
    const month = date.getMonth();
    let y = years[years.length - 1];
    if (!y || y.year !== year) {
      y = { year, months: [] };
      years.push(y);
    }
    let m = y.months[y.months.length - 1];
    if (!m || m.month !== month) {
      m = { month, label: MONTH_NAMES[month]!, entries: [] };
      y.months.push(m);
    }
    m.entries.push(entry);
  }
  return years;
}

export type Anniversary = { link: LinkRow; yearsAgo: number; daysAway: number };

/** Half-width, in days, of the window around today's month-day. */
export const ANNIVERSARY_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

/** Calendar-day number (local date parts, so DST never shifts it). */
function dayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month, day) / DAY_MS);
}

/** Month-day of a visit placed in `year`; Feb 29 falls on Feb 28 in non-leap years. */
function inYear(year: number, month: number, day: number): number {
  const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
  return dayNumber(year, month, month === 1 && day === 29 && !leap ? 28 : day);
}

/**
 * Visits from earlier years whose month-day is within +-7 days of `now`
 * (year boundary included). `yearsAgo` counts anniversary years (>= 1), so a
 * Dec 30 visit seen on Jan 3 is still "1 year". Closest first, then newest.
 */
export function anniversaries(links: readonly LinkRow[], now: Date): Anniversary[] {
  const today = dayNumber(now.getFullYear(), now.getMonth(), now.getDate());
  const found: Array<Anniversary & { time: number }> = [];
  for (const { link, time } of memoryEntries(links)) {
    const visit = new Date(time);
    const month = visit.getMonth();
    const day = visit.getDate();
    let best: { year: number; daysAway: number } | null = null;
    for (const year of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
      const daysAway = Math.abs(inYear(year, month, day) - today);
      if (!best || daysAway < best.daysAway) best = { year, daysAway };
    }
    if (!best || best.daysAway > ANNIVERSARY_WINDOW_DAYS) continue;
    const yearsAgo = best.year - visit.getFullYear();
    if (yearsAgo < 1) continue;
    found.push({ link, yearsAgo, daysAway: best.daysAway, time });
  }
  found.sort((a, b) => a.daysAway - b.daysAway || b.time - a.time);
  return found.map(({ link, yearsAgo, daysAway }) => ({ link, yearsAgo, daysAway }));
}
