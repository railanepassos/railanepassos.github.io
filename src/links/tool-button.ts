/** Small square glyph button (↑ ↓ ×) used by the reorderable lists. */
export function toolButton(glyph: string, ariaLabel: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "links-poses__tool";
  btn.setAttribute("aria-label", ariaLabel);
  btn.title = ariaLabel;
  btn.textContent = glyph;
  return btn;
}
