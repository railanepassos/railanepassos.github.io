const PRESETS = new Set([
  "instagram",
  "github",
  "linkedin",
  "youtube",
  "external-link",
  "arrow-left",
]);

type IconFields = { icon_url?: string | null; icon_preset?: string | null };

export function resolveIconSrc(fields: IconFields): string {
  if (fields.icon_url) return fields.icon_url;
  const preset = fields.icon_preset ?? "external-link";
  const name = PRESETS.has(preset) ? preset : "external-link";
  return `/assets/icons/${name}.svg`;
}

export const ICON_PRESET_OPTIONS = [...PRESETS];
