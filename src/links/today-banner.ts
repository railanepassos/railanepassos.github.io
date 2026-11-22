import type { LinkRow } from "./links-repo";
import { uiIcon } from "./ui-icons";
import { todayVisits } from "./visit";

/**
 * "Hoje" banner at the top of the feed: shown when a wishlist place is
 * scheduled for today. Dismissal is per day, per device (sessionStorage);
 * storage may be blocked, so every access is guarded. Text only (no innerHTML).
 */

export type TodayBannerCallbacks = {
  /** Opens the visit mode for the earliest visit of the day. */
  onOpen: (link: LinkRow) => void;
  /** Fired after the user dismissed the banner (the caller re-renders). */
  onDismiss?: () => void;
};

/** Local calendar date (not UTC), so "today" matches what the user sees. */
export function dismissKey(now: Date): string {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `links-today-banner-dismissed-${now.getFullYear()}-${mm}-${dd}`;
}

export function isDismissed(now: Date): boolean {
  try {
    return sessionStorage.getItem(dismissKey(now)) === "1";
  } catch {
    return false;
  }
}

function remember(now: Date): void {
  try {
    sessionStorage.setItem(dismissKey(now), "1");
  } catch {
    /* blocked storage: the banner just comes back on the next render */
  }
}

/** The banner element, or null when there is nothing for today or it was dismissed. */
export function renderTodayBanner(
  links: readonly LinkRow[],
  now: Date,
  cb: TodayBannerCallbacks
): HTMLElement | null {
  if (isDismissed(now)) return null;
  const visits = todayVisits(links, now);
  const first = visits[0];
  if (!first) return null;

  const banner = document.createElement("section");
  banner.className = "links-today";
  banner.setAttribute("aria-label", "Visita de hoje");

  const text = document.createElement("p");
  text.className = "links-today__text";
  text.textContent = `Hoje: ${first.label}`;
  if (visits.length > 1) {
    const more = document.createElement("span");
    more.className = "links-today__more";
    more.textContent = ` · +${visits.length - 1}`;
    text.appendChild(more);
  }

  const open = document.createElement("button");
  open.type = "button";
  open.className = "links-today__open";
  open.textContent = "Abrir modo visita";
  open.addEventListener("click", () => cb.onOpen(first));

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "links-today__dismiss";
  dismiss.setAttribute("aria-label", "Dispensar");
  dismiss.title = "Dispensar";
  dismiss.appendChild(uiIcon("close", 18));
  dismiss.addEventListener("click", () => {
    remember(now);
    banner.remove();
    cb.onDismiss?.();
  });

  banner.append(text, open, dismiss);
  return banner;
}
