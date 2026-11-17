import { createScreenChrome } from "./admin-ui";
import { toolButton } from "./tool-button";
import { createChipInput, type ChipInputHandle } from "./chip-input";
import { MAX_PEOPLE, MAX_PERSON_LENGTH, normalizePerson, personKey } from "./people";
import {
  MAX_PLAN_ITEMS,
  PLAN_LISTS,
  PLAN_TEXT_MAX,
  ownerOptions,
  type PlanDraft,
  type PlanList,
  type PlanValues,
} from "./plan";
import { suggestLessons } from "./lesson-suggestions";
import { moveItem } from "./poses";
import { setScreenBusy } from "./skeleton";
import { syncBodyScreenLock } from "./screen-lock";
import { uiIcon } from "./ui-icons";
import { resetPageZoom } from "./viewport-zoom";

/**
 * "Plano do passeio" bottom sheet, opened from the place detail. Same pattern
 * as the "Como foi" sheet (review-sheet.ts): opens at the top, resets the page
 * zoom, flowing (non-sticky) action bar, controls at least 16px.
 *
 * Edits the participants (the people field, chip input) and the two item lists.
 * Each item has an owner select (`who`: "Ninguém" + participants + the stored
 * owner when no longer a participant). `done` is carried through untouched.
 */

const TEXT_INPUT_TYPES = new Set(["text", "url", "search", "email", "tel"]);

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type PlanSheetOpenOpts = {
  /** Place title, shown under the heading. */
  label: string;
  initial: PlanValues;
  onSave: (values: PlanValues) => void | Promise<void>;
  /** Fired on Cancelar / X / Escape (never saves anything). */
  onSkip?: () => void;
};

export type PlanSheetOptions = {
  /** Names already used in other places (autocomplete for the participants). */
  getPeopleSuggestions?: () => readonly string[];
  /** Lessons from done places, most frequent first ("Sugestões das suas lições"). */
  getLessonCandidates?: () => readonly string[];
};

export type PlanSheetHandle = {
  element: HTMLElement;
  open: (opts: PlanSheetOpenOpts) => void;
  close: () => void;
  setBusy: (busy: boolean) => void;
  setError: (message: string) => void;
};

type PlanListControl = {
  element: HTMLElement;
  set: (items: readonly PlanDraft[]) => void;
  read: () => PlanDraft[];
  /** Appends a filled item at the end (no redraw: the caller redraws every list). */
  append: (text: string) => void;
  /** Redraws the rows (numbers and the add button depend on the other lists). */
  render: () => void;
};

/** Fills the owner select; the stored owner stays selectable even if no longer a participant. */
function fillOwnerSelect(
  select: HTMLSelectElement,
  participants: readonly string[],
  who: string
): void {
  select.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Ninguém";
  select.appendChild(none);
  const names = ownerOptions(participants, who);
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  const current = personKey(who);
  const match = names.find((n) => personKey(n) === current);
  select.value = current === "" || match === undefined ? "" : match;
}

const ADD_LABEL: Record<PlanList, string> = {
  checklist: "Adicionar item ao checklist",
  compras: "Adicionar item a lanches e compras",
};

/**
 * One editable list. `offset` is the number of items in the lists shown above
 * it, so the item numbers in labels and in validation messages match.
 */
