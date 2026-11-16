import type { LinkRow } from "./links-repo";
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  resolveCategory,
  type Category,
} from "./category";
import { visibleListLinks } from "./sort-links";

/**
 * Pure view-model helpers for the feed / grid UI: sections, category counts,
 * chip toggling, client-side search and a friendlier title fallback.
 */

export type Section = "feed" | "agenda" | "done";

export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sentenceCase(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length === 0) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part.replace(/\+/g, " "));
  } catch {
    return part;
  }
}

/** Readable slug = has letters, is not an opaque id, and is long enough. */
function slugToWords(segment: string): string | null {
  const base = safeDecode(segment).replace(/\.[a-z0-9]{2,5}$/i, "");
  if (!/[a-zà-ÿ]{3,}/i.test(base)) return null;
  if (!/[-_ ]/.test(base) && base.length > 12) return null;
  const words = base.replace(/[-_]+/g, " ");
  return sentenceCase(words.toLowerCase());
}

function titleFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);

  const placeIdx = segments.indexOf("place");
  if (segments[0] === "maps" && placeIdx >= 0 && segments[placeIdx + 1]) {
    return safeDecode(segments[placeIdx + 1]!).trim();
  }

  const q = parsed.searchParams.get("q") ?? parsed.searchParams.get("query");
  if (q && q.trim().length > 0) return sentenceCase(q);

  if (/(^|\.)instagram\.com$/i.test(host)) {
    if (segments[0] === "p") return "Post do Instagram";
    if (segments[0] === "reel" || segments[0] === "reels") return "Reel do Instagram";
    if (segments[0] && segments.length === 1) return `@${segments[0]}`;
    return null;
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    const words = slugToWords(segments[i]!);
    if (words) return words;
  }
  return null;
}

/**
 * Title to show on cards: the stored label, unless it is blank or just the
 * bare domain (the quick-add fallback) — then derive something from the URL.
 */
export function displayTitle(link: Pick<LinkRow, "label" | "url">): string {
  const label = link.label.trim();
  const domain = linkDomain(link.url);
  if (label.length > 0 && label.toLowerCase() !== domain.toLowerCase()) {
    return label;
  }
  return titleFromUrl(link.url) ?? (label || domain);
}

function startMs(link: LinkRow): number {
  const t = link.scheduled_start ? Date.parse(link.scheduled_start) : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

function completedMs(link: LinkRow): number {
  const t = link.completed_at ? Date.parse(link.completed_at) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function isDone(link: LinkRow): boolean {
  return (link.status ?? "wishlist") === "done";
}

export function linksForSection(links: readonly LinkRow[], section: Section): LinkRow[] {
  if (section === "done") {
    return links.filter(isDone).sort((a, b) => completedMs(b) - completedMs(a));
  }
  if (section === "agenda") {
    return links
      .filter((l) => !isDone(l) && l.scheduled_start && l.scheduled_end)
      .sort((a, b) => startMs(a) - startMs(b));
  }
  return visibleListLinks(links);
}

export function sectionCounts(links: readonly LinkRow[]): Record<Section, number> {
  return {
    feed: linksForSection(links, "feed").length,
    agenda: linksForSection(links, "agenda").length,
    done: linksForSection(links, "done").length,
  };
}

export type CategoryCount = { category: Category; count: number };

export function categoryCounts(links: readonly LinkRow[]): CategoryCount[] {
  const counts = new Map<Category, number>();
  for (const link of links) {
    const c = resolveCategory(link);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return CATEGORY_OPTIONS.filter((c) => counts.has(c)).map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }));
}

export function toggleCategory(selected: readonly Category[], category: Category): Category[] {
  const next = new Set(selected);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return CATEGORY_OPTIONS.filter((c) => next.has(c));
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Every whitespace-separated term must appear in label/description/note/category. */
export function matchesSearch(link: LinkRow, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const category = resolveCategory(link);
  const haystack = normalize(
    [
      link.label,
      displayTitle(link),
      link.description ?? "",
      link.note ?? "",
      category,
      categoryLabel(category),
    ].join(" ")
  );
  return terms.every((t) => haystack.includes(t));
}

export function searchLinks<T extends LinkRow>(links: readonly T[], query: string): T[] {
  return links.filter((l) => matchesSearch(l, query));
}
