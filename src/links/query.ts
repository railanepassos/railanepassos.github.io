/**
 * Search syntax of the feed (Phase 2). Pure: no DOM, no I/O.
 *
 * The text typed in the search box is the single source of truth for every
 * filter. Tapping a tag/person chip edits that same text (`toggleFilter`), so
 * tapping and typing the same filter always give the same result.
 *
 * Syntax (tokens are separated by whitespace; everything combines with AND;
 * comparisons ignore case and accents):
 *
 *   #tag               link has this tag (exact tag, compared by key)
 *   @maria             link has a person named exactly "maria" (the whole
 *                      name, not a prefix: "Alana" never matches "Alana Souza")
 *   @"maria clara"     multi-word person, exact full name (quotes keep the
 *                      space). Chip taps emit `@word` for single-word names
 *                      and this quoted form only when the name has spaces.
 *   cidade:Salvador    city contains the text; multi-word: cidade:"Porto Seguro"
 *   custo<50           cost strictly below 50. The cost is free text; the first
 *                      number found is used ("R$ 1.200,50" -> 1200.5). A link
 *                      with no number in its cost never matches this filter.
 *   nota>=4            rated 4 or more (N from 1 to 5). Unrated places never
 *                      match; an invalid N (`nota>=9`, `nota>=x`) is ignored.
 *   palavra            free text over title, description, note, category,
 *                      city, address, cost, dossier, itinerary, tags and
 *                      people; "frase exata" in quotes matches the phrase.
 *
 * Incomplete tokens typed so far (`#`, `@`, `cidade:`, `custo<`) are ignored.
 * An unclosed quote (`@"maria cl`) keeps what was typed so far.
 */
import { categoryLabel, resolveCategory } from "./category";
import { displayTitle } from "./feed";
import type { LinkRow } from "./links-repo";
import { hasAllTags, normalizeTag, tagKey } from "./tags";
import { fold } from "./keyed-list";
import { meetsMinRating } from "./ranking";
import { hasAllPeople, normalizePerson, personKey } from "./people";

export type FilterKind = "tag" | "person" | "city" | "cost" | "rating";

/** An active structured filter, with the span of its token in the typed text. */
export type FilterChip = {
  kind: FilterKind;
  /** Text shown on the removable chip. */
  label: string;
  /** Comparison key (tag key, person key, folded city, cost as text). */
  key: string;
  start: number;
  end: number;
};

export type ParsedQuery = {
  terms: string[];
  /** Tag keys. */
  tags: string[];
  /** Person keys (whole name, folded). */
  people: string[];
  city?: string;
  costMax?: number;
  /** Minimum rating (1-5) from `nota>=N`. */
  minRating?: number;
  chips: FilterChip[];
};

/** Whitespace-separated tokens; a quoted stretch may contain spaces. */
function tokenize(text: string): Array<{ raw: string; start: number; end: number }> {
  const out: Array<{ raw: string; start: number; end: number }> = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i += 1;
      continue;
    }
    const start = i;
    let quoted = false;
    while (i < text.length && (quoted || !/\s/.test(text[i]))) {
      if (text[i] === '"') quoted = !quoted;
      i += 1;
    }
    out.push({ raw: text.slice(start, i), start, end: i });
  }
  return out;
}

/** `"a b"` -> a b (closed); `"a b` -> a b (open); `ab` -> ab. */
function unquote(value: string): { value: string; closed: boolean } {
  if (!value.startsWith('"')) return { value, closed: false };
  const closed = value.length > 1 && value.endsWith('"');
  return { value: value.slice(1, closed ? -1 : undefined).trim(), closed };
}

