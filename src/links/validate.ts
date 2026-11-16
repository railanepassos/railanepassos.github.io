export function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function deriveLabelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Form-facing check for any optional URL field (source post, poses...). The
 * value is normalized first, so "google.com" is fine. Returns a PT-BR message
 * naming the field, or null when the value is empty or fixable into a valid
 * https URL. `term` is the capitalised field name used in the message.
 */
export function httpsUrlError(value: string, term: string): string | null {
  const normalized = normalizeUrlInput(value);
  if (normalized === "" || isHttpsUrl(normalized)) return null;
  return `${term} inválido.`;
}

/** A host worth fixing is dotted, with no spaces, userinfo or empty labels. */
function looksLikeHost(rest: string): boolean {
  const authority = rest.split(/[/?#]/, 1)[0] ?? "";
  const host = authority.replace(/:\d+$/, "");
  if (host === "" || /[\s@:]/.test(host)) return false;
  return host.includes(".") && !host.startsWith(".") && !host.endsWith(".");
}

/**
 * Turns what a person types into a candidate https URL: trims, adds https://
 * when there is no scheme, upgrades http:// and //host. Never adds "www".
 * Input that cannot become a valid https URL (spaces, no dot in the host,
 * other schemes) is returned trimmed but otherwise unchanged, so validation
 * still reports it.
 */
export function normalizeUrlInput(raw: string): string {
  const value = raw.trim();
  if (value === "") return "";
  let rest: string;
  if (/^https:\/\//i.test(value)) rest = value.slice(8);
  else if (/^http:\/\//i.test(value)) rest = value.slice(7);
  else if (value.startsWith("//")) rest = value.slice(2);
  else if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[^/?#:]+:\d+(?:[/?#]|$)/.test(value)) return value;
  else rest = value;
  if (!looksLikeHost(rest)) return value;
  const candidate = `https://${rest}`;
  return isHttpsUrl(candidate) ? candidate : value;
}

/** Empty/absent values are valid (optional field); anything else must be https. */
export function isOptionalHttpsUrl(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  return isHttpsUrl(value);
}

/**
 * On blur, writes the normalized URL back into the field so the person sees
 * what will be saved. `after` runs once the value has been rewritten.
 */
export function normalizeUrlOnBlur(input: HTMLInputElement, after?: () => void): void {
  input.addEventListener("blur", () => {
    const normalized = normalizeUrlInput(input.value);
    if (normalized !== input.value) {
      input.value = normalized;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    after?.();
  });
}
