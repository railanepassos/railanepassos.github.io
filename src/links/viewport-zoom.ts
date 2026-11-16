/**
 * iOS Safari keeps a page zoomed in (after a pinch or a focus zoom) even when
 * the UI changes underneath, which left the "Como foi" sheet opening cropped.
 * Briefly adding `maximum-scale=1` to the viewport makes Safari snap back to
 * 1x; restoring the original content right after keeps pinch-zoom available.
 */
const RESTORE_DELAY_MS = 300;

let original: string | null = null;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

export function resetPageZoom(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  if (original === null) original = meta.getAttribute("content") ?? "";
  meta.setAttribute("content", `${original}, maximum-scale=1`);
  if (restoreTimer !== null) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => {
    meta.setAttribute("content", original ?? "");
    original = null;
    restoreTimer = null;
  }, RESTORE_DELAY_MS);
}
