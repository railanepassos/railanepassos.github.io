import type { LinkRow, CreateLinkInput, UpdateLinkPatch } from "./links-repo";
import { resolveIconSrc, inferIconPreset } from "./icons";
import {
  CATEGORY_OPTIONS,
  inferCategory,
  resolveCategory,
  categoryLabel,
  type Category,
} from "./category";
import { isHttpsUrl } from "./validate";
import { composeEditorEmail, EDITOR_EMAIL_DOMAIN } from "./editor-email";
import {
  ACTIONS_WIDTH_PX,
  isTapGesture,
  shouldAbortForScroll,
  shouldStartSwipe,
  snapSwipeOffset,
} from "./swipe";
import { buildSpinLabels } from "./pick-random";
import { setScreenBusy } from "./skeleton";
import { formatScheduleChip, formatScheduleLabel } from "./schedule";

/**
 * DOM building blocks for the authenticated admin experience:
 *   - a discreet "Entrar" button (shown when logged out)
 *   - full-screen login / form / delete screens (mobile-first)
 *   - a toolbar ("Novo link" / "Sair")
 *   - admin link cards (tap to view, swipe edit/delete)
 *
 * Every element is created via document.createElement + textContent. No
 * innerHTML with user data, no inline style attributes, no injected <style>
 * tags. Visibility is toggled via the `hidden` attribute / CSS classes only,
 * to satisfy the page CSP (style-src 'self', script-src 'self').
 */

function syncBodyScreenLock(): void {
  const anyOpen =
    document.querySelector(".links-admin-modal:not([hidden])") != null ||
    document.querySelector(".links-filter-sheet:not([hidden])") != null;
  document.body.classList.toggle("links-screen-open", anyOpen);
}

type ScreenChrome = {
  overlay: HTMLElement;
  dialog: HTMLElement;
  title: HTMLHeadingElement;
  backBtn: HTMLButtonElement;
};

/** Full-screen shell with Voltar header (modal on wide desktop via CSS). */
function createScreenChrome(
  titleId: string,
  titleText: string,
  role: "dialog" | "alertdialog"
): ScreenChrome {
  const overlay = document.createElement("div");
  overlay.className = "links-admin-modal";
  overlay.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "links-admin-modal__dialog";
  dialog.setAttribute("role", role);
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", titleId);

  const header = document.createElement("header");
  header.className = "links-admin-screen__header";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "links-admin-screen__back";
  backBtn.textContent = "Voltar";

  const title = document.createElement("h2");
  title.className = "links-admin-modal__title links-admin-screen__title";
  title.id = titleId;
  title.textContent = titleText;

  header.append(backBtn, title);
  dialog.appendChild(header);
  overlay.appendChild(dialog);

  return { overlay, dialog, title, backBtn };
}

// ---------------------------------------------------------------------------
// Values collected from the create/edit form.
// ---------------------------------------------------------------------------

export type LinkFormValues = {
  url: string;
  label: string;
  description: string;
};

// ---------------------------------------------------------------------------
// "Entrar" button (discreet). Lives in #links-admin-root when logged out.
// ---------------------------------------------------------------------------

export function createLoginButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "links-login-button";
  btn.textContent = "Entrar";
  btn.addEventListener("click", onClick);
  return btn;
}

// ---------------------------------------------------------------------------
// Login modal.
// ---------------------------------------------------------------------------

export type LoginModalHandle = {
  element: HTMLElement;
  open: () => void;
  close: () => void;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
};

export function createLoginModal(
  onSubmit: (email: string, password: string) => void
): LoginModalHandle {
  let previouslyFocused: HTMLElement | null = null;

  const { overlay, dialog, backBtn } = createScreenChrome(
    "links-login-title",
    "Entrar na lista",
    "dialog"
  );

  const intro = document.createElement("p");
  intro.className = "links-admin-modal__body";
  intro.textContent =
    "Acesso de editor para adicionar, reordenar e revisar experiências da bucket list.";

  const form = document.createElement("form");
  form.className = "links-admin-form links-admin-form--screen";
  form.noValidate = true;

  const emailField = labelledInput("links-login-email", "Usuário", "text");
  emailField.input.autocomplete = "username";
  emailField.input.required = true;
  emailField.input.placeholder = "nome";
  emailField.input.setAttribute("inputmode", "text");
  emailField.input.setAttribute("autocapitalize", "off");
  emailField.input.setAttribute("spellcheck", "false");
  emailField.input.setAttribute(
    "aria-describedby",
    "links-login-email-domain"
  );

  const emailRow = document.createElement("div");
  emailRow.className = "links-admin-form__email-row";
  emailField.input.classList.add("links-admin-form__control--local-part");
  const domainSuffix = document.createElement("span");
  domainSuffix.id = "links-login-email-domain";
  domainSuffix.className = "links-admin-form__email-domain";
  domainSuffix.textContent = `@${EDITOR_EMAIL_DOMAIN}`;
  emailField.input.replaceWith(emailRow);
  emailRow.append(emailField.input, domainSuffix);

  const passwordField = labelledInput("links-login-password", "Senha", "password");
  passwordField.input.autocomplete = "current-password";
  passwordField.input.required = true;

  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "links-admin-form__actions links-admin-form__actions--sticky";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "links-admin-button links-admin-button--primary links-admin-button--block";
  submitBtn.textContent = "Entrar";

  actions.append(submitBtn);
  form.append(emailField.wrapper, passwordField.wrapper, error, actions);
  dialog.append(intro, form);

  function close(): void {
    overlay.hidden = true;
    error.hidden = true;
    error.textContent = "";
    form.reset();
    syncBodyScreenLock();
    if (previouslyFocused) {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
  }

  function open(): void {
    previouslyFocused = document.activeElement as HTMLElement | null;
    overlay.hidden = false;
    syncBodyScreenLock();
    error.hidden = true;
    error.textContent = "";
    emailField.input.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = composeEditorEmail(emailField.input.value);
    if (!email) {
      error.hidden = false;
      error.textContent = "Informe o usuário do e-mail.";
      return;
    }
    onSubmit(email, passwordField.input.value);
  });

  backBtn.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return {
    element: overlay,
    open,
    close,
    setError(message: string) {
      error.textContent = message;
      error.hidden = false;
    },
    setBusy(busy: boolean) {
      submitBtn.disabled = busy;
      backBtn.disabled = busy;
      setScreenBusy(dialog, busy);
    },
  };
}

