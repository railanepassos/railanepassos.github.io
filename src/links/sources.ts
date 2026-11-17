import { isHttpsUrl, normalizeUrlInput } from "./validate";

/** Fonte of an item, stored in links.sources (jsonb array). */
export type Source = { title: string; url: string };

/** Editable form row for one source. */
export type SourceDraft = { title: string; url: string };

// Mirrors migration 019 (links_sources_valid); tests/unit/sources.test.ts keeps them in sync.
export const MAX_SOURCES = 10;
export const SOURCE_TITLE_MAX = 120;
export const SOURCE_URL_MAX = 2000;
export const SOURCE_URL_TERM = "Link da fonte";

function isValidSource(title: string, url: string): boolean {
  const t = title.trim();
  return (
    t.length >= 1 &&
    t.length <= SOURCE_TITLE_MAX &&
    url.length <= SOURCE_URL_MAX &&
    !/\s/.test(url) &&
    isHttpsUrl(url)
  );
}

/** First problem found in the drafts (PT-BR, names the row), or null. Blank rows are fine. */
export function sourcesError(drafts: readonly SourceDraft[]): string | null {
  const filled = drafts.filter((d) => d.title.trim() !== "" || d.url.trim() !== "");
  if (filled.length > MAX_SOURCES) return `Use no máximo ${MAX_SOURCES} fontes.`;
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const title = draft.title.trim();
    const rawUrl = draft.url.trim();
    if (title === "" && rawUrl === "") continue;
    const n = i + 1;
    if (title === "") return `Fonte ${n}: informe o título.`;
    if (title.length > SOURCE_TITLE_MAX) {
      return `Fonte ${n}: o título deve ter no máximo ${SOURCE_TITLE_MAX} caracteres.`;
    }
    const url = normalizeUrlInput(rawUrl);
    if (url === "" || !isValidSource(title, url)) return `Fonte ${n}: ${SOURCE_URL_TERM} inválido.`;
  }
  return null;
}

/** Strict check of a payload about to be stored (no normalization): PT-BR problem or null. */
export function storedSourcesError(sources: readonly Source[]): string | null {
  if (sources.length > MAX_SOURCES) return `Use no máximo ${MAX_SOURCES} fontes.`;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]!;
    if (!isValidSource(s.title, s.url)) return `Fonte ${i + 1}: título ou link inválido.`;
  }
  return null;
}

/** Drafts -> payload. Blank rows are dropped; urls are normalized to https. */
export function draftsToSources(drafts: readonly SourceDraft[]): Source[] {
  const out: Source[] = [];
  for (const draft of drafts) {
    const title = draft.title.trim();
    const url = normalizeUrlInput(draft.url);
    if (title === "" && url === "") continue;
    out.push({ title, url });
  }
  return out;
}

/** Defensive read of the stored jsonb: only well-formed entries survive (max 10). */
export function readSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return [];
  const out: Source[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length !== 2 || !("title" in record) || !("url" in record)) continue;
    const { title, url } = record;
    if (typeof title !== "string" || typeof url !== "string") continue;
    if (!isValidSource(title, url)) continue;
    out.push({ title: title.trim(), url });
    if (out.length === MAX_SOURCES) break;
  }
  return out;
}

export function sourceDraftsFromSources(sources: readonly Source[]): SourceDraft[] {
  return sources.map((s) => ({ title: s.title, url: s.url }));
}

/** Key used to dedupe by URL: host case and a trailing slash do not matter. */
function urlKey(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host}${path}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

/** Current list plus proposed ones appended, deduped by URL, capped at the limit. */
export function mergeSources(current: readonly Source[], proposed: readonly Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const source of [...current, ...proposed]) {
    const key = urlKey(source.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
    if (out.length === MAX_SOURCES) break;
  }
  return out;
}
