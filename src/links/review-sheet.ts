import { createScreenChrome } from "./admin-ui";
import { setScreenBusy } from "./skeleton";
import { syncBodyScreenLock } from "./screen-lock";
import { uiIcon } from "./ui-icons";
import {
  MEMORY_URL_TERM,
  RATING_MAX,
  RATING_MIN,
  REVIEW_LIMITS,
  memoryUrlError,
  type ReviewValues,
} from "./review";
import { LESSON_MAX, MAX_LESSONS } from "./lessons";
import { moveItem } from "./poses";

/**
 * "Como foi" bottom sheet: opened after marking a place as done (skippable) and
 * from the detail view (edit).
 *
 * Extension point for the other Phase 3 fields: the sheet is a list of
 * `ReviewControl`s (see `buildControls`). A new field = one factory returning
 * `{ element, set, read }` plus one entry in that list; save/skip/busy/error
 * handling is shared and needs no change.
 */

const TEXT_INPUT_TYPES = new Set(["text", "url", "search", "email", "tel"]);

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type ReviewControl = {
  element: HTMLElement;
  /** Fills the control from the values the sheet was opened with. */
  set: (values: ReviewValues) => void;
  /** Writes the control's current value into `draft`. */
  read: (draft: ReviewValues) => void;
  /** Element that takes focus when the sheet opens (optional). */
  focusTarget?: () => HTMLElement | null;
};

export type ReviewSheetOpenOpts = {
  /** Place title, shown under the heading. */
  label: string;
  initial: ReviewValues;
  /** "after-done" (default): dismiss button reads Pular. "edit": Cancelar. */
  mode?: "after-done" | "edit";
  onSave: (values: ReviewValues) => void | Promise<void>;
  /** Fired on Pular / Cancelar / X / Escape (never saves anything). */
  onSkip?: () => void;
};

export type ReviewSheetHandle = {
  element: HTMLElement;
  open: (opts: ReviewSheetOpenOpts) => void;
  close: () => void;
  setBusy: (busy: boolean) => void;
  setError: (message: string) => void;
};

function createRatingControl(): ReviewControl {
  let value: number | null = null;

  const field = document.createElement("div");
  field.className = "links-admin-form__field links-review__field";

  const labelRow = document.createElement("div");
  labelRow.className = "links-review__label-row";
  const label = document.createElement("span");
  label.className = "links-admin-form__label";
  label.id = "links-review-rating-label";
  label.textContent = "Nota";
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "links-review__clear";
  clearBtn.dataset.action = "clear-rating";
  clearBtn.textContent = "Limpar nota";
  clearBtn.hidden = true;
  labelRow.append(label, clearBtn);

  const group = document.createElement("div");
  group.className = "links-review__stars";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Nota");

  const stars: HTMLButtonElement[] = [];
  for (let n = RATING_MIN; n <= RATING_MAX; n++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "links-review__star";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-label", `${n} de ${RATING_MAX}`);
    btn.dataset.rating = String(n);
    btn.appendChild(uiIcon("star", 30));
    stars.push(btn);
  }
  group.append(...stars);

  function render(): void {
    stars.forEach((btn, i) => {
      const n = i + 1;
      const selected = value === n;
      btn.setAttribute("aria-checked", String(selected));
      btn.classList.toggle("links-review__star--on", value !== null && n <= value);
      // Roving tabindex: the selected star, else the first, is the single tab stop.
      btn.tabIndex = selected || (value === null && i === 0) ? 0 : -1;
    });
    clearBtn.hidden = value === null;
  }

  function select(next: number | null, focus = false): void {
    value = next;
    render();
    if (focus && next !== null) stars[next - 1]?.focus();
  }

  stars.forEach((btn, i) => {
    const n = i + 1;
    btn.addEventListener("click", () => select(value === n ? null : n));
    btn.addEventListener("keydown", (e) => {
      let target: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        target = Math.min(n + 1, RATING_MAX);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        target = Math.max(n - 1, RATING_MIN);
      } else if (e.key === "Home") {
        target = RATING_MIN;
      } else if (e.key === "End") {
        target = RATING_MAX;
      }
      if (target === null) return;
      e.preventDefault();
      select(target, true);
    });
  });
  clearBtn.addEventListener("click", () => {
    select(null);
    stars[0]?.focus();
  });

  field.append(labelRow, group);
  render();

  return {
    element: field,
    set: (values) => select(values.rating),
    read: (draft) => {
      draft.rating = value;
    },
    focusTarget: () => stars.find((s) => s.tabIndex === 0) ?? null,
  };
}