// ---------------------------------------------------------------------------
// Toolbar (authenticated): icon actions — add / filter / sign out.
// ---------------------------------------------------------------------------

function strokeIcon(pathD: string | string[]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "22");
  svg.setAttribute("height", "22");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const parts = Array.isArray(pathD) ? pathD : [pathD];
  for (const d of parts) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** Plus — “nova experiência” (padrão Instagram / apps de lista). */
function iconPlus(): SVGSVGElement {
  return strokeIcon("M12 5v14M5 12h14");
}

/** Funil — filtrar. */
function iconFilter(): SVGSVGElement {
  return strokeIcon("M22 3H2l8 9.46V19l4 2v-8.54L22 3z");
}

/** Sair / logout. */
function iconLogout(): SVGSVGElement {
  return strokeIcon([
    "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
    "M16 17l5-5-5-5",
    "M21 12H9",
  ]);
}

/** Dados / shuffle — sorteio. */
function iconShuffle(): SVGSVGElement {
  return strokeIcon([
    "M16 3h5v5",
    "M4 20L21 3",
    "M21 16v5h-5",
    "M15 15l6 6",
    "M4 4l5 5",
  ]);
}

export function createToolbar(
  onNew: () => void,
  onSignOut: () => void,
  onFilter: () => void,
  onDraw: () => void,
  activeCategories: readonly Category[] = []
): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "links-admin-toolbar";

  const row = document.createElement("div");
  row.className = "links-admin-toolbar__row";

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className =
    "links-admin-button links-admin-button--primary links-admin-button--icon";
  newBtn.setAttribute("aria-label", "Nova experiência");
  newBtn.title = "Nova experiência";
  newBtn.appendChild(iconPlus());
  newBtn.addEventListener("click", onNew);

  const filterBtn = document.createElement("button");
  filterBtn.type = "button";
  filterBtn.className =
    "links-admin-button links-admin-button--ghost links-admin-button--icon links-admin-button--filter";
  const filterLabel =
    activeCategories.length > 0
      ? `Filtrar por categoria (${activeCategories.length}): ${activeCategories
          .map((c) => categoryLabel(c))
          .join(", ")}`
      : "Filtrar por categoria";
  filterBtn.setAttribute("aria-label", filterLabel);
  filterBtn.title = filterLabel;
  if (activeCategories.length > 0) {
    filterBtn.classList.add("links-admin-button--filter-active");
  }
  filterBtn.appendChild(iconFilter());
  filterBtn.addEventListener("click", onFilter);

  const drawBtn = document.createElement("button");
  drawBtn.type = "button";
  drawBtn.className =
    "links-admin-button links-admin-button--ghost links-admin-button--icon";
  drawBtn.setAttribute("aria-label", "Sortear experiência");
  drawBtn.title = "Sortear experiência";
  drawBtn.appendChild(iconShuffle());
  drawBtn.addEventListener("click", onDraw);

  const signOutBtn = document.createElement("button");
  signOutBtn.type = "button";
  signOutBtn.className =
    "links-admin-button links-admin-button--ghost links-admin-button--icon";
  signOutBtn.setAttribute("aria-label", "Sair");
  signOutBtn.title = "Sair";
  signOutBtn.appendChild(iconLogout());
  signOutBtn.addEventListener("click", onSignOut);

  row.append(newBtn, filterBtn, drawBtn, signOutBtn);

  const tip = document.createElement("p");
  tip.className = "links-admin-tip";
  tip.textContent =
    "Toque para ver · Deslize → editar · ← excluir · Filtrar · Sortear";

  toolbar.append(row, tip);
  return toolbar;
}

// ---------------------------------------------------------------------------
// Admin card: tap to view, swipe → edit / ← delete.
// ---------------------------------------------------------------------------

export type AdminCardCallbacks = {
  onView: (link: LinkRow) => void;
  onEdit: (link: LinkRow) => void;
  onDelete: (link: LinkRow) => void;
};

let openSwipeContent: HTMLElement | null = null;
let openSwipeOffset = 0;

function setSwipeOffset(content: HTMLElement, offset: number): void {
  content.style.transform = offset === 0 ? "" : `translateX(${offset}px)`;
  content.classList.toggle("swipe-row__content--open", offset !== 0);
}

function closeOpenSwipe(): void {
  if (!openSwipeContent) return;
  setSwipeOffset(openSwipeContent, 0);
  openSwipeContent = null;
  openSwipeOffset = 0;
}

