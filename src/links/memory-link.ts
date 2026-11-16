import { isHttpsUrl } from "./validate";

/**
 * "Como foi" memory link: an unlisted YouTube video or any album link
 * (Google Photos, ...). Pure: no DOM, no network. The detail view only ever
 * loads the thumbnail image; there is no iframe/embed, so the CSP is untouched.
 */

export type MemoryLink =
  | { kind: "youtube"; videoId: string; watchUrl: string; thumbnailUrl: string }
  | { kind: "album"; url: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PATH_PREFIXES = new Set(["shorts", "embed", "live", "v"]);

function isYoutubeHost(host: string): boolean {
  return host === "youtube.com" || host.endsWith(".youtube.com");
}

function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = parts[0] ?? null;
  } else if (isYoutubeHost(host)) {
    if (parts[0] === "watch") candidate = url.searchParams.get("v");
    else if (parts.length >= 2 && PATH_PREFIXES.has(parts[0])) candidate = parts[1];
  }
  return candidate !== null && VIDEO_ID.test(candidate) ? candidate : null;
}

export function parseMemoryLink(value: string | null | undefined): MemoryLink | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "" || !isHttpsUrl(trimmed)) return null;
  const videoId = youtubeVideoId(new URL(trimmed));
  if (videoId) {
    return {
      kind: "youtube",
      videoId,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
  return { kind: "album", url: trimmed };
}
