/**
 * Generic chip input with autocomplete (tags `#` now, people `@` later).
 *
 * Parameterised by the visible `prefix`, the `normalize`/`key` functions (what
 * is stored vs. what is compared) and a `getSuggestions` source. Pure DOM
 * (createElement + textContent): no innerHTML, CSP-safe. The component owns no
 * persistence: callers read `getValues()` on submit (call `commit()` first so
 * text still being typed is not lost).
 */

export type ChipInputOptions = {
  /** Stable id of the text input (the label points at it). */
  id: string;
  label: string;
  /** Shown before every chip/suggestion: "#" for tags, "@" for people. */
  prefix: string;
  placeholder?: string;
  /** Raw text -> stored display value ("" = reject). */
  normalize: (raw: string) => string;
  /** Display value -> comparison key (accent/case-insensitive). */
  key: (value: string) => string;
  max: number;
  maxLength: number;
  /** Whitespace also commits a chip (tags). Off for names with spaces. Default true. */
  splitOnSpace?: boolean;
  /** Candidates for autocomplete (read on every keystroke). */
  getSuggestions: () => readonly string[];
  onChange?: (values: string[]) => void;
};

export type ChipInputHandle = {
  element: HTMLElement;
  input: HTMLInputElement;
  getValues: () => string[];
  /** Replaces the chips (deduped, normalized) and clears the typed text. */
  setValues: (values: readonly string[]) => void;
  /** Turns the text still in the input into a chip. */
  commit: () => void;
};

const MAX_SUGGESTIONS = 6;

export function createChipInput(opts: ChipInputOptions): ChipInputHandle {
  let values: string[] = [];

  const wrapper = document.createElement("div");
  wrapper.className = "links-admin-form__field chip-input";

  const label = document.createElement("label");
  label.className = "links-admin-form__label";
  label.htmlFor = opts.id;
  label.textContent = opts.label;

  const box = document.createElement("div");
  box.className = "chip-input__box";

  const chipList = document.createElement("span");
  chipList.className = "chip-input__chips";

  const input = document.createElement("input");
  input.className = "chip-input__input";
  input.id = opts.id;
  input.type = "text";
  input.autocomplete = "off";
  input.autocapitalize = "none";
  input.spellcheck = false;
  input.maxLength = opts.maxLength + 1; // +1 for the typed prefix character
  input.enterKeyHint = "done";
  if (opts.placeholder) input.placeholder = opts.placeholder;

  box.append(chipList, input);

  const suggestionList = document.createElement("div");
  suggestionList.className = "chip-input__suggestions";
  suggestionList.setAttribute("role", "group");
  suggestionList.setAttribute("aria-label", "Sugestões");
  suggestionList.hidden = true;
  // Keep focus in the input while a suggestion is pressed.
  suggestionList.addEventListener("pointerdown", (e) => e.preventDefault());

  wrapper.append(label, box, suggestionList);

  function keys(): string[] {
    return values.map(opts.key);
  }

  function notify(): void {
    opts.onChange?.([...values]);
  }

  function renderChips(): void {
    chipList.replaceChildren();
    for (const value of values) {
      const chip = document.createElement("span");
      chip.className = "links-chip chip-input__chip";
      const text = document.createElement("span");
      text.textContent = `${opts.prefix}${value}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-input__remove";
      remove.setAttribute("aria-label", `Remover ${opts.prefix}${value}`);
      remove.textContent = "×";
      // Keep focus in the input: blurring hides the suggestions, which shifts
      // the layout between pointer down and up and swallows the click.
      remove.addEventListener("pointerdown", (e) => e.preventDefault());
      remove.addEventListener("click", () => {
        values = values.filter((v) => opts.key(v) !== opts.key(value));
        renderChips();
        renderSuggestions();
        notify();
      });
      chip.append(text, remove);
      chipList.appendChild(chip);
    }
  }

  function add(raw: string): boolean {
    const display = opts.normalize(raw);
    if (display === "") return false;
    if (values.length >= opts.max) return false;
    if (keys().includes(opts.key(display))) return false;
    values = [...values, display];
    renderChips();
    notify();
    return true;
  }

  function renderSuggestions(): void {
    suggestionList.replaceChildren();
    if (document.activeElement !== input) {
      suggestionList.hidden = true;
      return;
    }
    const q = opts.key(input.value);
    const taken = new Set(keys());
    const shown: string[] = [];
    for (const candidate of opts.getSuggestions()) {
      const k = opts.key(candidate);
      if (taken.has(k)) continue;
      if (q !== "" && !k.includes(q)) continue;
      shown.push(candidate);
      if (shown.length >= MAX_SUGGESTIONS) break;
    }
    for (const candidate of shown) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "links-chip chip-input__suggestion";
      option.textContent = `${opts.prefix}${candidate}`;
      option.addEventListener("click", () => {
        add(candidate);
        input.value = "";
        renderSuggestions();
        input.focus();
      });
      suggestionList.appendChild(option);
    }
    suggestionList.hidden = shown.length === 0;
  }

  function commit(): void {
    if (input.value.trim() !== "") add(input.value);
    input.value = "";
    renderSuggestions();
  }

  input.addEventListener("input", () => {
    // Pasting or typing "a, b" commits every complete piece.
    const splitter = opts.splitOnSpace === false ? /\s*,\s*/ : /[,\s]+/;
    if (opts.splitOnSpace === false ? input.value.includes(",") : /[,\s]/.test(input.value)) {
      const parts = input.value.split(splitter);
      const rest = parts.pop() ?? "";
      for (const part of parts) add(part);
      input.value = rest;
    }
    renderSuggestions();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && input.value === "" && values.length > 0) {
      values = values.slice(0, -1);
      renderChips();
      renderSuggestions();
      notify();
    }
  });
  input.addEventListener("focus", renderSuggestions);
  input.addEventListener("blur", () => {
    suggestionList.hidden = true;
  });

  return {
    element: wrapper,
    input,
    getValues: () => [...values],
    setValues(next) {
      const seen = new Set<string>();
      values = [];
      for (const raw of next) {
        const display = opts.normalize(raw);
        const k = opts.key(display);
        if (display === "" || seen.has(k) || values.length >= opts.max) continue;
        seen.add(k);
        values.push(display);
      }
      input.value = "";
      renderChips();
      renderSuggestions();
    },
    commit,
  };
}
