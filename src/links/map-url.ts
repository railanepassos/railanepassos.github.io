const MAPS_SEARCH = "https://www.google.com/maps/search/?api=1&query=";

/**
 * Plain Google Maps search URL (no API key, no cost) built from the free-text
 * address and city. Returns null when there is nothing to search for.
 */
export function buildMapUrl(
  address: string | null | undefined,
  city: string | null | undefined
): string | null {
  const parts = [address, city]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  return MAPS_SEARCH + encodeURIComponent(parts.join(", "));
}
