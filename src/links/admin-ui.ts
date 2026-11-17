import type { LinkRow, CreateLinkInput, UpdateLinkPatch } from "./links-repo";
import { inferIconPreset } from "./icons";
import {
  CATEGORY_OPTIONS,
  inferCategory,
  isCategory,
  resolveCategory,
  categoryLabel,
  type Category,
} from "./category";
import {
  deriveLabelFromUrl,
  httpsUrlError,
  isHttpsUrl,
  isOptionalHttpsUrl,
  normalizeUrlInput,
  normalizeUrlOnBlur,
} from "./validate";
import { composeEditorEmail, EDITOR_EMAIL_DOMAIN } from "./editor-email";
import { buildSpinLabels } from "./pick-random";
import { setScreenBusy } from "./skeleton";
import { formatScheduleChip, formatScheduleLabel } from "./schedule";
import { isPanelMode, syncBodyScreenLock } from "./screen-lock";
import { categoryBackdropSrc } from "./card-theme";
import { displayTitle, linkDomain } from "./feed";
import { uiIcon, type IconName } from "./ui-icons";
import { buildMapUrl } from "./map-url";
import { parseMemoryLink } from "./memory-link";
import {
  MAX_POSES,
  POSE_NOTE_MAX,
  POSE_URL_TERM,
  draftsToPoseRefs,
  moveItem,
  poseDraftsFromRefs,
  poseRefsError,
  readPoseRefs,
  type PoseDraft,
} from "./poses";
import { readLessons } from "./lessons";
import {
  PLAN_LISTS,
  planByPerson,
  planProgress,
  readPlanItems,
  togglePlanItem,
  type PlanItem,
} from "./plan";
import { buildPlanMessage, hasPlanToShare, whatsappUrl } from "./plan-message";
import {
  MORE_TEXT_FIELDS,
  emptyMoreTextValues,
  type MoreTextKey,
  type MoreTextValues,
} from "./more-fields";
import {
  formatRating,
  formatVisitDate,
  hasRating,
  ratingLabel,
  ratingOutOf,
} from "./review";
import { createChipInput } from "./chip-input";
import { MAX_TAGS, MAX_TAG_LENGTH, dedupeTags, normalizeTag, tagKey } from "./tags";
import { MAX_PEOPLE, MAX_PERSON_LENGTH, dedupePeople, normalizePerson, personKey } from "./people";

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

export type ScreenChrome = {
  overlay: HTMLElement;
  dialog: HTMLElement;
  title: HTMLHeadingElement;
  backBtn: HTMLButtonElement;
};

/**
 * Dialog shell. "screen" = full-screen page with a back chevron (login);
 * "sheet" = bottom sheet on mobile / centered panel on desktop with a close X.
 */
export function createScreenChrome(
  titleId: string,
  titleText: string,
  role: "dialog" | "alertdialog",
  variant: "screen" | "sheet" = "sheet"
): ScreenChrome {
  const overlay = document.createElement("div");
  overlay.className = `links-admin-modal links-admin-modal--${variant}`;
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

  const title = document.createElement("h2");
  title.className = "links-admin-modal__title links-admin-screen__title";
  title.id = titleId;
  title.textContent = titleText;

  if (variant === "sheet") {
    const grabber = document.createElement("span");
    grabber.className = "links-admin-modal__grabber";
    grabber.setAttribute("aria-hidden", "true");
    dialog.appendChild(grabber);
    backBtn.classList.add("links-admin-screen__back--close");
    backBtn.setAttribute("aria-label", "Fechar");
    backBtn.appendChild(uiIcon("close", 22));
    header.append(title, backBtn);
  } else {
    const text = document.createElement("span");
    text.textContent = "Voltar";
    backBtn.append(uiIcon("back", 22), text);
    header.append(backBtn, title);
  }
  dialog.appendChild(header);
  overlay.appendChild(dialog);

  return { overlay, dialog, title, backBtn };
}

/** Icon-only button (aria-label required) built from the shared icon set. */
function iconOnlyButton(
  icon: IconName,
  ariaLabel: string,
  className: string,
  size = 20
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.setAttribute("aria-label", ariaLabel);
  btn.title = ariaLabel;
  btn.appendChild(uiIcon(icon, size));
  return btn;
}

// ---------------------------------------------------------------------------
// "More options" popover menu (Editar / Excluir live here only).
// ---------------------------------------------------------------------------

export type MenuItem = {
  label: string;
  icon: IconName;
  danger?: boolean;
  onSelect: () => void;
};

let closeOpenMenu: (() => void) | null = null;

function createMoreMenu(
  items: MenuItem[],
  buttonClass: string
): { wrapper: HTMLElement; button: HTMLButtonElement; close: () => void } {
  const wrapper = document.createElement("div");
  wrapper.className = "links-menu";

  const button = iconOnlyButton("more", "Mais opções", buttonClass, 22);
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "links-menu__list";
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  for (const item of items) {
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "links-menu__item";
    if (item.danger) entry.classList.add("links-menu__item--danger");
    entry.setAttribute("role", "menuitem");
    const text = document.createElement("span");
    text.textContent = item.label;
    entry.append(uiIcon(item.icon, 18), text);
    entry.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
      item.onSelect();
    });
    menu.appendChild(entry);
  }

  function onOutside(e: Event): void {
    if (!wrapper.contains(e.target as Node)) close();
  }

  function close(): void {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
    if (closeOpenMenu === close) closeOpenMenu = null;
  }

  function open(): void {
    closeOpenMenu?.();
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutside, true);
    closeOpenMenu = close;
    (menu.querySelector("button") as HTMLButtonElement | null)?.focus();
  }

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) open();
    else close();
  });
  wrapper.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      e.stopPropagation();
      close();
      button.focus();
    }
  });

  wrapper.append(button, menu);
  return { wrapper, button, close };
}

function shareLink(link: LinkRow): void {
  const nav = navigator as Navigator & {
    share?: (data: { title?: string; url?: string }) => Promise<void>;
  };
  if (typeof nav.share !== "function") return;
  void nav.share({ title: displayTitle(link), url: link.url }).catch(() => undefined);
}

function canShare(): boolean {
  return typeof (navigator as Navigator & { share?: unknown }).share === "function";
}

// ---------------------------------------------------------------------------
// Values collected from the create/edit form.
// ---------------------------------------------------------------------------

/** Label of the source-post field (form, errors). */
const SOURCE_TERM = "Link do post original";

