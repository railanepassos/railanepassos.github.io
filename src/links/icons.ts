const PRESETS = new Set([
  "instagram",
  "github",
  "linkedin",
  "youtube",
  "google",
  "external-link",
  "arrow-left",
]);

export type IconPreset = string;

type IconFields = {
  url?: string | null;
  icon_url?: string | null;
  icon_preset?: string | null;
};

/** Host patterns → preset name (first match wins). */
const HOST_RULES: Array<{ re: RegExp; preset: string }> = [
  { re: /(^|\.)instagram\.com$/i, preset: "instagram" },
  { re: /(^|\.)instagr\.am$/i, preset: "instagram" },
  { re: /(^|\.)github\.com$/i, preset: "github" },
  { re: /(^|\.)linkedin\.com$/i, preset: "linkedin" },
  { re: /(^|\.)lnkd\.in$/i, preset: "linkedin" },
  { re: /(^|\.)youtube\.com$/i, preset: "youtube" },
  { re: /(^|\.)youtu\.be$/i, preset: "youtube" },
  { re: /(^|\.)google\.[a-z.]+$/i, preset: "google" },
  { re: /(^|\.)goo\.gl$/i, preset: "google" },
];

/**
 * Pick an icon preset from a post/place URL (host-based).
 * Unknown hosts → external-link.
 */
export function inferIconPreset(url: string): string {
  const host = extractHost(url);
  if (!host) {
    // Fallback: regex over the raw string when URL parsing fails.
    const lower = url.toLowerCase();
    if (/instagram\.com|instagr\.am/.test(lower)) return "instagram";
    if (/github\.com/.test(lower)) return "github";
    if (/linkedin\.com|lnkd\.in/.test(lower)) return "linkedin";
    if (/youtube\.com|youtu\.be/.test(lower)) return "youtube";
    if (/google\./.test(lower) || /goo\.gl/.test(lower)) return "google";
    return "external-link";
  }

  for (const rule of HOST_RULES) {
    if (rule.re.test(host)) return rule.preset;
  }
  return "external-link";
}

function extractHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    const m = url.match(/^(?:https?:\/\/)?([^/?#]+)/i);
    if (!m) return null;
    return m[1].replace(/^www\./i, "").toLowerCase();
  }
}

export function resolveIconSrc(fields: IconFields): string {
  if (fields.icon_url) return fields.icon_url;

  let preset = fields.icon_preset ?? null;
  if (!preset && fields.url) {
    preset = inferIconPreset(fields.url);
  }
  const name = preset && PRESETS.has(preset) ? preset : "external-link";
  return `/assets/icons/${name}.svg`;
}

export const ICON_PRESET_OPTIONS = [...PRESETS];
