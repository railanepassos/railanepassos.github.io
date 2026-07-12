import type { LinkRow } from "./links-repo";
import { resolveIconSrc } from "./icons";
import { categoryLabel, resolveCategory } from "./category";
import { formatScheduleChip } from "./schedule";

/**
 * Static fallback shown when Supabase is not configured yet, or when the
 * initial listLinks() call fails. Keeps the live page working after merge,
 * before the Supabase project exists. Kept as a single clearly-named constant
 * so it is easy to find and update.
 */
export const FALLBACK_LINKS: LinkRow[] = [
  {
    id: "fallback-museu-do-mar",
    url: "https://www.instagram.com/museudomar.aleixobelov/",
    label: "Museu do Mar",
    description: "Aleixobelov, AL · inspiração de viagem",
    icon_preset: "instagram",
    icon_url: null,
    category: "museu",
    sort_order: 0,
    scheduled_start: null,
    scheduled_end: null,
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
  },
];

/**
 * Build a single public `.link-card` anchor element, structurally identical to
 * the static cards in p/a8f3k2/index.html. All text goes through textContent
 * (never innerHTML) so user-controlled content is escaped by construction.
 */
export function renderPublicCard(link: LinkRow): HTMLAnchorElement {
  const card = document.createElement("a");
  card.className = "link-card";
  card.href = link.url;
  card.rel = "noopener noreferrer";
  card.target = "_blank";

  const img = document.createElement("img");
  img.src = resolveIconSrc(link);
  img.alt = "";
  img.width = 24;
  img.height = 24;
  card.appendChild(img);

  const text = document.createElement("span");
  text.className = "link-card__text";

  const label = document.createElement("span");
  label.className = "link-card__label";
  label.textContent = link.label;
  text.appendChild(label);

  const cat = document.createElement("span");
  cat.className = "link-card__category";
  cat.textContent = categoryLabel(resolveCategory(link));
  text.appendChild(cat);

  if (link.scheduled_start && link.scheduled_end) {
    const schedule = document.createElement("span");
    schedule.className = "link-card__schedule";
    schedule.textContent = formatScheduleChip(
      link.scheduled_start,
      link.scheduled_end
    );
    text.appendChild(schedule);
  }

  if (link.description && link.description.length > 0) {
    const desc = document.createElement("span");
    desc.className = "link-card__desc";
    desc.textContent = link.description;
    text.appendChild(desc);
  }

  card.appendChild(text);
  return card;
}

/**
 * Replace the contents of the list container with public cards for the given
 * links, in the order provided (caller sorts — typically scheduled first,
 * then most recent).
 */
export function renderPublicList(container: HTMLElement, links: LinkRow[]): void {
  container.replaceChildren();
  for (const link of links) {
    container.appendChild(renderPublicCard(link));
  }
}
