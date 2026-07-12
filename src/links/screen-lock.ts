/** Lock body scroll while any links full-screen UI is open. */
export function syncBodyScreenLock(): void {
  const anyOpen =
    document.querySelector(".links-admin-modal:not([hidden])") != null ||
    document.querySelector(".links-filter-sheet:not([hidden])") != null ||
    document.querySelector(".links-deck-screen:not([hidden])") != null;
  document.body.classList.toggle("links-screen-open", anyOpen);
}
