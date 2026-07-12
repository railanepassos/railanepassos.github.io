export const EDITOR_EMAIL_DOMAIN = "wte.com";

/**
 * Login field accepts only the local-part; domain is always `@wte.com`.
 * Anything after `@` in the input is ignored.
 */
export function composeEditorEmail(localPart: string): string {
  const raw = localPart.trim();
  if (!raw) return "";
  const at = raw.indexOf("@");
  const local = (at === -1 ? raw : raw.slice(0, at)).trim();
  if (!local) return "";
  return `${local}@${EDITOR_EMAIL_DOMAIN}`;
}