export type LinkFormValues = MoreTextValues & {
  url: string;
  label: string;
  description: string;
  image_url: string;
  note: string;
  /** Link of the post the idea came from (https only, optional). */
  source_url: string;
  /** Photo-pose references, in display order (blank rows are dropped on save). */
  pose_refs: PoseDraft[];
  /** Picked category; "" = infer from text (Automática). */
  category: string;
  /** Free tags (display form, no `#`). */
  tags: string[];
  /** People (display form, no `@`). */
  people: string[];
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
  onSubmit: (email: string, password: string, remember: boolean) => void
): LoginModalHandle {
  let previouslyFocused: HTMLElement | null = null;

  const { overlay, dialog, backBtn } = createScreenChrome(
    "links-login-title",
    "Entrar na lista",
    "dialog",
    "screen"
  );

  const intro = document.createElement("p");
  intro.className = "links-admin-modal__body";
  intro.textContent =
    "Acesso de editor para adicionar, agendar e revisar experiências da bucket list.";

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

  const rememberRow = document.createElement("label");
  rememberRow.className = "links-admin-form__checkbox-field";
  rememberRow.htmlFor = "links-login-remember";

  const rememberInput = document.createElement("input");
  rememberInput.type = "checkbox";
  rememberInput.id = "links-login-remember";
  rememberInput.className = "links-admin-form__checkbox";
  rememberInput.defaultChecked = true;

  const rememberText = document.createElement("span");
  rememberText.textContent = "Manter conectado";

  rememberRow.append(rememberInput, rememberText);

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
  form.append(emailField.wrapper, passwordField.wrapper, rememberRow, error, actions);
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
    onSubmit(email, passwordField.input.value, rememberInput.checked);
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
// Feed card: image first, short title, meta row, actions on the card.
// Destructive actions live only in the ⋯ menu.
// ---------------------------------------------------------------------------

export type AdminCardCallbacks = {
  onView: (link: LinkRow) => void;
  onEdit: (link: LinkRow) => void;
  onDelete: (link: LinkRow) => void;
  onMarkDone: (link: LinkRow) => void;
  onSchedule: (link: LinkRow) => void;
  /** Done places only: back to the wishlist (keeps the "Como foi"). */
  onUnmarkDone?: (link: LinkRow) => void;
  /** Tap on a tag chip: filter the feed by that tag. */
  onTag?: (tag: string) => void;
  /** Tap on a person chip: filter the feed by that person. */
  onPerson?: (person: string) => void;
};

export type AdminCardOptions = {
  selected?: boolean;
};

function cardActionButton(
  icon: IconName,
  text: string,
  action: string
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "feed-card__action";
  btn.dataset.action = action;
  const label = document.createElement("span");
  label.className = "feed-card__action-text";
  label.textContent = text;
  btn.append(uiIcon(icon, 21), label);
  return btn;
}

const FILTER_CHIP_KINDS = {
  tag: {
    prefix: "#",
    values: dedupeTags,
    cardRow: "feed-card__tags",
    cardChip: "feed-card__tag",
    detailChip: "links-detail__tag",
  },
  person: {
    prefix: "@",
    values: dedupePeople,
    cardRow: "feed-card__people",
    cardChip: "feed-card__person",
    detailChip: "links-detail__person",
  },
} as const;

/**
 * Tap-to-filter chips for a tag/person list, shared by the feed card and the
 * detail view (only the CSS classes and the click handler differ).
 */
function filterChips(
  kind: keyof typeof FILTER_CHIP_KINDS,
  where: "card" | "detail",
  raw: readonly string[] | null | undefined,
  onPick: (value: string, e: MouseEvent) => void
): HTMLButtonElement[] {
  const spec = FILTER_CHIP_KINDS[kind];
  return spec.values(raw ?? []).map((value) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = where === "card" ? spec.cardChip : spec.detailChip;
    btn.textContent = `${spec.prefix}${value}`;
    btn.setAttribute("aria-label", `Filtrar por ${spec.prefix}${value}`);
    btn.addEventListener("click", (e) => onPick(value, e));
    return btn;
  });
}

/** Registry fields surfaced as meta items on the feed card (cost · city). */
const CARD_META_KEYS: readonly MoreTextKey[] = ["cost_text", "city"];

export function renderAdminCard(
  link: LinkRow,
  cb: AdminCardCallbacks,
  opts: AdminCardOptions = {}
): HTMLElement {
  const category = resolveCategory(link);
  const title = displayTitle(link);

  const card = document.createElement("article");
  card.className = "feed-card";
  card.dataset.id = link.id;
  if (opts.selected) card.classList.add("feed-card--selected");
  if (link.status === "done") card.classList.add("feed-card--done");

  const media = document.createElement("div");
  media.className = "feed-card__media";
  const src = categoryBackdropSrc(category, link.image_url);
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    media.appendChild(img);
  }
  const badge = document.createElement("span");
  badge.className = "feed-card__badge";
  badge.textContent = categoryLabel(category);
  media.appendChild(badge);

  const body = document.createElement("div");
  body.className = "feed-card__body";

  const heading = document.createElement("h3");
  heading.className = "feed-card__heading";
  const open = document.createElement("button");
  open.type = "button";
  open.className = "feed-card__open";
  const titleEl = document.createElement("span");
  titleEl.className = "feed-card__title";
  titleEl.textContent = title;
  open.appendChild(titleEl);
  heading.appendChild(open);

  const meta = document.createElement("p");
  meta.className = "feed-card__meta";
  const domain = linkDomain(link.url);
  if (domain) {
    const where = document.createElement("span");
    where.className = "feed-card__meta-item";
    const text = document.createElement("span");
    text.textContent = domain;
    where.append(uiIcon("link", 15), text);
    meta.appendChild(where);
  }
  if (link.scheduled_start && link.scheduled_end) {
    const when = document.createElement("span");
    when.className = "feed-card__meta-item feed-card__meta-item--schedule";
    const text = document.createElement("span");
    text.className = "feed-card__schedule";
    text.textContent = formatScheduleChip(link.scheduled_start, link.scheduled_end);
    when.append(uiIcon("calendar", 15), text);
    meta.appendChild(when);
  }
  for (const field of MORE_TEXT_FIELDS) {
    if (!CARD_META_KEYS.includes(field.key)) continue;
    const value = link[field.key];
    if (!value) continue;
    const item = document.createElement("span");
    item.className = `feed-card__meta-item feed-card__meta-item--${field.slug}`;
    const text = document.createElement("span");
    text.textContent = value;
    item.append(uiIcon(field.icon, 15), text);
    meta.appendChild(item);
  }
  if (hasRating(link)) {
    const rated = document.createElement("span");
    rated.className = "feed-card__meta-item feed-card__meta-item--rating";
    rated.setAttribute("role", "img");
    rated.setAttribute("aria-label", ratingLabel(link.rating));
    const text = document.createElement("span");
    text.textContent = formatRating(link.rating);
    rated.append(uiIcon("star", 15), text);
    meta.appendChild(rated);
  }
  body.append(heading, meta);
  for (const [kind, values, pick] of [
    ["tag", link.tags, cb.onTag],
    ["person", link.people, cb.onPerson],
  ] as const) {
    const chips = filterChips(kind, "card", values, (value, e) => {
      e.stopPropagation();
      pick?.(value);
    });
    if (chips.length === 0) continue;
    const row = document.createElement("div");
    row.className = FILTER_CHIP_KINDS[kind].cardRow;
    row.append(...chips);
    body.appendChild(row);
  }

  const actions = document.createElement("div");
  actions.className = "feed-card__actions";

  if (link.status !== "done") {
    const doneBtn = cardActionButton("check", "Feito", "done");
    doneBtn.setAttribute("aria-label", `Marcar ${title} como feito`);
    doneBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      cb.onMarkDone(link);
    });
    actions.appendChild(doneBtn);
  }

  const scheduleBtn = cardActionButton("calendar", "Agendar", "schedule");
  scheduleBtn.setAttribute("aria-label", `Agendar ${title}`);
  scheduleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    cb.onSchedule(link);
  });
  actions.appendChild(scheduleBtn);

  const spacer = document.createElement("span");
  spacer.className = "feed-card__spacer";
  actions.appendChild(spacer);

  if (canShare()) {
    const share = iconOnlyButton("share", "Compartilhar", "feed-card__icon-btn", 21);
    share.addEventListener("click", (e) => {
      e.stopPropagation();
      shareLink(link);
    });
    actions.appendChild(share);
  }

  const menuItems: MenuItem[] = [
    { label: "Editar", icon: "edit", onSelect: () => cb.onEdit(link) },
  ];
  if (link.status === "done" && cb.onUnmarkDone) {
    const unmark = cb.onUnmarkDone;
    menuItems.push({ label: "Desmarcar feito", icon: "check", onSelect: () => unmark(link) });
  }
  menuItems.push({
    label: "Excluir",
    icon: "trash",
    danger: true,
    onSelect: () => cb.onDelete(link),
  });
  const more = createMoreMenu(menuItems, "feed-card__icon-btn");
  actions.appendChild(more.wrapper);

  open.addEventListener("click", () => cb.onView(link));
  // Whole image/body area opens the detail too (mouse/touch convenience).
  media.addEventListener("click", () => cb.onView(link));
  body.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".feed-card__open")) return;
    cb.onView(link);
  });

  card.append(media, body, actions);
  return card;
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
  openCreate: (prefill?: { url?: string }) => void;
  openEdit: (link: LinkRow) => void;
  close: () => void;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
};

