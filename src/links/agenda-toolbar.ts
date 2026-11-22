import { uiIcon } from "./ui-icons";

/**
 * Toolbar at the top of the Agenda section (Phase 10): export every scheduled
 * place as one .ics, and open the "Agenda no Google" subscription sheet. Pure
 * DOM, no I/O.
 */

export type AgendaToolbarState = { count: number };

export type AgendaToolbarHandlers = {
  onExport: () => void;
  onGoogle: () => void;
};

function button(
  action: string,
  text: string,
  icon: "note" | "calendar",
  onClick: () => void
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "links-chip links-agendabar__btn";
  btn.dataset.action = action;
  const label = document.createElement("span");
  label.textContent = text;
  btn.append(uiIcon(icon, 16), label);
  btn.addEventListener("click", onClick);
  return btn;
}

export function renderAgendaToolbar(
  state: AgendaToolbarState,
  handlers: AgendaToolbarHandlers
): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "links-agendabar";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Exportar agenda");

  const exportBtn = button("export-ics", "Exportar agenda (.ics)", "note", handlers.onExport);
  exportBtn.disabled = state.count === 0;
  if (state.count === 0) exportBtn.title = "Nada agendado para exportar";

  bar.append(exportBtn, button("calendar-feed", "Agenda no Google", "calendar", handlers.onGoogle));
  return bar;
}
