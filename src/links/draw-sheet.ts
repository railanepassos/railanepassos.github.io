import {
  EMPTY_DRAW_FILTERS,
  applyDrawFilters,
  drawCities,
  hasActiveDrawFilters,
  type DrawFilterable,
  type DrawFilters,
} from "./draw-filters";
import { DURATIONS, DURATION_LABELS, DURATION_TERM, readDuration } from "./duration";
import { fold } from "./keyed-list";
import { syncBodyScreenLock } from "./screen-lock";
import { collectTags, tagKey } from "./tags";

/**
 * "Sortear" bottom sheet, opened by the shuffle button. Edits the draw filters
 * (cost, city, tags, time), shows how many places are in the draw and starts
 * it. The filters live in this closure: they survive closing the sheet and
 * last as long as the page. The category chips are applied by the caller
 * (`getPool`), the sheet narrows that pool further.
 */

export type DrawFilterSheetHandle = {
  element: HTMLElement;
  open: () => void;
  close: () => void;
  /** Current filters (a copy). */
  getFilters: () => DrawFilters;
};

export type DrawFilterSheetOptions<T extends DrawFilterable> = {
  /** Places eligible before the sheet filters (wishlist + category chips). */
  getPool: () => readonly T[];
  onDraw: () => void;
};

export function countLabel(n: number): string {
  return n === 1 ? "1 lugar no sorteio" : `${n} lugares no sorteio`;
}

function cloneFilters(f: DrawFilters): DrawFilters {
  return { ...f, tags: [...f.tags] };
}

