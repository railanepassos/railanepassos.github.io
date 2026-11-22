import { renderPoseItem } from "./admin-ui";
import { StaleLinkError, type LinkRow } from "./links-repo";
import { buildMapUrl } from "./map-url";
import { PLAN_LISTS, readPlanItems, togglePlanItem, type PlanItem } from "./plan";
import { PLAN_STALE_NOTICE } from "./plan-share";
import { readPoseRefs } from "./poses";
import { formatScheduleLabel } from "./schedule";
import { syncBodyScreenLock } from "./screen-lock";
import { uiIcon } from "./ui-icons";
import { planProgress, visitTabs, type VisitTab } from "./visit";
import { createWakeLock, type WakeLock } from "./wake-lock";
import { displayTitle } from "./feed";

/**
 * Modo visita: full-screen, big-type view for use during the outing. Bottom
 * tabs (Roteiro, Checklist, História, Poses), tick the plan with one thumb, and
 * "Terminar visita" to mark the place done. Text only: user data is never HTML.
 */

export type VisitModeCallbacks = {
  /** Persist the whole plan_items array. Rejects on failure: the tick rolls back. */
  onSavePlanItems: (link: LinkRow, items: PlanItem[]) => Promise<void>;
  /** "Marcar como feito" in the finish confirmation (called after the mode closed). */
  onMarkDone: (link: LinkRow) => void;
  /** Fired on every close (X, Escape, "Agora não", after marking done). */
  onClose?: () => void;
  /** Injected in tests; defaults to the Screen Wake Lock wrapper. */
  wakeLock?: WakeLock;
};

export type VisitModeHandle = {
  element: HTMLElement;
  open: (link: LinkRow) => void;
  close: () => void;
  currentId: () => string | null;
  /** Re-render from fresh server data (no-op for another place or while ticks are saving). */
  refresh: (link: LinkRow) => void;
};

const TAB_LABELS: Record<VisitTab, string> = {
  roteiro: "Roteiro",
  checklist: "Checklist",
  historia: "História",
  poses: "Poses",
};

const SAVE_ERROR = "Não foi possível salvar o plano. Tente de novo.";

type PlanSync = { confirmed: PlanItem[]; local: PlanItem[]; chain: Promise<void>; pending: number };

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string): HTMLButtonElement {
  const b = el("button", className, label);
  b.type = "button";
  return b;
}

function field(name: string, term: string, value: string): HTMLElement {
  const block = el("section", "links-visit__block");
  block.dataset.field = name;
  block.append(el("h3", "links-visit__term", term), el("p", "links-visit__text", value));
  return block;
}

