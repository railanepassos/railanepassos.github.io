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
