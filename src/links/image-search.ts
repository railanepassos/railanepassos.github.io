/**
 * "Buscar imagem": finds candidate card photos on pt.wikipedia.org.
 * Runs only when an authenticated editor taps the button. GET, no cookies or
 * credentials; the response is read as JSON data and never as HTML, and only
 * https://upload.wikimedia.org thumbnails survive parsing.
 */

export type ImageCandidate = { title: string; url: string };

export const IMAGE_SEARCH_TIMEOUT_MS = 8000;
export const IMAGE_SEARCH_LIMIT = 6;

const API = "https://pt.wikipedia.org/w/api.php";
const IMAGE_HOST = "upload.wikimedia.org";

export function buildImageSearchUrl(label: string, city: string): string {
  const query = [label, city]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrlimit: String(IMAGE_SEARCH_LIMIT),
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "800",
    format: "json",
    origin: "*",
  });
  return `${API}?${params.toString()}`;
}

function isWikimediaImage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === IMAGE_HOST && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function parseImageSearch(json: unknown): ImageCandidate[] {
  const pages = (json as { query?: { pages?: unknown } } | null)?.query?.pages;
  if (!pages || typeof pages !== "object") return [];
  const found: Array<ImageCandidate & { index: number }> = [];
  for (const page of Object.values(pages as Record<string, unknown>)) {
    if (!page || typeof page !== "object") continue;
    const { title, index, thumbnail } = page as {
      title?: unknown;
      index?: unknown;
      thumbnail?: { source?: unknown } | null;
    };
    const source = thumbnail && typeof thumbnail === "object" ? thumbnail.source : undefined;
    if (typeof title !== "string" || !isWikimediaImage(source)) continue;
    found.push({ title, url: source, index: typeof index === "number" ? index : Number.MAX_SAFE_INTEGER });
  }
  found.sort((a, b) => a.index - b.index);
  return found.map(({ title, url }) => ({ title, url }));
}

/** Rejects on network error, non-2xx, timeout (8 s) or when `signal` aborts. */
export async function searchImages(
  label: string,
  city: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ImageCandidate[]> {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctl.abort(), IMAGE_SEARCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(buildImageSearchUrl(label, city), {
      credentials: "omit",
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`image search failed: ${res.status}`);
    return parseImageSearch(await res.json());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