export function createVisitMode(cb: VisitModeCallbacks): VisitModeHandle {
  const wake = cb.wakeLock ?? createWakeLock();
  let current: LinkRow | null = null;
  let active: VisitTab = "roteiro";
  let previouslyFocused: HTMLElement | null = null;
  const planSync = new Map<string, PlanSync>();

  const overlay = el("div", "links-visit");
  overlay.hidden = true;

  const dialog = el("div", "links-visit__dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "links-visit-title");

  const header = el("header", "links-visit__header");
  const title = el("h2", "links-visit__title");
  title.id = "links-visit-title";
  const closeBtn = el("button", "links-visit__close");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Fechar modo visita");
  closeBtn.title = "Fechar modo visita";
  closeBtn.appendChild(uiIcon("close", 24));
  header.append(title, closeBtn);

  const panel = el("div", "links-visit__panel");
  panel.id = "links-visit-panel";
  panel.setAttribute("role", "tabpanel");
  panel.tabIndex = 0;

  const footer = el("div", "links-visit__footer");
  const finishBtn = button("Terminar visita", "links-visit__finish");
  const confirm = el("div", "links-visit__confirm");
  confirm.hidden = true;
  confirm.dataset.field = "finish-confirm";
  const confirmText = el("p", "links-visit__confirm-text", "Marcar como feito?");
  const confirmYes = button("Marcar como feito", "links-visit__finish");
  const confirmNo = button("Agora não", "links-visit__later");
  confirm.append(confirmText, confirmYes, confirmNo);
  footer.append(finishBtn, confirm);

  const tablist = el("div", "links-visit__tabs");
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "Seções da visita");

  dialog.append(header, panel, footer, tablist);
  overlay.appendChild(dialog);

  function tabButtons(): HTMLButtonElement[] {
    return Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  }

  function select(tab: VisitTab, focus = false): void {
    active = tab;
    for (const t of tabButtons()) {
      const on = t.dataset.tab === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    panel.setAttribute("aria-labelledby", `links-visit-tab-${tab}`);
    renderPanel();
  }

  function renderTabs(tabs: VisitTab[]): void {
    tablist.replaceChildren(
      ...tabs.map((tab) => {
        const b = button(TAB_LABELS[tab], "links-visit__tab");
        b.setAttribute("role", "tab");
        b.id = `links-visit-tab-${tab}`;
        b.dataset.tab = tab;
        b.setAttribute("aria-controls", "links-visit-panel");
        b.addEventListener("click", () => select(tab));
        b.addEventListener("keydown", (e) => {
          const order = tabButtons().map((t) => t.dataset.tab as VisitTab);
          const at = order.indexOf(tab);
          let next = -1;
          if (e.key === "ArrowRight") next = (at + 1) % order.length;
          else if (e.key === "ArrowLeft") next = (at - 1 + order.length) % order.length;
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = order.length - 1;
          if (next < 0) return;
          e.preventDefault();
          select(order[next]!, true);
        });
        return b;
      })
    );
  }

  const planError = el("p", "links-visit__error");
  planError.setAttribute("role", "alert");
  planError.hidden = true;

  function renderRoteiro(link: LinkRow): HTMLElement[] {
    const out: HTMLElement[] = [];
    if (link.scheduled_start && link.scheduled_end) {
      out.push(field("time", "Horário", formatScheduleLabel(link.scheduled_start, link.scheduled_end)));
    }
    const itinerary = (link.itinerary ?? "").trim();
    const it = field("itinerary", "Roteiro", itinerary === "" ? "Sem roteiro ainda" : itinerary);
    if (itinerary === "") it.classList.add("links-visit__block--empty");
    out.push(it);
    const address = (link.address ?? "").trim();
    const mapUrl = buildMapUrl(link.address, link.city);
    if (address !== "" || mapUrl) {
      const block = address !== "" ? field("address", "Endereço", address) : el("section", "links-visit__block");
      if (mapUrl) {
        const a = el("a", "links-visit__map");
        a.dataset.action = "open-map";
        a.href = mapUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.append(uiIcon("pin", 22), el("span", undefined, "Abrir no mapa"));
        block.appendChild(a);
      }
      out.push(block);
    }
    const cost = (link.cost_text ?? "").trim();
    if (cost !== "") out.push(field("cost", "Custo", cost));
    return out;
  }

  function renderChecklist(link: LinkRow): HTMLElement[] {
    const items = readPlanItems(link.plan_items);
    const out: HTMLElement[] = [];
    for (const list of PLAN_LISTS) {
      const entries = items.map((item, index) => ({ item, index })).filter((e) => e.item.list === list.key);
      if (entries.length === 0) continue;
      const { done, total } = planProgress(items, list.key);
      const block = el("section", "links-visit__block");
      block.dataset.planList = list.key;
      block.appendChild(el("h3", "links-visit__term", `${list.title} · ${done} de ${total}`));
      const ul = el("ul", "links-visit__items");
      for (const { item, index } of entries) {
        const li = el("li", "links-visit__item");
        if (item.done) li.classList.add("links-visit__item--done");
        const label = el("label", "links-visit__check");
        const box = el("input");
        box.type = "checkbox";
        box.checked = item.done;
        box.addEventListener("change", () => tick(index, box.checked));
        label.append(box, el("span", "links-visit__item-text", item.text));
        li.appendChild(label);
        if (item.who) li.appendChild(el("span", "links-visit__who", item.who));
        ul.appendChild(li);
      }
      block.appendChild(ul);
      out.push(block);
    }
    out.push(planError);
    return out;
  }

  function renderHistoria(link: LinkRow): HTMLElement[] {
    const body = el("p", "links-visit__story", link.dossier ?? "");
    body.dataset.field = "dossier";
    return [body];
  }

  function renderPoses(link: LinkRow): HTMLElement[] {
    const ol = el("ol", "links-visit__poses");
    ol.append(
      ...readPoseRefs(link.pose_refs).map((ref, i) => {
        const li = renderPoseItem(ref, i);
        li.classList.add("links-visit__pose");
        return li;
      })
    );
    return [ol];
  }

  function renderPanel(): void {
    if (!current) return;
    const render: Record<VisitTab, (link: LinkRow) => HTMLElement[]> = {
      roteiro: renderRoteiro,
      checklist: renderChecklist,
      historia: renderHistoria,
      poses: renderPoses,
    };
    panel.replaceChildren(...render[active](current));
  }

  function renderAll(link: LinkRow): void {
    current = link;
    title.textContent = displayTitle(link);
    const tabs = visitTabs(link);
    if (!tabs.includes(active)) active = "roteiro";
    renderTabs(tabs);
    select(active);
  }

  function syncFor(link: LinkRow): PlanSync {
    let state = planSync.get(link.id);
    if (!state) {
      state = { confirmed: [], local: [], chain: Promise.resolve(), pending: 0 };
      planSync.set(link.id, state);
    }
    if (state.pending === 0) {
      state.confirmed = readPlanItems(link.plan_items);
      state.local = state.confirmed;
    }
    return state;
  }

  function tick(index: number, done: boolean): void {
    const link = current;
    if (!link) return;
    const state = syncFor(link);
    const next = togglePlanItem(readPlanItems(link.plan_items), index, done);
    state.local = next;
    planError.hidden = true;
    current = { ...link, plan_items: next };
    renderPanel();
    state.pending++;
    state.chain = state.chain.then(async () => {
      const sending = state.local;
      try {
        await cb.onSavePlanItems(link, sending);
        state.confirmed = sending;
      } catch (err) {
        if (err instanceof StaleLinkError && err.fresh) {
          state.confirmed = readPlanItems(err.fresh.plan_items);
          state.local = state.confirmed;
          if (current?.id === link.id) {
            renderAll(err.fresh);
            planError.textContent = PLAN_STALE_NOTICE;
            planError.hidden = false;
          }
          return;
        }
        state.local = state.confirmed;
        if (current?.id === link.id) {
          current = { ...current, plan_items: state.confirmed };
          renderPanel();
          planError.textContent = SAVE_ERROR;
          planError.hidden = false;
        }
      } finally {
        state.pending--;
      }
    });
  }

  function resetFinish(): void {
    confirm.hidden = true;
    finishBtn.hidden = false;
  }

  function open(link: LinkRow): void {
    if (overlay.hidden) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      active = "roteiro";
      planError.hidden = true;
      resetFinish();
    }
    overlay.hidden = false;
    renderAll(link);
    syncBodyScreenLock();
    void wake.request();
    panel.scrollTop = 0;
    closeBtn.focus();
  }

  function close(): void {
    if (overlay.hidden) return;
    overlay.hidden = true;
    current = null;
    resetFinish();
    syncBodyScreenLock();
    void wake.release();
    previouslyFocused?.focus?.();
    previouslyFocused = null;
    cb.onClose?.();
  }

  finishBtn.addEventListener("click", () => {
    finishBtn.hidden = true;
    confirm.hidden = false;
    confirmYes.focus();
  });
  confirmNo.addEventListener("click", close);
  confirmYes.addEventListener("click", () => {
    const link = current;
    close();
    if (link) cb.onMarkDone(link);
  });
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return {
    element: overlay,
    open,
    close,
    currentId: () => current?.id ?? null,
    refresh: (link) => {
      if (!current || current.id !== link.id) return;
      const state = planSync.get(link.id);
      if (state && state.pending > 0) return;
      renderAll(link);
    },
  };
}
