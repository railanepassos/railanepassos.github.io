/** Breakpoint where the detail view is a side panel (keep in sync with CSS). */
export const DETAIL_PANEL_QUERY = "(min-width: 1024px)";

export function isPanelMode(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(DETAIL_PANEL_QUERY).matches
  );
}

/**
 * Lock body scroll while any links full-screen UI is open. On wide screens
 * the detail view is a non-modal side panel: it does not lock the page, it
 * only flags the layout (`links-detail-open`) so the grid makes room.
 */
export function syncBodyScreenLock(): void {
  const panel = isPanelMode();
  let detailOpen = false;
  let locking = false;
  for (const el of document.querySelectorAll(".links-admin-modal:not([hidden])")) {
    if (el.classList.contains("links-detail")) {
      detailOpen = true;
      if (!panel) locking = true;
    } else {
      locking = true;
    }
  }
  if (
    document.querySelector(".links-filter-sheet:not([hidden])") != null ||
    document.querySelector(".links-deck-screen:not([hidden])") != null ||
    document.querySelector(".links-visit:not([hidden])") != null
  ) {
    locking = true;
  }
  document.body.classList.toggle("links-screen-open", locking);
  document.body.classList.toggle("links-detail-open", panel && detailOpen);
}