export function renderAdminCard(
  link: LinkRow,
  cb: AdminCardCallbacks
): HTMLElement {
  const row = document.createElement("div");
  row.className = "swipe-row";
  row.dataset.id = link.id;

  const editActions = document.createElement("div");
  editActions.className = "swipe-row__actions swipe-row__actions--edit";
  editActions.setAttribute("aria-hidden", "true");

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "swipe-row__action swipe-row__action--edit";
  editBtn.textContent = "Editar";
  editBtn.setAttribute("aria-label", "Editar experiência");
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeOpenSwipe();
    cb.onEdit(link);
  });
  editActions.append(editBtn);

  const deleteActions = document.createElement("div");
  deleteActions.className = "swipe-row__actions swipe-row__actions--delete";
  deleteActions.setAttribute("aria-hidden", "true");

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "swipe-row__action swipe-row__action--delete";
  deleteBtn.textContent = "Excluir";
  deleteBtn.setAttribute("aria-label", "Excluir experiência");
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeOpenSwipe();
    cb.onDelete(link);
  });
  deleteActions.append(deleteBtn);

  const content = document.createElement("div");
  content.className = "swipe-row__content link-card link-card--admin";
  content.setAttribute("role", "button");
  content.tabIndex = 0;
  content.setAttribute("aria-label", `Ver ${link.label}`);

  const img = document.createElement("img");
  img.src = resolveIconSrc(link);
  img.alt = "";
  img.width = 24;
  img.height = 24;
  content.appendChild(img);

  const textEl = document.createElement("span");
  textEl.className = "link-card__text";

  const label = document.createElement("span");
  label.className = "link-card__label";
  label.textContent = link.label;
  textEl.appendChild(label);

  const cat = document.createElement("span");
  cat.className = "link-card__category";
  cat.textContent = categoryLabel(resolveCategory(link));
  textEl.appendChild(cat);

  if (link.scheduled_start && link.scheduled_end) {
    const schedule = document.createElement("span");
    schedule.className = "link-card__schedule";
    schedule.textContent = formatScheduleChip(
      link.scheduled_start,
      link.scheduled_end
    );
    textEl.appendChild(schedule);
  }

  if (link.description && link.description.length > 0) {
    const desc = document.createElement("span");
    desc.className = "link-card__desc";
    desc.textContent = link.description;
    textEl.appendChild(desc);
  }
  content.appendChild(textEl);

  const keyActions = document.createElement("div");
  keyActions.className = "link-card__actions";

  const deleteKeyBtn = iconButton("Excluir", "Excluir experiência");
  deleteKeyBtn.classList.add("link-card__action--delete");
  deleteKeyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    cb.onDelete(link);
  });

  keyActions.append(deleteKeyBtn);
  content.appendChild(keyActions);

  content.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      closeOpenSwipe();
      cb.onView(link);
    }
  });

  wireSwipe(content, link, cb);

  row.append(editActions, deleteActions, content);
  return row;
}

function wireSwipe(
  content: HTMLElement,
  link: LinkRow,
  cb: AdminCardCallbacks
): void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let baseOffset = 0;
  let offset = 0;
  let mode: "undecided" | "swipe" | "dead" = "undecided";
  let lastX = 0;
  let lastT = 0;
  let velocityX = 0;
  let movedPx = 0;
  let suppressClick = false;

  function beginSwipe(ev: PointerEvent, dx: number): void {
    mode = "swipe";
    suppressClick = true;
    content.style.touchAction = "none";
    try {
      content.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    if (openSwipeContent && openSwipeContent !== content) {
      closeOpenSwipe();
      baseOffset = 0;
    }
    offset = Math.min(
      ACTIONS_WIDTH_PX,
      Math.max(-ACTIONS_WIDTH_PX, baseOffset + dx)
    );
    setSwipeOffset(content, offset);
  }

  content.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest(".link-card__actions")) return;

    pointerId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    lastX = startX;
    lastT = performance.now();
    velocityX = 0;
    movedPx = 0;
    mode = "undecided";
    suppressClick = false;
    baseOffset = openSwipeContent === content ? openSwipeOffset : 0;
    offset = baseOffset;
    content.classList.add("swipe-row__content--dragging");
    window.getSelection()?.removeAllRanges();
  });

  const onPointerMove = (ev: PointerEvent): void => {
    if (pointerId !== ev.pointerId) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    movedPx = Math.hypot(dx, dy);
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    velocityX = (ev.clientX - lastX) / dt;
    lastX = ev.clientX;
    lastT = now;

    if (mode === "undecided") {
      if (shouldStartSwipe(dx, dy)) {
        beginSwipe(ev, dx);
        ev.preventDefault();
        return;
      }
      if (shouldAbortForScroll(dx, dy)) {
        mode = "dead";
        suppressClick = true;
        content.classList.remove("swipe-row__content--dragging");
        pointerId = null;
        return;
      }
    }

    if (mode === "swipe") {
      offset = Math.min(
        ACTIONS_WIDTH_PX,
        Math.max(-ACTIONS_WIDTH_PX, baseOffset + dx)
      );
      setSwipeOffset(content, offset);
      ev.preventDefault();
    }
  };

  content.addEventListener("pointermove", onPointerMove, { passive: false });

  function finish(ev: PointerEvent): void {
    if (pointerId !== ev.pointerId) return;
    content.classList.remove("swipe-row__content--dragging");
    try {
      content.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    pointerId = null;

    if (mode === "swipe") {
      const snapped = snapSwipeOffset(offset, ACTIONS_WIDTH_PX, velocityX);
      setSwipeOffset(content, snapped);
      if (snapped !== 0) {
        openSwipeContent = content;
        openSwipeOffset = snapped;
      } else {
        openSwipeContent = null;
        openSwipeOffset = 0;
      }
      content.style.touchAction = "";
    } else if (mode === "undecided" && isTapGesture(movedPx)) {
      if (openSwipeContent === content) {
        closeOpenSwipe();
      } else {
        closeOpenSwipe();
        cb.onView(link);
      }
    }
    mode = "undecided";
    content.style.touchAction = "";
  }

  content.addEventListener("pointerup", finish);
  content.addEventListener("pointercancel", (ev) => {
    suppressClick = true;
    finish(ev);
  });

  content.addEventListener("click", (ev) => {
    if (suppressClick) {
      ev.preventDefault();
      ev.stopPropagation();
      suppressClick = false;
    }
  });

  content.addEventListener("contextmenu", (ev) => {
    if (mode === "swipe") ev.preventDefault();
  });
}

