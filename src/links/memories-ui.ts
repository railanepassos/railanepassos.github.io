import { resolveCategory } from "./category";
import { categoryBackdropSrc } from "./card-theme";
import { displayTitle } from "./feed";
import type { LinkRow } from "./links-repo";
import { groupMemories } from "./memories";
import { parseMemoryLink } from "./memory-link";
import { formatRating, formatVisitDate, hasRating, ratingLabel } from "./review";
import { uiIcon } from "./ui-icons";

/**
 * Memórias view: the "Lista | Memórias" switch (mobile Feitos header) and the
 * timeline (year > month > entries). Text via textContent only, images are
 * plain <img>, links open in a new tab: no innerHTML, no embeds (CSP-safe).
 */

export const IMPRESSIONS_PREVIEW_MAX = 140;

export type MemoriesSwitchHandlers = { onList: () => void; onMemories: () => void };

export type MemoriesHandlers = { onView: (link: LinkRow) => void };

/** Short preview of free text: whitespace collapsed, cut at a word boundary with "…". */
export function truncateImpressions(text: string, max = IMPRESSIONS_PREVIEW_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

export function renderMemoriesSwitch(
  active: "done" | "memories",
  handlers: MemoriesSwitchHandlers
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "links-memswitch";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Visualização dos feitos");
  const make = (text: string, key: "done" | "memories", onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "links-memswitch__btn";
    btn.dataset.view = key;
    btn.textContent = text;
    const on = active === key;
    btn.classList.toggle("links-memswitch__btn--active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.addEventListener("click", onClick);
    return btn;
  };
  wrap.append(
    make("Lista", "done", handlers.onList),
    make("Memórias", "memories", handlers.onMemories)
  );
  return wrap;
}

function renderEntry(link: LinkRow, handlers: MemoriesHandlers): HTMLElement {
  const item = document.createElement("article");
  item.className = "links-memory";
  item.dataset.id = link.id;

  const category = resolveCategory(link);
  const src = categoryBackdropSrc(category, link.image_url);
  if (src) {
    const photo = document.createElement("img");
    photo.className = "links-memory__photo";
    photo.src = src;
    photo.alt = "";
    photo.loading = "lazy";
    photo.decoding = "async";
    item.appendChild(photo);
  }

  const body = document.createElement("div");
  body.className = "links-memory__body";

  const name = document.createElement("button");
  name.type = "button";
  name.className = "links-memory__open";
  name.textContent = displayTitle(link);
  name.addEventListener("click", () => handlers.onView(link));

  const meta = document.createElement("p");
  meta.className = "links-memory__meta";
  const date = document.createElement("time");
  date.className = "links-memory__date";
  date.dateTime = link.completed_at ?? "";
  date.textContent = formatVisitDate(link.completed_at);
  meta.appendChild(date);
  if (hasRating(link)) {
    const rating = document.createElement("span");
    rating.className = "links-memory__rating";
    rating.setAttribute("aria-label", ratingLabel(link.rating));
    rating.append(uiIcon("star", 14), document.createTextNode(` ${formatRating(link.rating)}`));
    meta.appendChild(rating);
  }
  body.append(name, meta);

  const impressions = (link.impressions ?? "").trim();
  if (impressions) {
    const text = document.createElement("p");
    text.className = "links-memory__impressions";
    text.textContent = truncateImpressions(impressions);
    body.appendChild(text);
  }

  const memory = parseMemoryLink(link.memory_url);
  if (memory) {
    const action = document.createElement("a");
    action.className = "links-memory__action";
    action.dataset.action = "open-memory";
    action.rel = "noopener noreferrer";
    action.target = "_blank";
    if (memory.kind === "youtube") {
      action.href = memory.watchUrl;
      const thumb = document.createElement("img");
      thumb.className = "links-memory__thumb";
      thumb.src = memory.thumbnailUrl;
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.referrerPolicy = "no-referrer";
      thumb.addEventListener("error", () => {
        thumb.hidden = true;
      });
      action.appendChild(thumb);
    } else {
      action.href = memory.url;
    }
    const label = document.createElement("span");
    label.textContent = memory.kind === "youtube" ? "Assistir" : "Ver álbum";
    action.append(uiIcon("external", 16), label);
    body.appendChild(action);
  }

  item.appendChild(body);
  return item;
}

/** Timeline of memories; the empty state explains how to add one. */
export function renderMemoriesTimeline(
  links: readonly LinkRow[],
  handlers: MemoriesHandlers
): HTMLElement {
  const root = document.createElement("div");
  root.className = "links-memories";
  const groups = groupMemories(links);
  if (groups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "links-status links-memories__empty";
    empty.textContent =
      "Nenhuma memória ainda. Marque uma experiência como feita, com a data da visita, e ela aparece aqui.";
    root.appendChild(empty);
    return root;
  }
  for (const group of groups) {
    const year = document.createElement("section");
    year.className = "links-memories__year";
    const yearTitle = document.createElement("h3");
    yearTitle.className = "links-memories__year-title";
    yearTitle.textContent = String(group.year);
    year.appendChild(yearTitle);
    for (const month of group.months) {
      const section = document.createElement("section");
      section.className = "links-memories__month";
      const monthTitle = document.createElement("h4");
      monthTitle.className = "links-memories__month-title";
      monthTitle.textContent = month.label;
      section.appendChild(monthTitle);
      for (const entry of month.entries) section.appendChild(renderEntry(entry.link, handlers));
      year.appendChild(section);
    }
    root.appendChild(year);
  }
  return root;
}
