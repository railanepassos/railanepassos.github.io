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
 * Form-facing check for any optional https URL field (source post, poses...).
 * Returns a PT-BR message naming the field, or null when the value is empty or
 * a valid https URL. `term` is the capitalised field name used in the message.
 */
export function httpsUrlError(value: string, term: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || isHttpsUrl(trimmed)) return null;
  return `${term} precisa ser uma URL https válida.`;
}

/** Empty/absent values are valid (optional field); anything else must be https. */
export function isOptionalHttpsUrl(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  return isHttpsUrl(value);
}