// ---------------------------------------------------------------------------
// Category filter sheet (mobile-first)
// ---------------------------------------------------------------------------

export type CategoryFilterHandle = {
  element: HTMLElement;
  open: (current: readonly Category[]) => void;
  close: () => void;
};

export function createCategoryFilterSheet(
  onApply: (categories: Category[]) => void
): CategoryFilterHandle {
  const overlay = document.createElement("div");
  overlay.className = "links-filter-sheet";
  overlay.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "links-filter-sheet__backdrop";
  backdrop.setAttribute("aria-label", "Fechar filtro");

  const panel = document.createElement("div");
  panel.className = "links-filter-sheet__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "links-filter-title");

  const title = document.createElement("h2");
  title.className = "links-filter-sheet__title";
  title.id = "links-filter-title";
  title.textContent = "Filtrar por categoria";

  const hint = document.createElement("p");
  hint.className = "links-filter-sheet__hint";
  hint.textContent = "Selecione uma ou mais. Vazio = todas.";

  const list = document.createElement("div");
  list.className = "links-filter-sheet__list";

  const actions = document.createElement("div");
  actions.className = "links-filter-sheet__actions";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "links-admin-button links-admin-button--ghost";
  clearBtn.textContent = "Limpar";

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className =
    "links-admin-button links-admin-button--primary links-admin-button--block";
  applyBtn.textContent = "Aplicar";

  actions.append(clearBtn, applyBtn);

  let draft = new Set<Category>();

  function renderOptions(): void {
    list.replaceChildren();
    for (const value of CATEGORY_OPTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "links-filter-sheet__option";
      btn.setAttribute("aria-pressed", draft.has(value) ? "true" : "false");
      if (draft.has(value)) {
        btn.classList.add("links-filter-sheet__option--active");
      }
      btn.textContent = categoryLabel(value);
      btn.addEventListener("click", () => {
        if (draft.has(value)) draft.delete(value);
        else draft.add(value);
        renderOptions();
      });
      list.appendChild(btn);
    }
  }

  function close(): void {
    overlay.hidden = true;
    syncBodyScreenLock();
  }

  function open(current: readonly Category[]): void {
    draft = new Set(current);
    renderOptions();
    overlay.hidden = false;
    syncBodyScreenLock();
  }

  clearBtn.addEventListener("click", () => {
    draft = new Set();
    renderOptions();
  });

  applyBtn.addEventListener("click", () => {
    const selected = CATEGORY_OPTIONS.filter((c) => draft.has(c));
    close();
    onApply(selected);
  });

  panel.append(title, hint, list, actions);
  overlay.append(backdrop, panel);
  backdrop.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return { element: overlay, open, close };
}

// ---------------------------------------------------------------------------
// Draw / sorteio result sheet (A + light reel animation)
// ---------------------------------------------------------------------------

const REEL_ITEM_PX = 52;
const REEL_SPIN_MS = 1400;

export type DrawSheetHandle = {
  element: HTMLElement;
  open: (link: LinkRow, pool?: readonly LinkRow[]) => void;
  openEmpty: (message: string) => void;
  close: () => void;
};