function createWantAgainControl(): ReviewControl {
  const label = document.createElement("label");
  label.className = "links-review__toggle";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "links-review__toggle-input";
  input.id = "links-review-want-again";

  const text = document.createElement("span");
  text.className = "links-review__toggle-text";
  text.textContent = "Voltaria?";

  const hint = document.createElement("span");
  hint.className = "links-review__toggle-hint";
  hint.textContent = "Marque se repetiria o passeio.";

  const textWrap = document.createElement("span");
  textWrap.className = "links-review__toggle-copy";
  textWrap.append(text, hint);
  label.append(input, textWrap);

  return {
    element: label,
    set: (values) => {
      input.checked = values.want_again;
    },
    read: (draft) => {
      draft.want_again = input.checked;
    },
  };
}

function createImpressionsControl(): ReviewControl {
  const field = document.createElement("div");
  field.className = "links-admin-form__field links-review__field";

  const label = document.createElement("label");
  label.className = "links-admin-form__label";
  label.htmlFor = "links-review-impressions";
  label.textContent = "Impressões";

  const input = document.createElement("textarea");
  input.className = "links-admin-form__control links-admin-form__control--textarea";
  input.id = "links-review-impressions";
  input.rows = 4;
  input.maxLength = REVIEW_LIMITS.impressionsMax;
  input.placeholder = "O que gostou, o que não gostou, se valeu o preço.";

  field.append(label, input);
  return {
    element: field,
    set: (values) => {
      input.value = values.impressions;
    },
    read: (draft) => {
      draft.impressions = input.value;
    },
  };
}

function lessonToolButton(glyph: string, ariaLabel: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "links-poses__tool";
  btn.setAttribute("aria-label", ariaLabel);
  btn.title = ariaLabel;
  btn.textContent = glyph;
  return btn;
}

/** Ordered list of short items; same pattern as the pose list in the place form. */
function createLessonsControl(): ReviewControl {
  let lessons: string[] = [];

  const fieldset = document.createElement("fieldset");
  fieldset.className = "links-admin-form__field links-poses links-lessons";
  const legend = document.createElement("legend");
  legend.className = "links-admin-form__label";
  legend.textContent = "Lições aprendidas";
  const list = document.createElement("ol");
  list.className = "links-poses__list";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "links-poses__add";
  addBtn.setAttribute("aria-label", "Adicionar lição");
  addBtn.append(uiIcon("plus", 18), document.createTextNode("Adicionar lição"));
  fieldset.append(legend, list, addBtn);

  function render(focus?: string): void {
    list.replaceChildren();
    lessons.forEach((text, i) => {
      const n = i + 1;
      const item = document.createElement("li");
      item.className = "links-poses__item links-lessons__item";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "links-admin-form__control links-lessons__text";
      input.id = `links-review-lesson-${i}`;
      input.maxLength = LESSON_MAX;
      input.autocomplete = "off";
      input.setAttribute("aria-label", `Lição ${n}`);
      input.value = text;
      input.addEventListener("input", () => {
        lessons[i] = input.value;
      });

      const tools = document.createElement("div");
      tools.className = "links-poses__tools";
      const up = lessonToolButton("↑", `Subir lição ${n}`);
      up.disabled = i === 0;
      up.dataset.focusKey = `up-${i}`;
      up.addEventListener("click", () => {
        lessons = moveItem(lessons, i, i - 1);
        render(`up-${i - 1}`);
      });
      const down = lessonToolButton("↓", `Descer lição ${n}`);
      down.disabled = i === lessons.length - 1;
      down.dataset.focusKey = `down-${i}`;
      down.addEventListener("click", () => {
        lessons = moveItem(lessons, i, i + 1);
        render(`down-${i + 1}`);
      });
      const remove = lessonToolButton("×", `Remover lição ${n}`);
      remove.addEventListener("click", () => {
        lessons = lessons.filter((_, j) => j !== i);
        render("add");
      });
      tools.append(up, down, remove);

      item.append(input, tools);
      list.appendChild(item);
    });
    addBtn.disabled = lessons.length >= MAX_LESSONS;
    if (focus === "add") addBtn.focus();
    else if (focus) {
      const target = list.querySelector<HTMLElement>(`[data-focus-key='${focus}']`);
      // A moved row can land at an edge where that button is disabled.
      if (target && !(target as HTMLButtonElement).disabled) target.focus();
    }
  }

  addBtn.addEventListener("click", () => {
    if (lessons.length >= MAX_LESSONS) return;
    lessons.push("");
    render();
    list.querySelector<HTMLInputElement>(`#links-review-lesson-${lessons.length - 1}`)?.focus();
  });

  return {
    element: fieldset,
    set: (values) => {
      lessons = [...values.lessons];
      render();
    },
    read: (draft) => {
      draft.lessons = [...lessons];
    },
  };
}

