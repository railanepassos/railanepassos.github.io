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

/** Empty/absent values are valid (optional field); anything else must be https. */
export function isOptionalHttpsUrl(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  return isHttpsUrl(value);
}