export function createDrawResultSheet(handlers: {
  onView: (link: LinkRow) => void;
  onRedraw: () => void;
}): DrawSheetHandle {
  let current: LinkRow | null = null;
  let spinning = false;
  let spinTimer: ReturnType<typeof setTimeout> | null = null;

  const overlay = document.createElement("div");
  overlay.className = "links-filter-sheet links-draw-sheet";
  overlay.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "links-filter-sheet__backdrop";
  backdrop.setAttribute("aria-label", "Fechar sorteio");

  const panel = document.createElement("div");
  panel.className = "links-filter-sheet__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "links-draw-title");

  const title = document.createElement("h2");
  title.className = "links-filter-sheet__title";
  title.id = "links-draw-title";
  title.textContent = "Sorteio";

  const eyebrow = document.createElement("p");
  eyebrow.className = "links-draw-sheet__eyebrow";
  eyebrow.textContent = "Próximo destino";

  const reelWrap = document.createElement("div");
  reelWrap.className = "links-draw-sheet__reel-wrap";
  reelWrap.setAttribute("aria-live", "polite");

  const reel = document.createElement("div");
  reel.className = "links-draw-sheet__reel";
  reelWrap.appendChild(reel);

  const categoryEl = document.createElement("p");
  categoryEl.className = "links-draw-sheet__category";

  const emptyEl = document.createElement("p");
  emptyEl.className = "links-draw-sheet__empty";
  emptyEl.hidden = true;

  const resultBlock = document.createElement("div");
  resultBlock.className = "links-draw-sheet__result";
  resultBlock.append(eyebrow, reelWrap, categoryEl);

  const actions = document.createElement("div");
  actions.className = "links-filter-sheet__actions";

  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.className =
    "links-admin-button links-admin-button--primary links-admin-button--block";
  viewBtn.textContent = "Ver";

  const redrawBtn = document.createElement("button");
  redrawBtn.type = "button";
  redrawBtn.className = "links-admin-button links-admin-button--ghost";
  redrawBtn.textContent = "Sortear de novo";

  actions.append(viewBtn, redrawBtn);
  panel.append(title, resultBlock, emptyEl, actions);
  overlay.append(backdrop, panel);

  function prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function clearSpinTimer(): void {
    if (spinTimer != null) {
      clearTimeout(spinTimer);
      spinTimer = null;
    }
  }

  function setBusy(busy: boolean): void {
    spinning = busy;
    viewBtn.disabled = busy;
    redrawBtn.disabled = busy;
    backdrop.disabled = busy;
  }

  function showWinner(link: LinkRow): void {
    current = link;
    categoryEl.classList.remove("links-draw-sheet__category--pending");
    categoryEl.textContent = categoryLabel(resolveCategory(link));
    setBusy(false);
  }

  function renderReelInstant(label: string): void {
    reel.replaceChildren();
    reel.style.transition = "none";
    reel.style.transform = "translateY(0)";
    const item = document.createElement("div");
    item.className =
      "links-draw-sheet__reel-item links-draw-sheet__reel-item--winner";
    item.textContent = label;
    reel.appendChild(item);
  }

  function runReel(link: LinkRow, pool: readonly LinkRow[]): void {
    clearSpinTimer();
    const labels = buildSpinLabels(
      pool.map((l) => l.label),
      link.label,
      Math.min(14, Math.max(8, pool.length + 6))
    );

    reel.replaceChildren();
    reel.style.transition = "none";
    reel.style.transform = "translateY(0)";
    // Keep tag slot size stable while spinning (no layout jump on redraw).
    categoryEl.classList.add("links-draw-sheet__category--pending");
    categoryEl.textContent = "Sorteando…";

    for (let i = 0; i < labels.length; i++) {
      const item = document.createElement("div");
      item.className = "links-draw-sheet__reel-item";
      if (i === labels.length - 1) {
        item.classList.add("links-draw-sheet__reel-item--winner");
      }
      item.textContent = labels[i] ?? "";
      reel.appendChild(item);
    }

    const targetY = -((labels.length - 1) * REEL_ITEM_PX);
    setBusy(true);

    void reel.offsetHeight;
    reel.style.transition = `transform ${REEL_SPIN_MS}ms cubic-bezier(0.12, 0.75, 0.12, 1)`;
    reel.style.transform = `translateY(${targetY}px)`;

    const finish = (): void => {
      clearSpinTimer();
      reel.removeEventListener("transitionend", finish);
      showWinner(link);
    };
    reel.addEventListener("transitionend", finish);
    spinTimer = setTimeout(finish, REEL_SPIN_MS + 80);
  }

  function close(): void {
    if (spinning) return;
    clearSpinTimer();
    overlay.hidden = true;
    current = null;
    syncBodyScreenLock();
  }

  function open(link: LinkRow, pool: readonly LinkRow[] = [link]): void {
    current = link;
    emptyEl.hidden = true;
    resultBlock.hidden = false;
    viewBtn.hidden = false;
    redrawBtn.hidden = false;
    overlay.hidden = false;
    syncBodyScreenLock();

    if (prefersReducedMotion() || pool.length <= 1) {
      renderReelInstant(link.label);
      showWinner(link);
      return;
    }
    runReel(link, pool);
  }

  function openEmpty(message: string): void {
    clearSpinTimer();
    current = null;
    setBusy(false);
    resultBlock.hidden = true;
    viewBtn.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = message;
    redrawBtn.hidden = false;
    overlay.hidden = false;
    syncBodyScreenLock();
  }

  viewBtn.addEventListener("click", () => {
    if (!current || spinning) return;
    const link = current;
    close();
    handlers.onView(link);
  });
  redrawBtn.addEventListener("click", () => {
    if (spinning) return;
    handlers.onRedraw();
  });
  backdrop.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return { element: overlay, open, openEmpty, close };
}

// ---------------------------------------------------------------------------
// Delete confirmation bottom sheet
// ---------------------------------------------------------------------------

export type DeleteSheetHandle = {
  element: HTMLElement;
  open: (label: string, onConfirm: () => void | Promise<void>) => void;
  close: () => void;
};

export function createDeleteConfirmSheet(): DeleteSheetHandle {
  let onConfirmCb: (() => void | Promise<void>) | null = null;
  let busy = false;

  const { overlay, dialog, backBtn } = createScreenChrome(
    "links-delete-title",
    "Excluir experiência?",
    "alertdialog"
  );

  const body = document.createElement("p");
  body.className = "links-admin-modal__body";
  body.id = "links-delete-body";

  const actions = document.createElement("div");
  actions.className = "links-admin-form__actions links-admin-form__actions--sticky";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "links-admin-button links-admin-button--ghost";
  cancelBtn.textContent = "Cancelar";

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "links-admin-button links-admin-button--danger links-admin-button--block";
  confirmBtn.textContent = "Excluir";

  actions.append(cancelBtn, confirmBtn);
  dialog.append(body, actions);

  function close(): void {
    overlay.hidden = true;
    onConfirmCb = null;
    busy = false;
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    backBtn.disabled = false;
    setScreenBusy(dialog, false);
    syncBodyScreenLock();
  }

  function open(label: string, onConfirm: () => void | Promise<void>): void {
    body.textContent = `Excluir "${label}"? Esta ação não pode ser desfeita.`;
    onConfirmCb = onConfirm;
    overlay.hidden = false;
    syncBodyScreenLock();
    confirmBtn.focus();
  }

  cancelBtn.addEventListener("click", close);
  backBtn.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });
  confirmBtn.addEventListener("click", () => {
    if (!onConfirmCb || busy) return;
    busy = true;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    backBtn.disabled = true;
    setScreenBusy(dialog, true);
    void Promise.resolve(onConfirmCb()).finally(() => {
      close();
    });
  });

  return { element: overlay, open, close };
}