/** Memory link: YouTube video or album, https only, validated inline. */
function createMemoryUrlControl(): ReviewControl {
  const field = document.createElement("div");
  field.className = "links-admin-form__field links-review__field";

  const id = "links-review-memory-url";
  const label = document.createElement("label");
  label.className = "links-admin-form__label";
  label.htmlFor = id;
  label.textContent = MEMORY_URL_TERM;

  const input = document.createElement("input");
  input.className = "links-admin-form__control";
  input.id = id;
  input.type = "url";
  input.placeholder = "https://";
  input.autocomplete = "off";
  input.dataset.field = "memory_url";

  const hint = document.createElement("p");
  hint.className = "links-review__toggle-hint";
  hint.textContent = "Vídeo do YouTube ou álbum de fotos.";

  const error = document.createElement("p");
  error.id = `${id}-error`;
  error.className = "links-admin-form__field-error";
  error.hidden = true;
  input.setAttribute("aria-describedby", error.id);

  function validate(): void {
    const message = memoryUrlError(input.value);
    error.textContent = message ?? "";
    error.hidden = message === null;
    if (message === null) input.removeAttribute("aria-invalid");
    else input.setAttribute("aria-invalid", "true");
  }
  input.addEventListener("input", validate);

  field.append(label, input, hint, error);
  return {
    element: field,
    set: (values) => {
      input.value = values.memory_url;
      validate();
    },
    read: (draft) => {
      draft.memory_url = input.value;
    },
  };
}

/** Controls in on-screen order. Add the next field's control here. */
function buildControls(): ReviewControl[] {
  return [
    createRatingControl(),
    createWantAgainControl(),
    createImpressionsControl(),
    createLessonsControl(),
    createMemoryUrlControl(),
  ];
}

export function createReviewSheet(): ReviewSheetHandle {
  let onSaveCb: ReviewSheetOpenOpts["onSave"] | null = null;
  let onSkipCb: (() => void) | null = null;
  let previouslyFocused: HTMLElement | null = null;
  let busy = false;

  const { overlay, dialog, backBtn } = createScreenChrome(
    "links-review-title",
    "Como foi",
    "dialog"
  );
  dialog.classList.add("links-admin-modal__dialog--review");
  overlay.classList.add("links-review-sheet");

  const placeName = document.createElement("p");
  placeName.className = "links-review__place";

  const form = document.createElement("form");
  form.className = "links-admin-form links-admin-form--screen links-admin-form--review";
  form.noValidate = true;

  const controls = buildControls();

  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "links-admin-form__actions links-admin-form__actions--sticky";

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "links-admin-button links-admin-button--primary links-admin-button--block";
  saveBtn.textContent = "Salvar";

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "links-admin-button links-admin-button--ghost links-admin-button--block";
  skipBtn.dataset.action = "skip-review";
  skipBtn.textContent = "Pular";

  actions.append(saveBtn, skipBtn);
  form.append(...controls.map((c) => c.element), error, actions);
  dialog.append(placeName, form);

  function setBusy(next: boolean): void {
    busy = next;
    saveBtn.disabled = next;
    skipBtn.disabled = next;
    backBtn.disabled = next;
    setScreenBusy(dialog, next);
  }

  function setError(message: string): void {
    error.textContent = message;
    error.hidden = message === "";
  }

  function close(): void {
    if (overlay.hidden) return;
    overlay.hidden = true;
    onSaveCb = null;
    onSkipCb = null;
    setBusy(false);
    setError("");
    syncBodyScreenLock();
    if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    previouslyFocused = null;
  }

  function dismiss(): void {
    if (busy) return;
    const cb = onSkipCb;
    close();
    cb?.();
  }

  function open(opts: ReviewSheetOpenOpts): void {
    if (overlay.hidden) previouslyFocused = document.activeElement as HTMLElement | null;
    onSaveCb = opts.onSave;
    onSkipCb = opts.onSkip ?? null;
    placeName.textContent = opts.label;
    skipBtn.textContent = opts.mode === "edit" ? "Cancelar" : "Pular";
    setError("");
    for (const control of controls) control.set(opts.initial);
    overlay.hidden = false;
    syncBodyScreenLock();
    controls.map((c) => c.focusTarget?.() ?? null).find(Boolean)?.focus({ preventScroll: true });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!onSaveCb || busy) return;
    const draft: ReviewValues = {
      rating: null,
      want_again: false,
      impressions: "",
      lessons: [],
      memory_url: "",
    };
    for (const control of controls) control.read(draft);
    setError("");
    void Promise.resolve(onSaveCb(draft)).catch(() => undefined);
  });
  form.addEventListener("focusin", (e) => {
    const el = e.target;
    const isText =
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type));
    if (!isText || typeof el.scrollIntoView !== "function") return;
    // Let the on-screen keyboard settle, then keep the field above it.
    el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  });
  skipBtn.addEventListener("click", dismiss);
  backBtn.addEventListener("click", dismiss);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      dismiss();
    }
  });

  return { element: overlay, open, close, setBusy, setError };
}
