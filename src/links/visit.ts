import type { LinkRow } from "./links-repo";
import type { PlanItem, PlanList } from "./plan";

/**
 * Modo visita: pure helpers (no DOM, no I/O). Which tabs a place has, whether
 * it is a visit for today, checklist progress and the `#visita/<id>` fragment.
 * Dates are read in local time, like the cards and memories.
 */

export type VisitTab = "roteiro" | "checklist" | "historia" | "poses";

/** Tabs with content, in on-screen order. "roteiro" is always there. */
export function visitTabs(link: LinkRow): VisitTab[] {
  const tabs: VisitTab[] = ["roteiro"];
  if ((link.plan_items ?? []).length > 0) tabs.push("checklist");
  if (typeof link.dossier === "string" && link.dossier.trim() !== "") tabs.push("historia");
  const poses = link.pose_refs ?? [];
  if (poses.some((p) => (p?.url ?? "").trim() !== "" || (p?.note ?? "").trim() !== "")) {
    tabs.push("poses");
  }
  return tabs;
}

function startTime(link: LinkRow): number {
  return link.scheduled_start ? Date.parse(link.scheduled_start) : Number.NaN;
}

/** Wishlist item scheduled on the same local calendar day as `now`. */
export function isVisitToday(link: LinkRow, now: Date): boolean {
  if ((link.status ?? "wishlist") === "done") return false;
  const time = startTime(link);
  if (Number.isNaN(time)) return false;
  const start = new Date(time);
  return (
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate()
  );
}

/** Today's visits, earliest first (stable). */
export function todayVisits(links: readonly LinkRow[], now: Date): LinkRow[] {
  return links
    .filter((link) => isVisitToday(link, now))
    .sort((a, b) => startTime(a) - startTime(b));
}

/** Done/total of one plan list. */
export function planProgress(
  items: readonly PlanItem[] | null | undefined,
  list: PlanList
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const item of items ?? []) {
    if (item.list !== list) continue;
    total += 1;
    if (item.done) done += 1;
  }
  return { done, total };
}

const VISIT_FRAGMENT_PREFIX = "#visita/";
const VISIT_ID_RE = /^[0-9a-zA-Z-]+$/;

/** True when the hash targets visit mode (id valid or not). */
export function isVisitFragment(hash: string): boolean {
  return hash.startsWith(VISIT_FRAGMENT_PREFIX);
}

/** Id from `#visita/<id>`, or null for anything else. */
export function parseVisitFragment(hash: string): string | null {
  if (!isVisitFragment(hash)) return null;
  const id = hash.slice(VISIT_FRAGMENT_PREFIX.length);
  return VISIT_ID_RE.test(id) ? id : null;
}

export function visitFragment(id: string): string {
  return `${VISIT_FRAGMENT_PREFIX}${id}`;
}