function createListControl(
  list: PlanList,
  title: string,
  offset: () => number,
  totalCount: () => number,
  onChange: () => void,
  getParticipants: () => readonly string[]
): PlanListControl {
  let rows: PlanDraft[] = [];

  const fieldset = document.createElement("fieldset");
  fieldset.className = "links-admin-form__field links-poses links-plan";
  fieldset.dataset.planList = list;
  const legend = document.createElement("legend");
  legend.className = "links-admin-form__label";
  legend.textContent = title;
  const ol = document.createElement("ol");
  ol.className = "links-poses__list";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "links-poses__add";
  addBtn.setAttribute("aria-label", ADD_LABEL[list]);
  addBtn.append(uiIcon("plus", 18), document.createTextNode("Adicionar item"));
  fieldset.append(legend, ol, addBtn);

  function focusInput(index: number): void {
    ol.querySelectorAll<HTMLInputElement>(".links-plan__text")[index]?.focus();
  }

  function render(focus?: string): void {
    ol.replaceChildren();
    const movable = rows.length > 1;
    rows.forEach((row, i) => {
      const n = offset() + i + 1;
      const li = document.createElement("li");
      li.className = "links-poses__item links-plan__item";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "links-admin-form__control links-plan__text";
      input.id = `links-plan-${list}-${i}`;
      input.maxLength = PLAN_TEXT_MAX;
      input.autocomplete = "off";
      input.setAttribute("enterkeyhint", "next");
      input.setAttribute("aria-label", `Item ${n}`);
      input.value = row.text;
      input.addEventListener("input", () => {
        row.text = input.value;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || e.isComposing) return;
        // Enter never submits the sheet: it moves on to a fresh item below.
        e.preventDefault();
        if (totalCount() >= MAX_PLAN_ITEMS) return;
        if (i === rows.length - 1 && row.text.trim() === "") return;
        rows.splice(i + 1, 0, { text: "", list, who: "", done: false });
        onChange();
        focusInput(i + 1);
      });

      const ownerSelect = document.createElement("select");
      ownerSelect.className = "links-admin-form__control links-plan__who";
      ownerSelect.id = `links-plan-who-${list}-${i}`;
      ownerSelect.setAttribute("aria-label", `Quem faz o item ${n}`);
      fillOwnerSelect(ownerSelect, getParticipants(), row.who);
      const refreshOwner = (): void => {
        // Participants may have changed since the row was drawn.
        const current = row.who;
        fillOwnerSelect(ownerSelect, getParticipants(), current);
      };
      ownerSelect.addEventListener("focus", refreshOwner);
      ownerSelect.addEventListener("change", () => {
        row.who = ownerSelect.value;
      });

      const tools = document.createElement("div");
      tools.className = "links-poses__tools";
      if (movable) {
        const up = toolButton("↑", `Subir item ${n}`);
        up.disabled = i === 0;
        up.dataset.focusKey = `up-${i}`;
        up.addEventListener("click", () => {
          rows = moveItem(rows, i, i - 1);
          render(`up-${i - 1}`);
        });
        const down = toolButton("↓", `Descer item ${n}`);
        down.disabled = i === rows.length - 1;
        down.dataset.focusKey = `down-${i}`;
        down.addEventListener("click", () => {
          rows = moveItem(rows, i, i + 1);
          render(`down-${i + 1}`);
        });
        tools.append(up, down);
      }
      const remove = toolButton("×", `Remover item ${n}`);
      remove.addEventListener("click", () => {
        rows = rows.filter((_, j) => j !== i);
        onChange();
        addBtn.focus();
      });
      tools.append(remove);

      li.append(input, ownerSelect, tools);
      ol.appendChild(li);
    });
    addBtn.disabled = totalCount() >= MAX_PLAN_ITEMS;
    if (focus === "add") addBtn.focus();
    else if (focus) {
      const target = ol.querySelector<HTMLButtonElement>(`[data-focus-key='${focus}']`);
      // A moved row can land at an edge where that button is disabled.
      if (target && !target.disabled) target.focus();
    }
  }

  addBtn.addEventListener("click", () => {
    if (totalCount() >= MAX_PLAN_ITEMS) return;
    rows.push({ text: "", list, who: "", done: false });
    onChange();
    focusInput(rows.length - 1);
  });

  return {
    element: fieldset,
    set: (items) => {
      rows = items.map((d) => ({ ...d }));
      render();
    },
    read: () => rows.map((d) => ({ ...d })),
    append: (text) => {
      rows.push({ text, list, who: "", done: false });
    },
    render: () => render(),
  };
}

