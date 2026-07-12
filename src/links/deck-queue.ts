import type { LinkRow } from "./links-repo";

export type DeckTab = "wishlist" | "done";

function createdMs(link: LinkRow): number {
  if (!link.created_at) return 0;
  const t = Date.parse(link.created_at);
  return Number.isNaN(t) ? 0 : t;
}

/** Links for a Deck tab, ordered for swipe. */
export function linksForDeck(links: readonly LinkRow[], tab: DeckTab): LinkRow[] {
  const filtered = links.filter((l) => (l.status ?? "wishlist") === tab);
  return [...filtered].sort((a, b) => {
    if (tab === "wishlist") {
      const byPri = (b.priority ?? 0) - (a.priority ?? 0);
      if (byPri !== 0) return byPri;
    }
    if (tab === "done") {
      const aw = a.want_again ? 0 : 1;
      const bw = b.want_again ? 0 : 1;
      if (aw !== bw) return aw - bw;
    }
    return createdMs(b) - createdMs(a);
  });
}

/** Move front item to end (session skip). */
export function skipFront(queue: readonly LinkRow[]): LinkRow[] {
  if (queue.length <= 1) return [...queue];
  const [head, ...rest] = queue;
  return [...rest, head];
}

/** Next priority value for a “Quero” swipe. */
export function nextPriority(links: readonly LinkRow[]): number {
  const max = links.reduce((m, l) => Math.max(m, l.priority ?? 0), 0);
  return max + 1;
}