// ---------------------------------------------------------------------------
// Create / edit modal form.
// ---------------------------------------------------------------------------

export type LinkFormHandle = {
  element: HTMLElement;
  openCreate: () => void;
  openEdit: (link: LinkRow) => void;
  close: () => void;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
};

export function createLinkFormModal(
  onSubmit: (values: LinkFormValues, editingId: string | null) => void
): LinkFormHandle {
  let previouslyFocused: HTMLElement | null = null;
  let editingId: string | null = null;

  const { overlay, dialog, title, backBtn } = createScreenChrome(
    "links-form-title",
    "Nova experiência",
    "dialog"
  );

  const form = document.createElement("form");
  form.className = "links-admin-form links-admin-form--screen";
  form.noValidate = true;

  const urlField = labelledInput("links-form-url", "Link do post ou lugar", "url");
  urlField.input.required = true;
  urlField.input.placeholder = "https://...";
  urlField.input.setAttribute("inputmode", "url");

  const labelField = labelledInput("links-form-label", "Nome do lugar ou experiência", "text");
  labelField.input.required = true;
  labelField.input.maxLength = 200;

  const descField = labelledInput(
    "links-form-desc",
    "Nota (opcional) — por que salvar, região, época…",
    "text"
  );
  descField.input.maxLength = 500;

  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "links-admin-form__actions links-admin-form__actions--sticky";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "links-admin-button links-admin-button--primary links-admin-button--block";
  submitBtn.textContent = "Salvar";

  actions.append(submitBtn);
  form.append(
    urlField.wrapper,
    labelField.wrapper,
    descField.wrapper,
    error,
    actions
  );
  dialog.appendChild(form);

  function clearError(): void {
    error.hidden = true;
    error.textContent = "";
  }

  function close(): void {
    overlay.hidden = true;
    clearError();
    form.reset();
    editingId = null;
    syncBodyScreenLock();
    if (previouslyFocused) {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
  }

  function afterOpen(): void {
    previouslyFocused = document.activeElement as HTMLElement | null;
    overlay.hidden = false;
    syncBodyScreenLock();
    clearError();
    // Do not autofocus fields — on mobile that pops the keyboard immediately.
  }

  function openCreate(): void {
    editingId = null;
    title.textContent = "Nova experiência";
    form.reset();
    afterOpen();
  }

  function openEdit(link: LinkRow): void {
    editingId = link.id;
    title.textContent = "Editar experiência";
    urlField.input.value = link.url;
    labelField.input.value = link.label;
    descField.input.value = link.description ?? "";
    afterOpen();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit(
      {
        url: urlField.input.value.trim(),
        label: labelField.input.value.trim(),
        description: descField.input.value.trim(),
      },
      editingId
    );
  });

  backBtn.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return {
    element: overlay,
    openCreate,
    openEdit,
    close,
    setError(message: string) {
      error.textContent = message;
      error.hidden = false;
    },
    setBusy(busy: boolean) {
      submitBtn.disabled = busy;
      backBtn.disabled = busy;
      setScreenBusy(dialog, busy);
    },
  };
}

// ---------------------------------------------------------------------------
// Schedule sheet.
// ---------------------------------------------------------------------------

export type ScheduleSheetValues = {
  date: string;
  startTime: string;
  endTime: string;
};

export type ScheduleSheetOpenOpts = {
  title?: string;
  initial: ScheduleSheetValues;
  /** When true, show Baixar ICS + Remover (existing schedule). */
  hasSchedule: boolean;
  onSave: (values: ScheduleSheetValues) => void | Promise<void>;
  onDownloadIcs?: () => void;
  onRemove?: () => void | Promise<void>;
};

export type ScheduleSheetHandle = {
  element: HTMLElement;
  open: (opts: ScheduleSheetOpenOpts) => void;
  close: () => void;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
  /** Keep sheet open after save; optional Desfazer. */
  showSuccess: (message: string, onUndo?: () => void | Promise<void>) => void;
  /** Reveal ICS/remove after a first successful save. */
  setHasSchedule: (has: boolean) => void;
};

