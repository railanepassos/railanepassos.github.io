import type { LinkRow } from "./links-repo";

const INSTAGRAM_POST = /\/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/;

/**
 * Comparison key for a link: the shortcode for an Instagram post, reel or tv
 * link, otherwise host (lowercase, no `www.`) plus path without trailing slash.
 * Query and fragment are ignored. Blank or invalid links have no key.
 */
export function linkKey(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "instagram.com") {
    const code = INSTAGRAM_POST.exec(parsed.pathname)?.[1];
    if (code) return `instagram:${code}`;
  }
  return `${host}${parsed.pathname.replace(/\/+$/, "")}`;
}

/** The first item whose link or source post matches either link of the new item. */
export function findDuplicate(
  links: readonly LinkRow[],
  candidate: { url: string; source_url: string }
): LinkRow | null {
  const wanted = new Set(
    [linkKey(candidate.url), linkKey(candidate.source_url)].filter((k): k is string => k !== null)
  );
  if (wanted.size === 0) return null;
  return (
    links.find((l) =>
      [linkKey(l.url), linkKey(l.source_url)].some((k) => k !== null && wanted.has(k))
    ) ?? null
  );
}
