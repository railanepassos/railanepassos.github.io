import { RATING_MAX, RATING_MIN } from "./review";

/**
 * Toolbar of the Feitos section: ranking order, minimum rating and "Voltaria".
 * Pure DOM, no I/O. The minimum rating is the `nota>=N` search token (the host
 * edits the search text), so the select and the typed token stay in sync.
 */

export type DoneToolbarState = {
  ranking: boolean;
  wantAgain: boolean;
  /** From `nota>=N` in the search text; undefined when absent. */
  minRating?: number;
};

export type DoneToolbarHandlers = {
  onRanking: (on: boolean) => void;
  onWantAgain: (on: boolean) => void;
  onMinRating: (min: number | null) => void;
};

function toggle(label: string, on: boolean, onClick: (next: boolean) => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "links-chip links-donebar__toggle" + (on ? " links-chip--active" : "");
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.textContent = label;
  btn.addEventListener("click", () => onClick(!on));
  return btn;
}

export function renderDoneToolbar(
  state: DoneToolbarState,
  handlers: DoneToolbarHandlers
): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "links-donebar";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Ordenar e filtrar feitos");

  const select = document.createElement("select");
  select.className = "links-donebar__select";
  select.id = "links-donebar-min";
  select.setAttribute("aria-label", "Nota mínima");
  const all = new Option("Qualquer nota", "");
  select.add(all);
  for (let n = RATING_MIN; n <= RATING_MAX; n += 1) {
    select.add(new Option(`Nota ${n}+`, String(n)));
  }
  select.value = state.minRating === undefined ? "" : String(state.minRating);
  select.addEventListener("change", () =>
    handlers.onMinRating(select.value === "" ? null : Number(select.value))
  );

  bar.append(
    toggle("Ranking", state.ranking, handlers.onRanking),
    select,
    toggle("Voltaria", state.wantAgain, handlers.onWantAgain)
  );
  return bar;
}