export function createScheduleSheet(): ScheduleSheetHandle {
  let previouslyFocused: HTMLElement | null = null;
  let onSaveCb: ((values: ScheduleSheetValues) => void | Promise<void>) | null =
    null;
  let onDownloadCb: (() => void) | null = null;
  let onRemoveCb: (() => void | Promise<void>) | null = null;
  let onUndoCb: (() => void | Promise<void>) | null = null;

  const { overlay, dialog, title, backBtn } = createScreenChrome(
    "links-schedule-title",
    "Agendar experiência",
    "dialog"
  );
  dialog.classList.add("links-admin-modal__dialog--schedule");

  const form = document.createElement("form");
  form.className =
    "links-admin-form links-admin-form--screen links-admin-form--schedule";
  form.noValidate = true;

  const dateField = labelledInput("links-schedule-date", "Data", "date");
  dateField.input.required = true;

  const startField = labelledInput("links-schedule-start", "Início", "time");
  startField.input.required = true;

  const endField = labelledInput("links-schedule-end", "Fim", "time");
  endField.input.required = true;

  const hint = document.createElement("p");
  hint.className = "links-admin-form__hint";
  hint.textContent =
    "Padrão: deslocamento incluso (9h–17h). No local ~10h–16h.";

  const success = document.createElement("div");
  success.className = "links-admin-form__success";
  success.setAttribute("role", "status");
  success.hidden = true;

  const successText = document.createElement("p");
  successText.className = "links-admin-form__success-text";

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "links-admin-button links-admin-button--ghost";
  undoBtn.dataset.action = "undo-schedule";
  undoBtn.textContent = "Desfazer";
  undoBtn.hidden = true;

  success.append(successText, undoBtn);

  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className =
    "links-admin-form__actions links-admin-form__actions--sticky";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className =
    "links-admin-button links-admin-button--primary links-admin-button--block";
  submitBtn.textContent = "Salvar agendamento";

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className =
    "links-admin-button links-admin-button--ghost links-admin-button--block";
  downloadBtn.dataset.action = "download-ics";
  downloadBtn.textContent = "Baixar ICS";
  downloadBtn.hidden = true;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className =
    "links-admin-button links-admin-button--ghost links-admin-button--block";
  removeBtn.dataset.action = "remove-schedule";
  removeBtn.textContent = "Remover agendamento";
  removeBtn.hidden = true;

  actions.append(submitBtn, downloadBtn, removeBtn);
  form.append(
    success,
    dateField.wrapper,
    startField.wrapper,
    endField.wrapper,
    hint,
    error,
    actions
  );
  dialog.appendChild(form);

  let successTimer: ReturnType<typeof setTimeout> | null = null;

  function clearSuccessTimer(): void {
    if (successTimer != null) {
      clearTimeout(successTimer);
      successTimer = null;
    }
  }

  function clearError(): void {
    error.hidden = true;
    error.textContent = "";
  }

  function clearSuccess(): void {
    clearSuccessTimer();
    success.hidden = true;
    successText.textContent = "";
    undoBtn.hidden = true;
    onUndoCb = null;
  }

  function setHasSchedule(has: boolean): void {
    downloadBtn.hidden = !has;
    removeBtn.hidden = !has;
  }

  function close(): void {
    overlay.hidden = true;
    clearError();
    clearSuccess();
    form.reset();
    onSaveCb = null;
    onDownloadCb = null;
    onRemoveCb = null;
    setBusy(false);
    syncBodyScreenLock();
    if (previouslyFocused) {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
  }

  function setBusy(busy: boolean): void {
    submitBtn.disabled = busy;
    backBtn.disabled = busy;
    downloadBtn.disabled = busy;
    removeBtn.disabled = busy;
    undoBtn.disabled = busy;
    dateField.input.disabled = busy;
    startField.input.disabled = busy;
    endField.input.disabled = busy;
    setScreenBusy(dialog, busy);
  }

  function setError(message: string): void {
    clearSuccess();
    error.textContent = message;
    error.hidden = false;
  }

  function showSuccess(
    message: string,
    onUndo?: () => void | Promise<void>
  ): void {
    clearError();
    clearSuccessTimer();
    successText.textContent = message;
    success.hidden = false;
    onUndoCb = onUndo ?? null;
    undoBtn.hidden = !onUndo;
    form.scrollTop = 0;
    if (typeof success.scrollIntoView === "function") {
      success.scrollIntoView({ block: "nearest" });
    }
    successTimer = setTimeout(() => {
      clearSuccess();
    }, 30_000);
  }

  function open(opts: ScheduleSheetOpenOpts): void {
    previouslyFocused = document.activeElement as HTMLElement | null;
    title.textContent = opts.title ?? "Agendar experiência";
    dateField.input.value = opts.initial.date;
    startField.input.value = opts.initial.startTime;
    endField.input.value = opts.initial.endTime;
    onSaveCb = opts.onSave;
    onDownloadCb = opts.onDownloadIcs ?? null;
    onRemoveCb = opts.onRemove ?? null;
    clearError();
    clearSuccess();
    setHasSchedule(opts.hasSchedule);
    setBusy(false);
    overlay.hidden = false;
    syncBodyScreenLock();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!onSaveCb) return;
    clearError();
    const values = {
      date: dateField.input.value,
      startTime: startField.input.value,
      endTime: endField.input.value,
    };
    void Promise.resolve(onSaveCb(values)).catch((err: unknown) => {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível salvar."
      );
    });
  });

  downloadBtn.addEventListener("click", () => {
    onDownloadCb?.();
  });
  removeBtn.addEventListener("click", () => {
    if (!onRemoveCb) return;
    void Promise.resolve(onRemoveCb()).catch((err: unknown) => {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível remover."
      );
    });
  });
  undoBtn.addEventListener("click", () => {
    if (!onUndoCb) return;
    void Promise.resolve(onUndoCb()).catch((err: unknown) => {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível desfazer."
      );
    });
  });

  backBtn.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return {
    element: overlay,
    open,
    close,
    setError,
    setBusy,
    showSuccess,
    setHasSchedule,
  };
}

// ---------------------------------------------------------------------------
// View experience (read-only) → Editar opens the form.
// ---------------------------------------------------------------------------

export type ViewModalCallbacks = {
  onEdit: (link: LinkRow) => void;
  onSchedule: (link: LinkRow) => void;
};

export type ViewModalHandle = {
  element: HTMLElement;
  open: (link: LinkRow) => void;
  close: () => void;
};