/** First number of a free-text cost, pt-BR aware; null when there is none. */
export function costNumber(text: string | null | undefined): number | null {
  const found = (text ?? "").match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/);
  if (!found) return null;
  const raw = found[0];
  const normalized = /^\d{1,3}(?:\.\d{3})+/.test(raw)
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseQuery(text: string): ParsedQuery {
  const query: ParsedQuery = { terms: [], tags: [], people: [], chips: [] };
  for (const { raw, start, end } of tokenize(text)) {
    const chip = (kind: FilterKind, label: string, key: string): void => {
      query.chips.push({ kind, label, key, start, end });
    };
    if (raw.startsWith("#")) {
      const key = tagKey(raw.slice(1));
      if (key === "") continue;
      if (!query.tags.includes(key)) query.tags.push(key);
      chip("tag", `#${normalizeTag(raw)}`, key);
    } else if (raw.startsWith("@")) {
      const { value } = unquote(raw.slice(1));
      const key = personKey(value);
      if (key === "") continue;
      if (!query.people.includes(key)) query.people.push(key);
      chip("person", `@${normalizePerson(value)}`, key);
    } else if (/^cidade:/i.test(raw)) {
      const { value } = unquote(raw.slice("cidade:".length));
      const key = fold(value).trim();
      if (key === "") continue;
      query.city = key;
      chip("city", `cidade: ${value}`, key);
    } else if (/^custo</i.test(raw)) {
      const rest = raw.slice("custo<".length);
      if (rest === "") continue;
      if (/^\d+(?:[.,]\d+)?$/.test(rest)) {
        const n = Number(rest.replace(",", "."));
        query.costMax = query.costMax === undefined ? n : Math.min(query.costMax, n);
        chip("cost", `custo < ${n}`, String(n));
      } else {
        query.terms.push(fold(raw));
      }
    } else if (/^nota>=/i.test(raw)) {
      const rest = raw.slice("nota>=".length);
      if (!/^[1-5]$/.test(rest)) continue;
      const n = Number(rest);
      query.minRating = query.minRating === undefined ? n : Math.max(query.minRating, n);
      chip("rating", `nota ≥ ${n}`, String(n));
    } else if (raw.startsWith('"')) {
      const { value } = unquote(raw);
      const phrase = fold(value).trim();
      if (phrase !== "") query.terms.push(phrase);
    } else {
      query.terms.push(fold(raw));
    }
  }
  return query;
}

function haystack(link: LinkRow): string {
  const category = resolveCategory(link);
  return fold(
    [
      link.label,
      displayTitle(link),
      link.description ?? "",
      link.note ?? "",
      category,
      categoryLabel(category),
      link.city ?? "",
      link.address ?? "",
      link.cost_text ?? "",
      link.dossier ?? "",
      link.itinerary ?? "",
      ...(link.tags ?? []),
      ...(link.people ?? []),
    ].join(" ")
  );
}

export function matches(link: LinkRow, query: ParsedQuery): boolean {
  if (!hasAllTags(link, query.tags)) return false;
  if (!hasAllPeople(link, query.people)) return false;
  if (query.city !== undefined && !fold(link.city ?? "").includes(query.city)) return false;
  if (query.costMax !== undefined) {
    const cost = costNumber(link.cost_text);
    if (cost === null || cost >= query.costMax) return false;
  }
  if (query.minRating !== undefined && !meetsMinRating(link, query.minRating)) return false;
  if (query.terms.length === 0) return true;
  const text = haystack(link);
  return query.terms.every((t) => text.includes(t));
}

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function personToken(name: string): string {
  const clean = normalizePerson(name).replace(/"/g, "");
  return /\s/.test(clean) ? `@"${clean}"` : `@${clean}`;
}

/** Removes the chip's token from the typed text. */
export function removeChip(text: string, chip: FilterChip): string {
  return tidy(text.slice(0, chip.start) + " " + text.slice(chip.end));
}

/**
 * Chip tap: removes the tag/person token when already typed, else appends it.
 * The token is exactly what typing the same filter would produce: `#tag`,
 * `@word`, or `@"two words"` for names with spaces.
 */
export function toggleFilter(text: string, kind: "tag" | "person", name: string): string {
  const key = kind === "tag" ? tagKey(name) : personKey(name);
  if (key === "") return text;
  const active = parseQuery(text).chips.filter(
    (c) => c.kind === kind && c.key === key
  );
  if (active.length > 0) {
    let next = text;
    for (const chip of [...active].reverse()) next = removeChip(next, chip);
    return next;
  }
  return tidy(`${text} ${kind === "tag" ? `#${normalizeTag(name)}` : personToken(name)}`);
}

/** Replaces (or removes, with null) the `nota>=N` token of the typed text. */
export function setMinRating(text: string, min: number | null): string {
  let next = text;
  const existing = parseQuery(next).chips.filter((c) => c.kind === "rating");
  for (const chip of [...existing].reverse()) next = removeChip(next, chip);
  return min === null ? next : tidy(`${next} nota>=${min}`);
}
