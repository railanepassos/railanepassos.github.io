/** Default skeleton cards shown while the links list loads. */
export const SKELETON_CARD_COUNT = 6;

function bone(className: string): HTMLElement {
  const el = document.createElement("span");
  el.className = `links-skeleton__bone ${className}`;
  el.setAttribute("aria-hidden", "true");
  return el;
}

function createSkeletonCard(): HTMLElement {
  const card = document.createElement("div");
  card.className = "links-skeleton__card";

  const icon = bone("links-skeleton__bone--icon");
  const text = document.createElement("div");
  text.className = "links-skeleton__text";
  text.append(
    bone("links-skeleton__bone--title"),
    bone("links-skeleton__bone--line"),
    bone("links-skeleton__bone--chip")
  );

  card.append(icon, text);
  return card;
}

/** Replace container with shimmering list-card placeholders. */
export function renderLinksSkeleton(
  container: HTMLElement,
  count: number = SKELETON_CARD_COUNT
): void {
  container.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "links-skeleton";
  wrap.setAttribute("role", "status");
  wrap.setAttribute("aria-busy", "true");
  wrap.setAttribute("aria-label", "Carregando experiências");

  const n = Math.max(1, count);
  for (let i = 0; i < n; i++) {
    wrap.appendChild(createSkeletonCard());
  }
  container.appendChild(wrap);
}

/** Toolbar icon placeholders (add / filter / draw / sign-out). */
export function renderToolbarSkeleton(container: HTMLElement): void {
  container.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "links-skeleton links-skeleton--toolbar";
  wrap.setAttribute("role", "status");
  wrap.setAttribute("aria-busy", "true");
  wrap.setAttribute("aria-label", "Carregando ações");

  const row = document.createElement("div");
  row.className = "links-skeleton__toolbar-row";
  for (let i = 0; i < 5; i++) {
    row.appendChild(bone("links-skeleton__icon"));
  }
  wrap.appendChild(row);
  container.appendChild(wrap);
}

/** Toggle a shimmer overlay on a full-screen dialog while a request is in flight. */
export function setScreenBusy(dialog: HTMLElement, busy: boolean): void {
  let overlay = dialog.querySelector(
    ".links-skeleton-screen"
  ) as HTMLElement | null;

  if (busy) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "links-skeleton-screen";
      overlay.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i++) {
        overlay.appendChild(bone("links-skeleton__bone--screen-line"));
      }
      dialog.appendChild(overlay);
    }
    overlay.hidden = false;
    dialog.classList.add("links-admin-modal__dialog--busy");
    dialog.setAttribute("aria-busy", "true");
    return;
  }

  if (overlay) overlay.hidden = true;
  dialog.classList.remove("links-admin-modal__dialog--busy");
  dialog.removeAttribute("aria-busy");
}