export function createViewModal(cb: ViewModalCallbacks): ViewModalHandle {
  let current: LinkRow | null = null;

  const { overlay, dialog, title, backBtn } = createScreenChrome(
    "links-view-title",
    "Experiência",
    "dialog"
  );

  const body = document.createElement("div");
  body.className = "links-admin-view links-admin-modal__body";

  const nameLabel = document.createElement("p");
  nameLabel.className = "links-admin-view__label";
  nameLabel.textContent = "Nome";

  const nameValue = document.createElement("p");
  nameValue.className = "links-admin-view__value";

  const categoryLabelEl = document.createElement("p");
  categoryLabelEl.className = "links-admin-view__label";
  categoryLabelEl.textContent = "Categoria";

  const categoryValue = document.createElement("p");
  categoryValue.className = "links-admin-view__value";

  const noteBlock = document.createElement("div");
  noteBlock.className = "links-admin-view__block";

  const noteLabel = document.createElement("p");
  noteLabel.className = "links-admin-view__label";
  noteLabel.textContent = "Nota";

  const noteValue = document.createElement("p");
  noteValue.className = "links-admin-view__value";

  noteBlock.append(noteLabel, noteValue);

  const linkLabel = document.createElement("p");
  linkLabel.className = "links-admin-view__label";
  linkLabel.textContent = "Link";

  const linkAnchor = document.createElement("a");
  linkAnchor.className = "links-admin-view__link";
  linkAnchor.rel = "noopener noreferrer";
  linkAnchor.target = "_blank";

  const scheduleBlock = document.createElement("div");
  scheduleBlock.className = "links-admin-view__block";

  const scheduleLabel = document.createElement("p");
  scheduleLabel.className = "links-admin-view__label";
  scheduleLabel.textContent = "Agendado";

  const scheduleValue = document.createElement("p");
  scheduleValue.className = "links-admin-view__value";

  scheduleBlock.append(scheduleLabel, scheduleValue);

  body.append(
    nameLabel,
    nameValue,
    categoryLabelEl,
    categoryValue,
    scheduleBlock,
    noteBlock,
    linkLabel,
    linkAnchor
  );

  const actions = document.createElement("div");
  actions.className =
    "links-admin-form__actions links-admin-form__actions--sticky";

  const scheduleBtn = document.createElement("button");
  scheduleBtn.type = "button";
  scheduleBtn.className =
    "links-admin-button links-admin-button--primary links-admin-button--block";
  scheduleBtn.textContent = "Agendar";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className =
    "links-admin-button links-admin-button--ghost links-admin-button--block";
  editBtn.textContent = "Editar";

  actions.append(scheduleBtn, editBtn);
  dialog.append(body, actions);

  function close(): void {
    overlay.hidden = true;
    current = null;
    syncBodyScreenLock();
  }

  function open(link: LinkRow): void {
    current = link;
    title.textContent = link.label || "Experiência";
    nameValue.textContent = link.label;
    categoryValue.textContent = categoryLabel(resolveCategory(link));
    const hasSchedule = Boolean(link.scheduled_start && link.scheduled_end);
    if (hasSchedule && link.scheduled_start && link.scheduled_end) {
      scheduleBlock.hidden = false;
      scheduleValue.textContent = formatScheduleLabel(
        link.scheduled_start,
        link.scheduled_end
      );
      scheduleBtn.textContent = "Agenda";
    } else {
      scheduleBlock.hidden = true;
      scheduleValue.textContent = "";
      scheduleBtn.textContent = "Agendar";
    }
    if (link.description && link.description.length > 0) {
      noteBlock.hidden = false;
      noteValue.textContent = link.description;
    } else {
      noteBlock.hidden = true;
      noteValue.textContent = "";
    }
    linkAnchor.href = link.url;
    linkAnchor.textContent = link.url;
    overlay.hidden = false;
    syncBodyScreenLock();
  }

  editBtn.addEventListener("click", () => {
    if (!current) return;
    const link = current;
    close();
    cb.onEdit(link);
  });
  scheduleBtn.addEventListener("click", () => {
    if (!current) return;
    const link = current;
    close();
    cb.onSchedule(link);
  });
  backBtn.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return { element: overlay, open, close };
}

// ---------------------------------------------------------------------------
// Form -> repo payload helpers. Icon preset is inferred from the URL.
// ---------------------------------------------------------------------------

export function toCreateInput(values: LinkFormValues, sortOrder: number): CreateLinkInput {
  assertFormValues(values);
  return {
    url: values.url,
    label: values.label,
    description: values.description.length > 0 ? values.description : null,
    icon_preset: inferIconPreset(values.url),
    icon_url: null,
    category: inferCategory(values),
    sort_order: sortOrder,
  };
}

export function toUpdatePatch(values: LinkFormValues): UpdateLinkPatch {
  assertFormValues(values);
  return {
    url: values.url,
    label: values.label,
    description: values.description.length > 0 ? values.description : null,
    icon_preset: inferIconPreset(values.url),
    icon_url: null,
    category: inferCategory(values),
  };
}

function assertFormValues(values: LinkFormValues): void {
  if (!isHttpsUrl(values.url)) {
    throw new Error("Informe uma URL https válida.");
  }
  if (values.label.length < 1) {
    throw new Error("O título é obrigatório.");
  }
}

// ---------------------------------------------------------------------------
// Small DOM helpers.
// ---------------------------------------------------------------------------

type LabelledInput = {
  wrapper: HTMLElement;
  input: HTMLInputElement;
};

function labelledInput(id: string, labelText: string, type: string): LabelledInput {
  const wrapper = document.createElement("div");
  wrapper.className = "links-admin-form__field";

  const label = document.createElement("label");
  label.className = "links-admin-form__label";
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement("input");
  input.className = "links-admin-form__control";
  input.id = id;
  input.type = type;

  wrapper.append(label, input);
  return { wrapper, input };
}

function iconButton(text: string, ariaLabel: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "link-card__action";
  btn.textContent = text;
  btn.setAttribute("aria-label", ariaLabel);
  btn.title = ariaLabel;
  return btn;
}
