import type { LinkRow } from "./links-repo";

function hasSchedule(link: LinkRow): boolean {
  return Boolean(link.scheduled_start && link.scheduled_end);
}

function createdMs(link: LinkRow): number {
  if (!link.created_at) return 0;
  const t = Date.parse(link.created_at);
  return Number.isNaN(t) ? 0 : t;
}

/** Scheduled first, then most recently created. Falls back to sort_order. */
export function compareLinksForDisplay(a: LinkRow, b: LinkRow): number {
  const aSched = hasSchedule(a) ? 0 : 1;
  const bSched = hasSchedule(b) ? 0 : 1;
  if (aSched !== bSched) return aSched - bSched;

  const byCreated = createdMs(b) - createdMs(a);
  if (byCreated !== 0) return byCreated;

  return a.sort_order - b.sort_order;
}

export function sortLinksForDisplay(links: readonly LinkRow[]): LinkRow[] {
  return [...links].sort(compareLinksForDisplay);
}

/** Main list: exclude done experiences. */
export function visibleListLinks(links: readonly LinkRow[]): LinkRow[] {
  return sortLinksForDisplay(links.filter((l) => (l.status ?? "wishlist") !== "done"));
}