export function createPlanSheet(options: PlanSheetOptions = {}): PlanSheetHandle {
  let onSaveCb: PlanSheetOpenOpts["onSave"] | null = null;
  let onSkipCb: (() => void) | null = null;
  let previouslyFocused: HTMLElement | null = null;
  let busy = false;

  const { overlay, dialog, backBtn } = createScreenChrome(
    "links-plan-title",
    "Plano do passeio",
    "dialog"
  );
  dialog.classList.add("links-admin-modal__dialog--review");
  dialog.tabIndex = -1;
  overlay.classList.add("links-review-sheet", "links-plan-sheet");

  const placeName = document.createElement("p");
  placeName.className = "links-review__place";

  const form = document.createElement("form");
  form.className = "links-admin-form links-admin-form--screen links-admin-form--review";
  form.noValidate = true;

  const peopleInput: ChipInputHandle = createChipInput({
    id: "links-plan-people",
    label: "Participantes",
    prefix: "@",
    placeholder: "quem vai…",
    normalize: normalizePerson,
    key: personKey,
    max: MAX_PEOPLE,
    maxLength: MAX_PERSON_LENGTH,
    splitOnSpace: false,
    getSuggestions: () => options.getPeopleSuggestions?.() ?? [],
  });

  // Numbers and add buttons depend on the other lists: any change redraws all.
  const listControls: PlanListControl[] = [];
  const suggestions = document.createElement("section");
  suggestions.className = "links-admin-form__field links-plan-suggestions";
  suggestions.dataset.lessonSuggestions = "";
  suggestions.setAttribute("aria-label", "Sugestões das suas lições");
  suggestions.hidden = true;
  const suggestionsTitle = document.createElement("p");
  suggestionsTitle.className = "links-admin-form__label";
  suggestionsTitle.textContent = "Sugestões das suas lições";
  const suggestionList = document.createElement("div");
  suggestionList.className = "links-plan-suggestions__list";
  suggestions.append(suggestionsTitle, suggestionList);

  function renderSuggestions(): void {
    const all = listControls.flatMap((c) => c.read());
    const shown = suggestLessons(options.getLessonCandidates?.() ?? [], all.map((d) => d.text));
    const full = all.length >= MAX_PLAN_ITEMS;
    suggestionList.replaceChildren();
    for (const text of shown) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "links-plan-suggestions__chip";
      chip.dataset.lessonSuggestion = "";
      chip.disabled = full;
      chip.setAttribute("aria-label", `Adicionar ao checklist: ${text}`);
      chip.append(uiIcon("plus", 18), document.createTextNode(text));
      chip.addEventListener("click", () => {
        if (listControls.flatMap((c) => c.read()).length >= MAX_PLAN_ITEMS) return;
        listControls[0]!.append(text);
        renderAll();
        (suggestionList.querySelector("button:not(:disabled)") as HTMLElement | null)?.focus();
      });
      suggestionList.appendChild(chip);
    }
    suggestions.hidden = shown.length === 0;
  }
  const renderAll = (): void => {
    listControls.forEach((c) => c.render());
    renderSuggestions();
  };
  const counts = (): number[] => listControls.map((c) => c.read().length);
  PLAN_LISTS.forEach(({ key, title }, index) => {
    listControls.push(
      createListControl(
        key,
        title,
        () => counts().slice(0, index).reduce((a, b) => a + b, 0),
        () => counts().reduce((a, b) => a + b, 0),
        renderAll,
        () => peopleInput.getValues()
      )
    );
  });

  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "links-admin-form__actions links-admin-form__actions--flow";

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "links-admin-button links-admin-button--primary links-admin-button--block";
  saveBtn.textContent = "Salvar";

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "links-admin-button links-admin-button--ghost links-admin-button--block";
  skipBtn.dataset.action = "skip-plan";
  skipBtn.textContent = "Cancelar";

  actions.append(saveBtn, skipBtn);
  const [checklistControl, ...otherControls] = listControls;
  form.append(
    peopleInput.element,
    checklistControl!.element,
    suggestions,
    ...otherControls.map((c) => c.element),
    error,
    actions
  );
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
    resetPageZoom();
    if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    previouslyFocused = null;
  }

  function dismiss(): void {
    if (busy) return;
    const cb = onSkipCb;
    close();
    cb?.();
  }

  function resetScroll(): void {
    overlay.scrollTop = 0;
    dialog.scrollTop = 0;
    form.scrollTop = 0;
  }

  function open(opts: PlanSheetOpenOpts): void {
    if (overlay.hidden) previouslyFocused = document.activeElement as HTMLElement | null;
    onSaveCb = opts.onSave;
    onSkipCb = opts.onSkip ?? null;
    placeName.textContent = opts.label;
    setError("");
    peopleInput.setValues(opts.initial.people);
    // Fill every list first (set() renders), then render again so numbering and
    // the add buttons see the final counts.
    PLAN_LISTS.forEach(({ key }, i) => {
      listControls[i]!.set(opts.initial.items.filter((d) => d.list === key));
    });
    renderAll();
    overlay.hidden = false;
    syncBodyScreenLock();
    resetPageZoom();
    resetScroll();
    // Focus the dialog (not a field): no keyboard pops up and nothing scrolls into view.
    dialog.focus({ preventScroll: true });
    // Layout may settle after unhiding; make sure the top is what the user sees.
    requestAnimationFrame(() => {
      if (!overlay.hidden) resetScroll();
    });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!onSaveCb || busy) return;
    // Text still being typed in the participants field becomes a chip.
    peopleInput.commit();
    const values: PlanValues = {
      people: peopleInput.getValues(),
      items: listControls.flatMap((c) => c.read()),
    };
    setError("");
    void Promise.resolve(onSaveCb(values)).catch(() => undefined);
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
