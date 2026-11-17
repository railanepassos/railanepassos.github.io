import type { SharedPlanView } from "./plan-share";

/**
 * Render of a shared plan (Phase 4.1). Text nodes only (never HTML), no login.
 * The only controls are one checkbox per item (the tick). Reuses the Plano
 * section styles of the detail.
 */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function block(title: string, ...content: HTMLElement[]): HTMLElement {
  const section = el("section", "links-detail__plan-list");
  section.append(el("p", "links-detail__plan-title", title), ...content);
  return section;
}

export type ToggleHandler = (idx: number, text: string, done: boolean) => void;

export function renderSharedPlan(
  root: HTMLElement,
  view: SharedPlanView,
  onToggle: ToggleHandler,
  notice: string | null = null
): void {
  const focusedIdx = (document.activeElement as HTMLElement | null)?.dataset?.idx ?? null;
  const article = el("article", "links-public-plan");
  if (notice) {
    const note = el("p", "links-public-plan__notice", notice);
    note.setAttribute("role", "status");
    article.appendChild(note);
  }
  article.appendChild(el("h2", "links-public-plan__title", view.title));
  if (view.when) article.appendChild(el("p", "links-public-plan__meta", view.when));
  if (view.where) article.appendChild(el("p", "links-public-plan__meta", view.where));
  if (view.itinerary) {
    article.appendChild(block("Roteiro", el("p", "links-public-plan__text", view.itinerary)));
  }
  if (view.people.length > 0) {
    article.appendChild(
      block("Quem vai", el("p", "links-detail__plan-who-line", view.people.join(", ")))
    );
  }
  for (const list of view.lists) {
    const ul = el("ul", "links-detail__plan-items");
    for (const item of list.items) {
      const li = el("li", "links-detail__plan-item links-public-plan__item");
      if (item.done) li.classList.add("links-detail__plan-item--done");
      const label = el("label", "links-public-plan__row");
      const box = el("input", "links-public-plan__check");
      box.type = "checkbox";
      box.checked = item.done;
      box.dataset.idx = String(item.idx);
      box.addEventListener("change", () => onToggle(item.idx, item.text, box.checked));
      label.append(box, el("span", "links-detail__plan-text", item.text));
      li.appendChild(label);
      if (item.who) li.appendChild(el("span", "links-detail__plan-who", item.who));
      ul.appendChild(li);
    }
    article.appendChild(block(`${list.title} · ${list.progress}`, ul));
  }
  root.replaceChildren(article);
  if (focusedIdx !== null) {
    root.querySelector<HTMLElement>(`input[data-idx="${focusedIdx}"]`)?.focus();
  }
}

/** Loading, inactive or error text, announced to screen readers. */
export function renderSharedPlanMessage(
  root: HTMLElement,
  text: string,
  kind: "status" | "alert" = "status"
): void {
  const p = el("p", "links-status links-public-plan__message", text);
  p.setAttribute("role", kind);
  root.replaceChildren(p);
}
