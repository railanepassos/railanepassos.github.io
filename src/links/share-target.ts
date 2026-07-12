import { isHttpsUrl } from "./validate";

/**
 * Resolves the shared URL from a Web Share Target GET request
 * (`?title=&text=&url=`). Android share sheets often only populate
 * `text` (sometimes with surrounding text), so this falls back to
 * extracting the first https URL found in `text`, then `title`.
 */
export function pickSharedUrl(params: URLSearchParams): string | null {
  const direct = params.get("url");
  if (direct && isHttpsUrl(direct)) return direct;

  const fromText = extractHttpsUrl(params.get("text"));
  if (fromText) return fromText;

  const fromTitle = extractHttpsUrl(params.get("title"));
  if (fromTitle) return fromTitle;

  return null;
}

function extractHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/https:\/\/\S+/);
  if (!match) return null;
  return match[0].replace(/[.,;:!?)\]}]+$/, "");
}
