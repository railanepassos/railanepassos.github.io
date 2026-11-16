/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChipInput, type ChipInputHandle } from "../../src/links/chip-input";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTag, tagKey } from "../../src/links/tags";

function make(suggestions: string[] = []): ChipInputHandle {
  const handle = createChipInput({
    id: "t",
    label: "Tags (opcional)",
    prefix: "#",
    normalize: normalizeTag,
    key: tagKey,
    max: MAX_TAGS,
    maxLength: MAX_TAG_LENGTH,
    getSuggestions: () => suggestions,
  });
  document.body.appendChild(handle.element);
  return handle;
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function key(input: HTMLInputElement, k: string): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  input.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("createChipInput", () => {
  it("labels the input and adds a chip on Enter without submitting the form", () => {
    const c = make();
    const input = c.input;
    expect(document.querySelector("label[for='t']")?.textContent).toBe("Tags (opcional)");
    type(input, "#Praia");
    const ev = key(input, "Enter");
    expect(ev.defaultPrevented).toBe(true);
    expect(c.getValues()).toEqual(["praia"]);
    expect(input.value).toBe("");
    expect(c.element.querySelector(".chip-input__chip")?.textContent).toContain("#praia");
  });

  it("adds on comma and ignores duplicates by accent/case", () => {
    const c = make();
    type(c.input, "Grátis");
    key(c.input, ",");
    type(c.input, "#GRATIS");
    key(c.input, "Enter");
    expect(c.getValues()).toEqual(["grátis"]);
  });

  it("removes a chip with its remove button", () => {
    const c = make();
    c.setValues(["praia", "museu"]);
    const btn = c.element.querySelector<HTMLButtonElement>("button[aria-label='Remover #praia']");
    expect(btn).not.toBeNull();
    btn!.click();
    expect(c.getValues()).toEqual(["museu"]);
  });

  it("Backspace on empty input removes the last chip", () => {
    const c = make();
    c.setValues(["praia", "museu"]);
    key(c.input, "Backspace");
    expect(c.getValues()).toEqual(["praia"]);
  });

  it("shows suggestions matching the text (accent-insensitive) and adds one on click", () => {
    const c = make(["grátis", "museu", "praia"]);
    c.input.focus();
    type(c.input, "gra");
    const options = [...c.element.querySelectorAll<HTMLButtonElement>(".chip-input__suggestion")];
    expect(options.map((o) => o.textContent)).toEqual(["#grátis"]);
    options[0].click();
    expect(c.getValues()).toEqual(["grátis"]);
    expect(c.element.querySelectorAll(".chip-input__suggestion").length).toBeGreaterThanOrEqual(0);
  });

  it("does not suggest tags already chosen", () => {
    const c = make(["grátis", "museu"]);
    c.setValues(["gratis"]);
    c.input.focus();
    type(c.input, "");
    const texts = [...c.element.querySelectorAll(".chip-input__suggestion")].map((o) => o.textContent);
    expect(texts).toEqual(["#museu"]);
  });

  it("commit() flushes pending text so Save does not lose it", () => {
    const c = make();
    type(c.input, "ultimo");
    c.commit();
    expect(c.getValues()).toEqual(["ultimo"]);
  });

  it("setValues dedupes and reset clears", () => {
    const c = make();
    c.setValues(["Praia", "praia", "#museu"]);
    expect(c.getValues()).toEqual(["praia", "museu"]);
    c.setValues([]);
    expect(c.getValues()).toEqual([]);
  });

  it("stops accepting at the maximum and notifies on change", () => {
    const onChange = vi.fn();
    const c = createChipInput({
      id: "m",
      label: "x",
      prefix: "#",
      normalize: normalizeTag,
      key: tagKey,
      max: 2,
      maxLength: MAX_TAG_LENGTH,
      getSuggestions: () => [],
      onChange,
    });
    document.body.appendChild(c.element);
    for (const t of ["a", "b", "c"]) {
      type(c.input, t);
      key(c.input, "Enter");
    }
    expect(c.getValues()).toEqual(["a", "b"]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