export function createDrawFilterSheet<T extends DrawFilterable>(
  options: DrawFilterSheetOptions<T>
): DrawFilterSheetHandle {
  let filters: DrawFilters = cloneFilters(EMPTY_DRAW_FILTERS);
  let previouslyFocused: HTMLElement | null = null;

  const overlay = document.createElement("div");
  overlay.className = "links-filter-sheet links-draw-filter-sheet";
  overlay.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "links-filter-sheet__backdrop";
  backdrop.setAttribute("aria-label", "Fechar filtros do sorteio");

  const panel = document.createElement("div");
  panel.className = "links-filter-sheet__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "links-draw-filter-title");
  panel.tabIndex = -1;

  const title = document.createElement("h2");
  title.className = "links-filter-sheet__title";
  title.id = "links-draw-filter-title";
  title.textContent = "Sortear";

  const body = document.createElement("div");
  body.className = "links-draw-filter__body";

  function field(labelText: string, id: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "links-admin-form__field links-draw-filter__field";
    const label = document.createElement("label");
    label.className = "links-admin-form__label";
    label.htmlFor = id;
    label.textContent = labelText;
    wrap.append(label, control);
    return wrap;
  }

  const costInput = document.createElement("input");
  costInput.type = "number";
  costInput.id = "links-draw-cost";
  costInput.min = "0";
  costInput.step = "any";
  costInput.inputMode = "decimal";
  costInput.placeholder = "Sem limite";
  costInput.className = "links-admin-form__control links-admin-form__control--touch";

  const citySelect = document.createElement("select");
  citySelect.id = "links-draw-city";
  citySelect.className = "links-admin-form__control links-admin-form__control--select";

  const durationSelect = document.createElement("select");
  durationSelect.id = "links-draw-duration";
  durationSelect.className = "links-admin-form__control links-admin-form__control--select";

  const tagsWrap = document.createElement("div");
  tagsWrap.className = "links-admin-form__field links-draw-filter__field";
  const tagsLabel = document.createElement("p");
  tagsLabel.className = "links-admin-form__label";
  tagsLabel.id = "links-draw-tags-label";
  tagsLabel.textContent = "Tags (todas)";
  const tagsList = document.createElement("div");
  tagsList.className = "links-draw-filter__tags";
  tagsList.setAttribute("role", "group");
  tagsList.setAttribute("aria-labelledby", "links-draw-tags-label");
  const tagsEmpty = document.createElement("p");
  tagsEmpty.className = "links-filter-sheet__hint links-draw-filter__hint";
  tagsEmpty.textContent = "Nenhuma tag cadastrada.";
  tagsWrap.append(tagsLabel, tagsList, tagsEmpty);

  body.append(
    field("Custo até R$", "links-draw-cost", costInput),
    field("Cidade", "links-draw-city", citySelect),
    tagsWrap,
    field(DURATION_TERM, "links-draw-duration", durationSelect)
  );

  const count = document.createElement("p");
  count.className = "links-draw-filter__count";
  count.setAttribute("role", "status");
  count.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "links-filter-sheet__actions";

  const drawBtn = document.createElement("button");
  drawBtn.type = "button";
  drawBtn.className = "links-admin-button links-admin-button--primary links-admin-button--block";
  drawBtn.textContent = "Sortear";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "links-admin-button links-admin-button--ghost";
  clearBtn.textContent = "Limpar filtros";

  actions.append(count, drawBtn, clearBtn);
  panel.append(title, body, actions);
  overlay.append(backdrop, panel);

  function option(value: string, text: string): HTMLOptionElement {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    return o;
  }

  function renderOptions(): void {
    const pool = options.getPool();

    const cities = drawCities(pool);
    if (filters.city !== null && !cities.some((c) => fold(c) === fold(filters.city ?? ""))) {
      cities.push(filters.city);
    }
    citySelect.replaceChildren(option("", "Qualquer cidade"), ...cities.map((c) => option(c, c)));
    const selectedCity = cities.find((c) => fold(c) === fold(filters.city ?? ""));
    citySelect.value = selectedCity ?? "";

    durationSelect.replaceChildren(
      option("", "Qualquer"),
      ...DURATIONS.map((d) => option(d, `Cabe em: ${DURATION_LABELS[d]}`))
    );
    durationSelect.value = filters.duration ?? "";

    costInput.value = filters.costMax === null ? "" : String(filters.costMax);

    const known = collectTags(pool);
    for (const t of filters.tags) {
      if (!known.some((k) => tagKey(k) === tagKey(t))) known.push(t);
    }
    tagsList.replaceChildren();
    for (const tag of known) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "links-draw-filter__tag";
      chip.dataset.tag = tag;
      chip.textContent = `#${tag}`;
      chip.setAttribute(
        "aria-pressed",
        String(filters.tags.some((t) => tagKey(t) === tagKey(tag)))
      );
      tagsList.appendChild(chip);
    }
    tagsEmpty.hidden = known.length > 0;
  }

  function renderCount(): void {
    const n = applyDrawFilters(options.getPool(), filters).length;
    count.textContent = countLabel(n);
    drawBtn.disabled = n === 0;
    clearBtn.disabled = !hasActiveDrawFilters(filters);
  }

  costInput.addEventListener("input", () => {
    const raw = costInput.value.trim();
    const n = raw === "" ? NaN : Number(raw);
    filters.costMax = Number.isFinite(n) && n >= 0 ? n : null;
    renderCount();
  });
  citySelect.addEventListener("change", () => {
    filters.city = citySelect.value === "" ? null : citySelect.value;
    renderCount();
  });
  durationSelect.addEventListener("change", () => {
    filters.duration = readDuration(durationSelect.value);
    renderCount();
  });
  tagsList.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tag]");
    if (!chip) return;
    const tag = chip.dataset.tag ?? "";
    const on = filters.tags.some((t) => tagKey(t) === tagKey(tag));
    filters.tags = on
      ? filters.tags.filter((t) => tagKey(t) !== tagKey(tag))
      : [...filters.tags, tag];
    chip.setAttribute("aria-pressed", String(!on));
    renderCount();
  });
  clearBtn.addEventListener("click", () => {
    filters = cloneFilters(EMPTY_DRAW_FILTERS);
    renderOptions();
    renderCount();
  });

  function close(): void {
    if (overlay.hidden) return;
    overlay.hidden = true;
    syncBodyScreenLock();
    if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    previouslyFocused = null;
  }

  function open(): void {
    if (overlay.hidden) previouslyFocused = document.activeElement as HTMLElement | null;
    renderOptions();
    renderCount();
    overlay.hidden = false;
    syncBodyScreenLock();
    body.scrollTop = 0;
    panel.focus({ preventScroll: true });
  }

  drawBtn.addEventListener("click", () => {
    if (drawBtn.disabled) return;
    close();
    options.onDraw();
  });
  backdrop.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return { element: overlay, open, close, getFilters: () => cloneFilters(filters) };
}