export type LinkFormOptions = {
  /** Tags already used across items (autocomplete source). */
  getTagSuggestions?: () => readonly string[];
  /** Names already used across items (autocomplete source). */
  getPeopleSuggestions?: () => readonly string[];
};

export function createLinkFormModal(
  onSubmit: (values: LinkFormValues, editingId: string | null) => void,
  formOptions: LinkFormOptions = {}
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
  normalizeUrlOnBlur(urlField.input);

  const labelField = labelledInput("links-form-label", "Nome do lugar ou experiência (opcional)", "text");
  labelField.input.maxLength = 200;
  const updateLabelCounter = attachCharCounter(labelField.wrapper, labelField.input, 200);

  // Preview row: thumbnail (photo or category stock image) beside the name.
  const preview = document.createElement("div");
  preview.className = "links-admin-form__preview";
  const previewImg = document.createElement("img");
  previewImg.className = "links-admin-form__preview-img";
  previewImg.alt = "";
  labelField.wrapper.classList.add("links-admin-form__field--grow");
  preview.append(previewImg, labelField.wrapper);

  // Category: one-tap chips. "" = Automática (inferred on save).
  let pickedCategory = "";
  const categoryField = document.createElement("div");
  categoryField.className = "links-admin-form__field";
  const categoryLabelEl = document.createElement("span");
  categoryLabelEl.className = "links-admin-form__label";
  categoryLabelEl.id = "links-form-category-label";
  categoryLabelEl.textContent = "Categoria";
  const categoryChips = document.createElement("div");
  categoryChips.className = "links-chips links-chips--wrap";
  categoryChips.setAttribute("role", "group");
  categoryChips.setAttribute("aria-labelledby", "links-form-category-label");
  const chipButtons: HTMLButtonElement[] = [];
  for (const value of ["", ...CATEGORY_OPTIONS]) {
    const chipBtn = document.createElement("button");
    chipBtn.type = "button";
    chipBtn.className = "links-chip";
    chipBtn.dataset.category = value;
    chipBtn.textContent = value === "" ? "Automática" : categoryLabel(value);
    chipBtn.addEventListener("click", () => {
      pickedCategory = value;
      syncCategoryChips();
      syncPreview();
    });
    chipButtons.push(chipBtn);
    categoryChips.appendChild(chipBtn);
  }
  categoryField.append(categoryLabelEl, categoryChips);

  function syncCategoryChips(): void {
    for (const btn of chipButtons) {
      const on = btn.dataset.category === pickedCategory;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("links-chip--active", on);
    }
  }

  const descField = labelledTextarea(
    "links-form-desc",
    "Nota da lista (opcional) — por que salvar, região, época…"
  );
  descField.input.maxLength = 2000;
  const updateDescCounter = attachCharCounter(descField.wrapper, descField.input, 2000);

  const imageField = labelledInput(
    "links-form-image",
    "Foto (opcional) — link da imagem",
    "url"
  );
  imageField.input.placeholder = "https://...";
  imageField.input.setAttribute("inputmode", "url");
  normalizeUrlOnBlur(imageField.input);

  const memoryField = labelledInput(
    "links-form-note",
    "Memória (opcional) — após visitar",
    "text"
  );
  memoryField.input.maxLength = 500;
  const updateMemoryCounter = attachCharCounter(memoryField.wrapper, memoryField.input, 500);

  // "Mais detalhes": collapsed by default; new optional fields are appended
  // here (driven by MORE_TEXT_FIELDS) so later tickets only add registry entries.
  const more = document.createElement("details");
  more.className = "links-admin-form__more";
  const moreSummary = document.createElement("summary");
  moreSummary.className = "links-admin-form__more-summary";
  moreSummary.textContent = "Mais detalhes";
  const moreBody = document.createElement("div");
  moreBody.className = "links-admin-form__more-body";
  more.append(moreSummary, moreBody);

  const moreText = MORE_TEXT_FIELDS.map((field) => {
    const id = `links-form-${field.key}`;
    const f = field.multiline
      ? labelledTextarea(id, field.formLabel)
      : labelledInput(id, field.formLabel, "text");
    f.input.maxLength = field.max;
    if (field.placeholder) f.input.placeholder = field.placeholder;
    if (field.multiline) f.input.classList.add("links-admin-form__control--long");
    attachCharCounter(f.wrapper, f.input, field.max);
    moreBody.appendChild(f.wrapper);
    const syncHeight = "syncHeight" in f ? f.syncHeight : () => {};
    return { key: field.key, input: f.input, syncHeight };
  });

  const tagsInput = createChipInput({
    id: "links-form-tags",
    label: "Tags (opcional)",
    prefix: "#",
    placeholder: "praia, grátis…",
    normalize: normalizeTag,
    key: tagKey,
    max: MAX_TAGS,
    maxLength: MAX_TAG_LENGTH,
    getSuggestions: () => formOptions.getTagSuggestions?.() ?? [],
  });
  moreBody.appendChild(tagsInput.element);
  const peopleInput = createChipInput({
    id: "links-form-people",
    label: "Pessoas (opcional)",
    prefix: "@",
    placeholder: "quem indicou ou quer ir…",
    normalize: normalizePerson,
    key: personKey,
    max: MAX_PEOPLE,
    maxLength: MAX_PERSON_LENGTH,
    splitOnSpace: false,
    getSuggestions: () => formOptions.getPeopleSuggestions?.() ?? [],
  });
  moreBody.appendChild(peopleInput.element);
  // Source post link: https only, validated inline as the user types.
  const sourceField = labelledInput("links-form-source_url", SOURCE_TERM, "url");
  sourceField.input.placeholder = "https://";
  sourceField.input.autocomplete = "off";
  const sourceError = document.createElement("p");
  sourceError.id = "links-form-source_url-error";
  sourceError.className = "links-admin-form__field-error";
  sourceError.hidden = true;
  sourceField.input.setAttribute("aria-describedby", sourceError.id);
  sourceField.wrapper.appendChild(sourceError);
  moreBody.appendChild(sourceField.wrapper);

  /** Shows/clears the inline error; returns true when the value is acceptable. */
  function validateSource(): boolean {
    const message = httpsUrlError(sourceField.input.value, SOURCE_TERM);
    sourceError.hidden = message === null;
    sourceError.textContent = message ?? "";
    if (message) sourceField.input.setAttribute("aria-invalid", "true");
    else sourceField.input.removeAttribute("aria-invalid");
    return message === null;
  }
  sourceField.input.addEventListener("input", validateSource);
  normalizeUrlOnBlur(sourceField.input);

  // Photo-pose references: ordered rows of {link, note}. State lives in `poses`;
  // the list is re-rendered on structural changes (add/remove/move) only, so
  // typing never loses focus.
  let poses: PoseDraft[] = [];
  const posesField = document.createElement("fieldset");
  posesField.className = "links-admin-form__field links-poses";
  const posesLegend = document.createElement("legend");
  posesLegend.className = "links-admin-form__label";
  posesLegend.textContent = "Referências de pose";
  const posesList = document.createElement("ol");
  posesList.className = "links-poses__list";
  const addPoseBtn = document.createElement("button");
  addPoseBtn.type = "button";
  addPoseBtn.className = "links-poses__add";
  addPoseBtn.setAttribute("aria-label", "Adicionar pose");
  addPoseBtn.append(uiIcon("plus", 18), document.createTextNode("Adicionar pose"));
  posesField.append(posesLegend, posesList, addPoseBtn);
  moreBody.appendChild(posesField);

  function validatePose(index: number): boolean {
    const input = posesList.querySelector<HTMLInputElement>(`#links-form-pose-${index}-url`);
    const err = posesList.querySelector<HTMLElement>(`#links-form-pose-${index}-url-error`);
    if (!input || !err) return true;
    const message = httpsUrlError(input.value, POSE_URL_TERM);
    err.hidden = message === null;
    err.textContent = message ?? "";
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    return message === null;
  }

  function renderPoses(focus?: string): void {
    posesList.replaceChildren();
    poses.forEach((pose, i) => {
      const n = i + 1;
      const item = document.createElement("li");
      item.className = "links-poses__item";
      const urlField = labelledInput(`links-form-pose-${i}-url`, `Pose ${n}: link`, "url");
      urlField.input.placeholder = "https://";
      urlField.input.autocomplete = "off";
      urlField.input.value = pose.url;
      const err = document.createElement("p");
      err.id = `links-form-pose-${i}-url-error`;
      err.className = "links-admin-form__field-error";
      err.hidden = true;
      urlField.input.setAttribute("aria-describedby", err.id);
      urlField.wrapper.appendChild(err);
      urlField.input.addEventListener("input", () => {
        pose.url = urlField.input.value;
        validatePose(i);
      });
      normalizeUrlOnBlur(urlField.input);
      const noteField = labelledInput(`links-form-pose-${i}-note`, `Pose ${n}: nota`, "text");
      noteField.input.maxLength = POSE_NOTE_MAX;
      noteField.input.value = pose.note;
      noteField.input.addEventListener("input", () => {
        pose.note = noteField.input.value;
      });

      const tools = document.createElement("div");
      tools.className = "links-poses__tools";
      const up = poseToolButton("↑", `Subir pose ${n}`);
      up.disabled = i === 0;
      up.addEventListener("click", () => {
        poses = moveItem(poses, i, i - 1);
        renderPoses(`up-${i - 1}`);
      });
      const down = poseToolButton("↓", `Descer pose ${n}`);
      down.disabled = i === poses.length - 1;
      down.addEventListener("click", () => {
        poses = moveItem(poses, i, i + 1);
        renderPoses(`down-${i + 1}`);
      });
      const remove = poseToolButton("×", `Remover pose ${n}`);
      remove.addEventListener("click", () => {
        poses = poses.filter((_, j) => j !== i);
        renderPoses("add");
      });
      up.dataset.focusKey = `up-${i}`;
      down.dataset.focusKey = `down-${i}`;
      tools.append(up, down, remove);

      item.append(urlField.wrapper, noteField.wrapper, tools);
      posesList.appendChild(item);
      validatePose(i);
    });
    addPoseBtn.disabled = poses.length >= MAX_POSES;
    if (focus === "add") addPoseBtn.focus();
    else if (focus) {
      const target = posesList.querySelector<HTMLElement>(`[data-focus-key='${focus}']`);
      // A moved row can land at an edge where that button is disabled.
      if (target && !(target as HTMLButtonElement).disabled) target.focus();
    }
  }
  addPoseBtn.addEventListener("click", () => {
    if (poses.length >= MAX_POSES) return;
    poses.push({ url: "", note: "" });
    renderPoses();
    posesList
      .querySelector<HTMLInputElement>(`#links-form-pose-${poses.length - 1}-url`)
      ?.focus();
  });

  function readMoreText(): MoreTextValues {
    const out = emptyMoreTextValues();
    for (const f of moreText) out[f.key] = f.input.value.trim();
    return out;
  }

  /** Fill the "Mais detalhes" fields; opens the section when any has content. */
  function writeMoreText(link: LinkRow | null): void {
    let any = false;
    for (const f of moreText) {
      const value = link?.[f.key] ?? "";
      f.input.value = value;
      f.input.dispatchEvent(new Event("input"));
      if (value) any = true;
    }
    const tags = link?.tags ?? [];
    tagsInput.setValues(tags);
    if (tags.length > 0) any = true;
    const people = link?.people ?? [];
    peopleInput.setValues(people);
    if (people.length > 0) any = true;
    sourceField.input.value = link?.source_url ?? "";
    validateSource();
    poses = poseDraftsFromRefs(readPoseRefs(link?.pose_refs));
    renderPoses();
    more.open = any || sourceField.input.value !== "" || poses.length > 0;
    syncMoreHeights();
  }

  // A closed <details> has no layout, so auto-grow would measure 0: re-measure
  // when the section opens.
  function syncMoreHeights(): void {
    if (!more.open) return;
    for (const f of moreText) f.syncHeight();
  }
  more.addEventListener("toggle", syncMoreHeights);

  function syncPreview(): void {
    const category = isCategory(pickedCategory)
      ? pickedCategory
      : inferCategory({
          label: labelField.input.value,
          description: descField.input.value,
          url: urlField.input.value,
        });
    const image = imageField.input.value.trim();
    const src = categoryBackdropSrc(category, image);
    if (src) previewImg.src = src;
    else previewImg.removeAttribute("src");
  }
  for (const input of [urlField.input, labelField.input, imageField.input]) {
    input.addEventListener("input", syncPreview);
  }
  descField.input.addEventListener("input", syncPreview);

  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  attachPasteButton(urlField, (message) => {
    if (message) {
      error.textContent = message;
      error.hidden = false;
    } else {
      clearError();
    }
    syncPreview();
  });

  const actions = document.createElement("div");
  actions.className = "links-admin-form__actions links-admin-form__actions--flow";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "links-admin-button links-admin-button--primary links-admin-button--block";
  submitBtn.textContent = "Salvar";

  actions.append(submitBtn);
  form.append(
    urlField.wrapper,
    preview,
    categoryField,
    descField.wrapper,
    imageField.wrapper,
    memoryField.wrapper,
    more,
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
    more.open = false;
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

  function openCreate(prefill?: { url?: string }): void {
    editingId = null;
    title.textContent = "Nova experiência";
    form.reset();
    if (prefill?.url) {
      urlField.input.value = prefill.url;
    }
    pickedCategory = "";
    writeMoreText(null);
    syncCategoryChips();
    syncPreview();
    descField.syncHeight();
    updateLabelCounter();
    updateDescCounter();
    updateMemoryCounter();
    afterOpen();
  }

  function openEdit(link: LinkRow): void {
    editingId = link.id;
    title.textContent = "Editar experiência";
    urlField.input.value = link.url;
    labelField.input.value = link.label;
    descField.input.value = link.description ?? "";
    imageField.input.value = link.image_url ?? "";
    memoryField.input.value = link.note ?? "";
    writeMoreText(link);
    pickedCategory = link.category && isCategory(link.category) ? link.category : "";
    syncCategoryChips();
    syncPreview();
    descField.syncHeight();
    updateLabelCounter();
    updateDescCounter();
    updateMemoryCounter();
    afterOpen();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    tagsInput.commit();
    peopleInput.commit();
    if (!validateSource()) {
      more.open = true;
      sourceField.input.focus();
      return;
    }
    const badPose = poses.findIndex((_, i) => !validatePose(i));
    if (badPose >= 0) {
      more.open = true;
      posesList.querySelector<HTMLInputElement>(`#links-form-pose-${badPose}-url`)?.focus();
      return;
    }
    onSubmit(
      {
        tags: tagsInput.getValues(),
        people: peopleInput.getValues(),
        url: normalizeUrlInput(urlField.input.value),
        label: labelField.input.value.trim(),
        description: descField.input.value.trim(),
        image_url: normalizeUrlInput(imageField.input.value),
        note: memoryField.input.value.trim(),
        source_url: normalizeUrlInput(sourceField.input.value),
        pose_refs: poses.map((p) => ({ url: normalizeUrlInput(p.url), note: p.note.trim() })),
        category: pickedCategory,
        ...readMoreText(),
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
// Detail view: hero image, chips, info rows, sticky action bar.
// Full screen on mobile; right side panel on wide desktop (CSS + screen-lock).
// ---------------------------------------------------------------------------

export type ViewModalCallbacks = {
  onEdit: (link: LinkRow) => void;
  onSchedule: (link: LinkRow) => void;
  onMarkDone: (link: LinkRow) => void;
  onDelete: (link: LinkRow) => void;
  /** Done places only: back to the wishlist (keeps the "Como foi"). */
  onUnmarkDone?: (link: LinkRow) => void;
  /** Done places only: open the "Como foi" sheet to edit it. */
  onEditReview?: (link: LinkRow) => void;
  /** Any place: open the "Plano do passeio" sheet to edit the plan. */
  onEditPlan?: (link: LinkRow) => void;
  /**
   * Tick/untick a plan item: persist `items` (the whole plan_items array).
   * Rejects when the save fails; the detail then rolls the tick back.
   */
  onSavePlanItems?: (link: LinkRow, items: PlanItem[]) => Promise<void>;
  /** Tap on a tag chip: close the detail and filter the feed by that tag. */
  onTag?: (tag: string) => void;
  /** Tap on a person chip: close the detail and filter the feed by that person. */
  onPerson?: (person: string) => void;
  /** Fired with the open link id, or null when the detail closes. */
  onOpenChange?: (id: string | null) => void;
};

export type ViewModalHandle = {
  element: HTMLElement;
  open: (link: LinkRow) => void;
  close: () => void;
  currentId: () => string | null;
};

/** One pose in the detail list: optional https link (new tab) + plain-text note. */
function renderPoseItem(ref: { url?: string; note?: string }, index: number): HTMLElement {
  const li = document.createElement("li");
  li.className = "links-detail__pose";
  if (ref.url) {
    const a = document.createElement("a");
    a.className = "links-detail__pose-link";
    a.href = ref.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    const label = document.createElement("span");
    label.textContent = `Ver referência ${index + 1}`;
    a.append(label, uiIcon("external", 16));
    li.appendChild(a);
  }
  if (ref.note) {
    const note = document.createElement("span");
    note.className = "links-detail__pose-note";
    note.textContent = ref.note;
    li.appendChild(note);
  }
  return li;
}

function poseToolButton(glyph: string, ariaLabel: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "links-poses__tool";
  btn.setAttribute("aria-label", ariaLabel);
  btn.title = ariaLabel;
  btn.textContent = glyph;
  return btn;
}

function infoRow(icon: IconName, term: string): { row: HTMLElement; value: HTMLElement } {
  const row = document.createElement("div");
  row.className = "links-detail__row";
  const dt = document.createElement("dt");
  dt.className = "links-detail__term";
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.className = "links-detail__value";
  const text = document.createElement("div");
  text.append(dt, dd);
  row.append(uiIcon(icon, 20), text);
  return { row, value: dd };
}

export function createViewModal(cb: ViewModalCallbacks): ViewModalHandle {
  let current: LinkRow | null = null;
  let previouslyFocused: HTMLElement | null = null;

  const overlay = document.createElement("div");
  overlay.className = "links-admin-modal links-detail";
  overlay.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "links-admin-modal__dialog links-detail__dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "links-view-title");

  const hero = document.createElement("div");
  hero.className = "links-detail__hero";
  const heroImg = document.createElement("img");
  heroImg.alt = "";
  hero.appendChild(heroImg);

  const heroBar = document.createElement("div");
  heroBar.className = "links-detail__hero-bar";
  const backBtn = iconOnlyButton("back", "Voltar", "links-detail__float-btn", 22);
  const heroSpacer = document.createElement("span");
  heroSpacer.className = "links-detail__spacer";
  heroBar.append(backBtn, heroSpacer);
  if (canShare()) {
    const share = iconOnlyButton("share", "Compartilhar", "links-detail__float-btn");
    share.addEventListener("click", () => {
      if (current) shareLink(current);
    });
    heroBar.appendChild(share);
  }
  const more = createMoreMenu(
    [
      {
        label: "Editar",
        icon: "edit",
        onSelect: () => {
          if (!current) return;
          const link = current;
          close();
          cb.onEdit(link);
        },
      },
      {
        label: "Excluir",
        icon: "trash",
        danger: true,
        onSelect: () => {
          if (!current) return;
          const link = current;
          close();
          cb.onDelete(link);
        },
      },
    ],
    "links-detail__float-btn"
  );
  heroBar.appendChild(more.wrapper);
  hero.appendChild(heroBar);

  const body = document.createElement("div");
  body.className = "links-detail__body";

  const chips = document.createElement("div");
  chips.className = "links-detail__chips";

  const title = document.createElement("h2");
  title.className = "links-detail__title";
  title.id = "links-view-title";

  const info = document.createElement("dl");
  info.className = "links-detail__info";

  const linkRow = infoRow("link", "Link");
  const domainText = document.createElement("span");
  domainText.className = "links-detail__domain";
  const original = document.createElement("a");
  original.className = "links-detail__original";
  original.dataset.action = "open-original";
  original.rel = "noopener noreferrer";
  original.target = "_blank";
  const originalText = document.createElement("span");
  originalText.textContent = "Ver link original";
  original.append(originalText, uiIcon("external", 16));
  linkRow.value.append(domainText, original);

  const scheduleRow = infoRow("calendar", "Agendado");
  const noteRow = infoRow("note", "Nota");
  const memoryRow = infoRow("memory", "Memória");
  info.append(scheduleRow.row, noteRow.row, memoryRow.row);

  // "Como foi" block (done places only, each row only when filled). Later
  // Phase 3 rows (impressions, lessons, memory link) go right below these.
  const visitRow = infoRow("calendar", "Visita");
  visitRow.row.dataset.field = "completed_at";
  const ratingRow = infoRow("star", "Avaliação");
  ratingRow.row.dataset.field = "rating";
  const wantAgainRow = infoRow("heart", "Voltaria?");
  wantAgainRow.row.dataset.field = "want_again";
  const impressionsRow = infoRow("note", "Impressões");
  impressionsRow.row.dataset.field = "impressions";
  impressionsRow.row.classList.add("links-detail__row--long", "links-detail__row--prose");
  const lessonsRow = infoRow("check", "Lições aprendidas");
  lessonsRow.row.dataset.field = "lessons";
  lessonsRow.row.classList.add("links-detail__row--long");
  const lessonsOl = document.createElement("ol");
  lessonsOl.className = "links-detail__lessons";
  lessonsRow.value.appendChild(lessonsOl);
  // Memory link: YouTube thumbnail + "Assistir", or "Ver álbum". Plain image
  // and new-tab link only (no iframe/embed).
  const memoryThumb = document.createElement("img");
  memoryThumb.className = "links-detail__memory-thumb";
  memoryThumb.alt = "";
  memoryThumb.loading = "lazy";
  memoryThumb.referrerPolicy = "no-referrer";
  memoryThumb.width = 480;
  memoryThumb.height = 360;
  memoryThumb.hidden = true;
  memoryThumb.addEventListener("error", () => {
    memoryThumb.hidden = true;
  });
  const memoryAction = document.createElement("a");
  memoryAction.className = "links-detail__action links-detail__memory-action";
  memoryAction.dataset.action = "open-memory";
  memoryAction.rel = "noopener noreferrer";
  memoryAction.target = "_blank";
  const memoryActionText = document.createElement("span");
  memoryAction.append(uiIcon("external", 16), memoryActionText);
  const memoryWrap = document.createElement("div");
  memoryWrap.className = "links-detail__row links-detail__row--action links-detail__memory";
  memoryWrap.dataset.field = "memory_url";
  memoryWrap.hidden = true;
  memoryWrap.append(memoryThumb, memoryAction);
  const reviewEdit = document.createElement("button");
  reviewEdit.type = "button";
  reviewEdit.className = "links-detail__action links-detail__review-edit";
  reviewEdit.dataset.action = "edit-review";
  const reviewEditText = document.createElement("span");
  reviewEditText.textContent = "Editar Como foi";
  reviewEdit.append(uiIcon("edit", 16), reviewEditText);
  const reviewEditWrap = document.createElement("div");
  reviewEditWrap.className = "links-detail__row links-detail__row--action";
  reviewEditWrap.dataset.field = "review-edit";
  reviewEditWrap.appendChild(reviewEdit);
  info.append(
    visitRow.row,
    ratingRow.row,
    wantAgainRow.row,
    impressionsRow.row,
    lessonsRow.row,
    memoryWrap,
    reviewEditWrap
  );

  // Registry-driven rows (cost, city, address, ...), each hidden when empty.
  // The map button sits right under them and is only shown when there is
  // something to search for.
  const moreRows = MORE_TEXT_FIELDS.map((field) => {
    const r = infoRow(field.icon, field.term);
    r.row.dataset.field = field.key;
    // Long text reads as its own section (line breaks kept via textContent +
    // pre-line in CSS; never innerHTML).
    if (field.multiline) r.row.classList.add("links-detail__row--long");
    info.appendChild(r.row);
    return { field, ...r };
  });
  const tagsRow = infoRow("tag", "Tags");
  tagsRow.row.dataset.field = "tags";
  tagsRow.row.hidden = true;
  info.appendChild(tagsRow.row);
  const peopleRow = infoRow("user", "Pessoas");
  peopleRow.row.dataset.field = "people";
  peopleRow.row.hidden = true;
  info.appendChild(peopleRow.row);
  const mapLink = document.createElement("a");
  mapLink.className = "links-detail__map";
  mapLink.dataset.action = "open-map";
  mapLink.rel = "noopener noreferrer";
  mapLink.target = "_blank";
  const mapText = document.createElement("span");
  mapText.textContent = "Abrir no mapa";
  mapLink.append(uiIcon("pin", 16), mapText);
  const mapWrap = document.createElement("div");
  mapWrap.className = "links-detail__row links-detail__row--action";
  mapWrap.dataset.field = "map";
  mapWrap.appendChild(mapLink);
  const sourceLink = document.createElement("a");
  sourceLink.className = "links-detail__map links-detail__source";
  sourceLink.rel = "noopener noreferrer";
  sourceLink.target = "_blank";
  const sourceText = document.createElement("span");
  sourceText.textContent = "Ver post original";
  sourceLink.append(uiIcon("external", 16), sourceText);
  const sourceWrap = document.createElement("div");
  sourceWrap.className = "links-detail__row links-detail__row--action";
  sourceWrap.dataset.field = "source_url";
  sourceWrap.appendChild(sourceLink);
  info.append(mapWrap, sourceWrap);

  // Trip plan (Phase 4), read-only here: one block per list with its progress.
  // The participants are the "Pessoas" row above. Hidden when there are no items.
  const planRow = infoRow("clipboard", "Plano do passeio");
  planRow.row.dataset.field = "plan";
  planRow.row.classList.add("links-detail__row--long");
  const planLists = PLAN_LISTS.map(({ key, title }) => {
    const block = document.createElement("div");
    block.className = "links-detail__plan-list";
    block.dataset.planList = key;
    const heading = document.createElement("p");
    heading.className = "links-detail__plan-title";
    const ul = document.createElement("ul");
    ul.className = "links-detail__plan-items";
    block.append(heading, ul);
    planRow.value.appendChild(block);
    return { key, title, block, heading, ul };
  });
  const planError = document.createElement("p");
  planError.className = "links-detail__plan-error";
  planError.setAttribute("role", "alert");
  planError.hidden = true;
  planRow.value.appendChild(planError);
  // "Quem faz o quê": the same items grouped by owner (hidden when nobody owns any).
  const planWho = document.createElement("div");
  planWho.className = "links-detail__plan-list links-detail__plan-who-summary";
  planWho.dataset.planSummary = "who";
  const planWhoTitle = document.createElement("p");
  planWhoTitle.className = "links-detail__plan-title";
  planWhoTitle.textContent = "Quem faz o quê";
  const planWhoUl = document.createElement("ul");
  planWhoUl.className = "links-detail__plan-items";
  planWho.append(planWhoTitle, planWhoUl);
  planRow.value.appendChild(planWho);
  const planEdit = document.createElement("button");
  planEdit.type = "button";
  planEdit.className = "links-detail__action links-detail__plan-edit";
  planEdit.dataset.action = "edit-plan";
  const planEditText = document.createElement("span");
  planEditText.textContent = "Editar plano";
  planEdit.append(uiIcon("edit", 16), planEditText);
  const planEditWrap = document.createElement("div");
  planEditWrap.className = "links-detail__row links-detail__row--action";
  planEditWrap.dataset.field = "plan-edit";
  planEditWrap.appendChild(planEdit);
  const planShare = document.createElement("button");
  planShare.type = "button";
  planShare.className = "links-detail__action links-detail__plan-share";
  planShare.dataset.action = "share-plan";
  const planShareText = document.createElement("span");
  planShareText.textContent = "Enviar no WhatsApp";
  planShare.append(uiIcon("share", 16), planShareText);
  planShare.addEventListener("click", () => void sharePlan());
  const planShareWrap = document.createElement("div");
  planShareWrap.className = "links-detail__row links-detail__row--action";
  planShareWrap.dataset.field = "plan-share";
  planShareWrap.appendChild(planShare);
  info.append(planRow.row, planEditWrap, planShareWrap);

  // Photo poses: ordered list, each with an optional new-tab link and note.
  const posesRow = infoRow("clipboard", "Referências de pose");
  posesRow.row.dataset.field = "pose_refs";
  posesRow.row.classList.add("links-detail__row--long");
  const posesOl = document.createElement("ol");
  posesOl.className = "links-detail__poses";
  posesRow.value.appendChild(posesOl);
  info.append(posesRow.row, linkRow.row);

  body.append(chips, title, info);

  const bar = document.createElement("div");
  bar.className = "links-detail__bar";

  const doneBtn = iconOnlyButton("check", "Marcar como feito", "links-detail__bar-btn", 22);
  const openLink = document.createElement("a");
  openLink.className = "links-detail__bar-btn";
  openLink.rel = "noopener noreferrer";
  openLink.target = "_blank";
  openLink.setAttribute("aria-label", "Abrir link original");
  openLink.title = "Abrir link original";
  openLink.appendChild(uiIcon("external", 22));

  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "links-detail__primary";
  const primaryText = document.createElement("span");
  primary.append(uiIcon("calendar", 20), primaryText);

  const unmarkBtn = iconOnlyButton(
    "check",
    "Desmarcar como feito",
    "links-detail__bar-btn links-detail__bar-btn--on",
    22
  );
  unmarkBtn.hidden = true;

  bar.append(doneBtn, unmarkBtn, openLink, primary);
  dialog.append(hero, body, bar);
  overlay.appendChild(dialog);

  function chip(text: string, modifier: string): HTMLElement {
    const el = document.createElement("span");
    el.className = `links-detail__chip links-detail__chip--${modifier}`;
    el.textContent = text;
    return el;
  }

  function close(): void {
    if (overlay.hidden) return;
    more.close();
    overlay.hidden = true;
    current = null;
    syncBodyScreenLock();
    cb.onOpenChange?.(null);
    if (previouslyFocused && previouslyFocused.isConnected) {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
  }

  function open(link: LinkRow): void {
    if (overlay.hidden) {
      previouslyFocused = document.activeElement as HTMLElement | null;
    }
    current = link;
    const category = resolveCategory(link);
    const src = categoryBackdropSrc(category, link.image_url);
    if (src) heroImg.src = src;
    else heroImg.removeAttribute("src");

    chips.replaceChildren(chip(categoryLabel(category), "category"));
    const hasSchedule = Boolean(link.scheduled_start && link.scheduled_end);
    if (hasSchedule) chips.appendChild(chip("Agendado", "schedule"));
    if (link.status === "done") chips.appendChild(chip("Feito", "done"));

    title.textContent = displayTitle(link);

    if (hasSchedule && link.scheduled_start && link.scheduled_end) {
      scheduleRow.row.hidden = false;
      scheduleRow.value.textContent = formatScheduleLabel(
        link.scheduled_start,
        link.scheduled_end
      );
      primaryText.textContent = "Reagendar";
    } else {
      scheduleRow.row.hidden = true;
      scheduleRow.value.textContent = "";
      primaryText.textContent = "Agendar";
    }
    noteRow.row.hidden = !link.description;
    noteRow.value.textContent = link.description ?? "";
    memoryRow.row.hidden = !link.note;
    memoryRow.value.textContent = link.note ?? "";
    for (const r of moreRows) {
      const value = link[r.field.key] ?? "";
      r.row.hidden = !value;
      r.value.textContent = value;
    }
    for (const [kind, row, values, pick] of [
      ["tag", tagsRow, link.tags, cb.onTag],
      ["person", peopleRow, link.people, cb.onPerson],
    ] as const) {
      const chips = filterChips(kind, "detail", values, (value) => {
        close();
        pick?.(value);
      });
      row.row.hidden = chips.length === 0;
      row.value.replaceChildren(...chips);
    }
    const mapUrl = buildMapUrl(link.address, link.city);
    mapWrap.hidden = mapUrl === null;
    mapLink.hidden = mapUrl === null;
    if (mapUrl) mapLink.href = mapUrl;
    else mapLink.removeAttribute("href");
    // Defense in depth: only ever link an https value, even if the row was
    // written by something else.
    const source = link.source_url && isHttpsUrl(link.source_url) ? link.source_url : null;
    sourceWrap.hidden = source === null;
    if (source) sourceLink.href = source;
    else sourceLink.removeAttribute("href");

    const poseRefs = readPoseRefs(link.pose_refs);
    posesRow.row.hidden = poseRefs.length === 0;
    posesOl.replaceChildren(...poseRefs.map(renderPoseItem));

    planError.hidden = true;
    renderPlan();
    planEditWrap.hidden = !cb.onEditPlan;
    planShareWrap.hidden = !hasPlanToShare(link);

    domainText.textContent = linkDomain(link.url);
    original.href = link.url;
    openLink.href = link.url;
    const isDone = link.status === "done";
    doneBtn.hidden = isDone;
    unmarkBtn.hidden = !isDone || !cb.onUnmarkDone;

    visitRow.row.hidden = !(isDone && link.completed_at && formatVisitDate(link.completed_at));
    visitRow.value.textContent = isDone ? formatVisitDate(link.completed_at) : "";
    const rated = hasRating(link);
    ratingRow.row.hidden = !rated;
    ratingRow.value.textContent = rated ? ratingOutOf(link.rating) : "";
    const again = isDone && link.want_again;
    wantAgainRow.row.hidden = !again;
    wantAgainRow.value.textContent = again ? "Sim" : "";
    const impressionsText = isDone ? (link.impressions ?? "").trim() : "";
    impressionsRow.row.hidden = impressionsText === "";
    impressionsRow.value.textContent = impressionsText;
    const lessonItems = isDone ? readLessons(link.lessons) : [];
    lessonsRow.row.hidden = lessonItems.length === 0;
    lessonsOl.replaceChildren(
      ...lessonItems.map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      })
    );
    const memory = isDone ? parseMemoryLink(link.memory_url) : null;
    memoryWrap.hidden = memory === null;
    memoryThumb.hidden = true;
    memoryThumb.removeAttribute("src");
    if (memory?.kind === "youtube") {
      memoryThumb.src = memory.thumbnailUrl;
      memoryThumb.hidden = false;
      memoryActionText.textContent = "Assistir";
      memoryAction.href = memory.watchUrl;
    } else if (memory?.kind === "album") {
      memoryActionText.textContent = "Ver álbum";
      memoryAction.href = memory.url;
    } else {
      memoryActionText.textContent = "";
      memoryAction.removeAttribute("href");
    }
    reviewEditWrap.hidden = !isDone || !cb.onEditReview;

    const panel = isPanelMode();
    dialog.setAttribute("aria-modal", panel ? "false" : "true");
    overlay.hidden = false;
    dialog.scrollTop = 0;
    syncBodyScreenLock();
    cb.onOpenChange?.(link.id);
    backBtn.focus({ preventScroll: true });
  }

  /** Share the plan as text: native share sheet when present, else wa.me in a new tab. */
  async function sharePlan(): Promise<void> {
    if (!current) return;
    const text = buildPlanMessage(current);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          window.open(whatsappUrl(text), "_blank", "noopener");
        }
      }
      return;
    }
    window.open(whatsappUrl(text), "_blank", "noopener");
  }

  /** Plan section of the open link: one checkbox per item, progress per list. */
  function renderPlan(): void {
    if (!current) return;
    const planItems = readPlanItems(current.plan_items);
    planRow.row.hidden = planItems.length === 0;
    for (const list of planLists) {
      const entries = planItems
        .map((item, index) => ({ item, index }))
        .filter((e) => e.item.list === list.key);
      list.block.hidden = entries.length === 0;
      list.heading.textContent = `${list.title} · ${planProgress(planItems, list.key).label}`;
      list.ul.replaceChildren(
        ...entries.map(({ item, index }) => {
          const li = document.createElement("li");
          li.className = "links-detail__plan-item";
          if (item.done) li.classList.add("links-detail__plan-item--done");
          const label = document.createElement("label");
          label.className = "links-detail__plan-check";
          const box = document.createElement("input");
          box.type = "checkbox";
          box.checked = item.done;
          box.disabled = !cb.onSavePlanItems;
          box.addEventListener("change", () => void tickPlanItem(index, box.checked));
          const text = document.createElement("span");
          text.className = "links-detail__plan-text";
          text.textContent = item.text;
          label.append(box, text);
          li.appendChild(label);
          if (item.who) {
            const who = document.createElement("span");
            who.className = "links-detail__plan-who";
            who.textContent = item.who;
            li.appendChild(who);
          }
          return li;
        })
      );
    }
    const byPerson = planByPerson(planItems);
    planWho.hidden = byPerson.length === 0;
    planWhoUl.replaceChildren(
      ...byPerson.map((group) => {
        const li = document.createElement("li");
        li.className = "links-detail__plan-item";
        li.dataset.person = group.who;
        const name = document.createElement("span");
        name.className = "links-detail__plan-text";
        name.textContent = group.who;
        const what = document.createElement("span");
        what.className = "links-detail__plan-who";
        what.textContent = `${group.items.map((i) => i.text).join(", ")} · ${group.done} de ${group.items.length}`;
        li.append(name, what);
        return li;
      })
    );
  }

  /** Optimistic: show the tick, save, and put the item back if the save fails. */
  async function tickPlanItem(index: number, done: boolean): Promise<void> {
    const link = current;
    if (!link || !cb.onSavePlanItems) return;
    const items = readPlanItems(link.plan_items);
    const previous = items[index]?.done ?? !done;
    const next = togglePlanItem(items, index, done);
    planError.hidden = true;
    current = { ...link, plan_items: next };
    renderPlan();
    try {
      await cb.onSavePlanItems(link, next);
    } catch (err) {
      if (current?.id !== link.id) return;
      const latest = readPlanItems(current.plan_items);
      current = { ...current, plan_items: togglePlanItem(latest, index, previous) };
      planError.textContent =
        err instanceof Error && err.message !== "" ? err.message : "Não foi possível salvar. Tente novamente.";
      planError.hidden = false;
      renderPlan();
    }
  }

  function act(fn: (link: LinkRow) => void): void {
    if (!current) return;
    const link = current;
    close();
    fn(link);
  }

  primary.addEventListener("click", () => act(cb.onSchedule));
  doneBtn.addEventListener("click", () => act(cb.onMarkDone));
  unmarkBtn.addEventListener("click", () => {
    if (cb.onUnmarkDone) act(cb.onUnmarkDone);
  });
  reviewEdit.addEventListener("click", () => {
    if (cb.onEditReview) act(cb.onEditReview);
  });
  planEdit.addEventListener("click", () => {
    if (cb.onEditPlan) act(cb.onEditPlan);
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
    currentId: () => current?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Form -> repo payload helpers. Icon preset is inferred from the URL.
// ---------------------------------------------------------------------------

export function toCreateInput(values: LinkFormValues, sortOrder: number): CreateLinkInput {
  const resolved = withResolvedLabel(values);
  assertFormValues(resolved);
  return {
    url: resolved.url,
    label: resolved.label,
    description: resolved.description.length > 0 ? resolved.description : null,
    icon_preset: inferIconPreset(resolved.url),
    icon_url: null,
    category: pickCategory(resolved),
    sort_order: sortOrder,
    image_url: resolved.image_url.length > 0 ? resolved.image_url : null,
    note: resolved.note.length > 0 ? resolved.note : null,
    source_url: resolved.source_url.length > 0 ? resolved.source_url : null,
    pose_refs: draftsToPoseRefs(resolved.pose_refs),
    ...moreTextPayload(resolved),
    tags: tagsPayload(resolved),
    people: peoplePayload(resolved),
  };
}

export function toUpdatePatch(values: LinkFormValues): UpdateLinkPatch {
  const resolved = withResolvedLabel(values);
  assertFormValues(resolved);
  return {
    url: resolved.url,
    label: resolved.label,
    description: resolved.description.length > 0 ? resolved.description : null,
    icon_preset: inferIconPreset(resolved.url),
    icon_url: null,
    category: pickCategory(resolved),
    image_url: resolved.image_url.length > 0 ? resolved.image_url : null,
    note: resolved.note.length > 0 ? resolved.note : null,
    source_url: resolved.source_url.length > 0 ? resolved.source_url : null,
    pose_refs: draftsToPoseRefs(resolved.pose_refs),
    ...moreTextPayload(resolved),
    tags: tagsPayload(resolved),
    people: peoplePayload(resolved),
  };
}

/** Registry text fields -> payload keys (blank -> null). */
function moreTextPayload(values: LinkFormValues): Record<MoreTextKey, string | null> {
  const out = {} as Record<MoreTextKey, string | null>;
  for (const field of MORE_TEXT_FIELDS) {
    const value = values[field.key].trim();
    out[field.key] = value.length > 0 ? value : null;
  }
  return out;
}

/** Normalized, deduped tags; empty -> null. */
function tagsPayload(values: LinkFormValues): string[] | null {
  const tags = dedupeTags(values.tags);
  return tags.length > 0 ? tags : null;
}

/** Normalized, deduped people; empty -> null. */
function peoplePayload(values: LinkFormValues): string[] | null {
  const people = dedupePeople(values.people);
  return people.length > 0 ? people : null;
}

/** Explicit chip choice wins; otherwise infer from the text fields. */
function pickCategory(values: LinkFormValues): Category {
  return values.category && isCategory(values.category)
    ? values.category
    : inferCategory(values);
}

/** Blank Nome falls back to the URL's hostname so quick-add can skip typing one. */
function withResolvedLabel(values: LinkFormValues): LinkFormValues {
  const label = values.label.trim();
  if (label.length > 0) return { ...values, label };
  return { ...values, label: deriveLabelFromUrl(values.url) };
}

function assertFormValues(values: LinkFormValues): void {
  if (!isHttpsUrl(values.url)) {
    throw new Error("Link inválido.");
  }
  if (values.label.length < 1) {
    throw new Error("O título é obrigatório.");
  }
  if (values.image_url.length > 0 && !isHttpsUrl(values.image_url)) {
    throw new Error("Foto inválida.");
  }
  if (dedupeTags(values.tags).length > MAX_TAGS) {
    throw new Error(`Use no máximo ${MAX_TAGS} tags.`);
  }
  if (dedupePeople(values.people).length > MAX_PEOPLE) {
    throw new Error(`Use no máximo ${MAX_PEOPLE} pessoas.`);
  }
  // Strict: the form normalizes before this, the stored value must be https.
  if (!isOptionalHttpsUrl(values.source_url)) throw new Error(`${SOURCE_TERM} inválido.`);
  const poseError = poseRefsError(values.pose_refs);
  if (poseError) throw new Error(poseError);
  for (const field of MORE_TEXT_FIELDS) {
    if (values[field.key].length > field.max) {
      throw new Error(`${field.term} deve ter no máximo ${field.max} caracteres.`);
    }
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

type LabelledTextarea = {
  wrapper: HTMLElement;
  input: HTMLTextAreaElement;
  syncHeight: () => void;
};

function labelledTextarea(id: string, labelText: string): LabelledTextarea {
  const wrapper = document.createElement("div");
  wrapper.className = "links-admin-form__field";

  const label = document.createElement("label");
  label.className = "links-admin-form__label";
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement("textarea");
  input.className = "links-admin-form__control links-admin-form__control--textarea";
  input.id = id;
  input.rows = 3;

  // Grow the textarea to fit its content so long notes stay fully visible
  // instead of scrolling inside a fixed-height box.
  const autoGrow = (): void => {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };
  input.addEventListener("input", autoGrow);

  wrapper.append(label, input);
  return { wrapper, input, syncHeight: autoGrow };
}

/** Appends a discreet "N / MAX" counter under a field; returns a fn to refresh it. */
function attachCharCounter(
  wrapper: HTMLElement,
  input: HTMLInputElement | HTMLTextAreaElement,
  max: number
): () => void {
  const counter = document.createElement("span");
  counter.className = "links-admin-form__counter";
  counter.setAttribute("aria-hidden", "true");

  const update = (): void => {
    counter.textContent = `${input.value.length} / ${max}`;
  };
  input.addEventListener("input", update);
  wrapper.appendChild(counter);
  update();
  return update;
}

/**
 * Adds a "Colar" button beside a URL field that fills it from the
 * clipboard. Renders nothing if the Clipboard read API isn't available
 * (progressive enhancement — the field still works via normal paste).
 */
function attachPasteButton(
  field: LabelledInput,
  setError: (message: string | null) => void
): void {
  const clipboard = navigator.clipboard as
    | { readText?: () => Promise<string> }
    | undefined;
  if (!clipboard?.readText) return;

  const row = document.createElement("div");
  row.className = "links-admin-form__input-row";
  field.input.replaceWith(row);
  row.append(field.input);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "links-admin-button links-admin-button--ghost links-admin-form__paste-btn";
  const pasteText = document.createElement("span");
  pasteText.textContent = "Colar";
  btn.append(uiIcon("clipboard", 18), pasteText);
  btn.setAttribute("data-action", "paste-url");
  row.append(btn);

  btn.addEventListener("click", () => {
    void (async () => {
      try {
        const text = await clipboard.readText!();
        const trimmed = text.trim();
        if (trimmed.length > 0) {
          field.input.value = trimmed;
          setError(null);
        }
      } catch {
        setError("Não foi possível colar automaticamente. Cole manualmente.");
      }
    })();
  });
}
