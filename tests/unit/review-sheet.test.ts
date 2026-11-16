/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReviewSheet } from "../../src/links/review-sheet";
import type { ReviewValues } from "../../src/links/review";

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

function setup(initial: ReviewValues = { rating: null, want_again: false, memory_url: "" }) {
  const onSave = vi.fn();
  const onSkip = vi.fn();
  const sheet = createReviewSheet();
  document.body.appendChild(sheet.element);
  sheet.open({ label: "Museu", initial, onSave, onSkip });
  const radios = () =>
    Array.from(sheet.element.querySelectorAll<HTMLElement>("[role='radio']"));
  const checked = () => radios().filter((r) => r.getAttribute("aria-checked") === "true");
  const button = (name: string) =>
    Array.from(sheet.element.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.trim() === name
    )!;
  return { sheet, onSave, onSkip, radios, checked, button };
}

describe("createReviewSheet", () => {
  it("is a dialog with a 5-option radiogroup and nothing preselected for a fresh review", () => {
    const { sheet, radios, checked } = setup();
    expect(sheet.element.hidden).toBe(false);
    expect(sheet.element.querySelector("[role='dialog']")).not.toBeNull();
    const group = sheet.element.querySelector("[role='radiogroup']")!;
    expect(group.getAttribute("aria-label")).toBe("Nota");
    expect(radios().map((r) => r.getAttribute("aria-label"))).toEqual([
      "1 de 5",
      "2 de 5",
      "3 de 5",
      "4 de 5",
      "5 de 5",
    ]);
    expect(checked()).toHaveLength(0);
    // Exactly one tab stop in the group.
    expect(radios().filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it("selects on click, changes on another click, clears on re-click of the selected one", () => {
    const { radios, checked, onSave, button } = setup();
    radios()[3]!.click();
    expect(checked().map((r) => r.getAttribute("aria-label"))).toEqual(["4 de 5"]);
    radios()[1]!.click();
    expect(checked().map((r) => r.getAttribute("aria-label"))).toEqual(["2 de 5"]);
    radios()[1]!.click();
    expect(checked()).toHaveLength(0);
    button("Salvar").click();
    expect(onSave).toHaveBeenCalledWith({ rating: null, want_again: false, memory_url: "" });
  });

  it("has an explicit clear control that only shows when there is a rating", () => {
    const { radios, checked } = setup({ rating: 3, want_again: false, memory_url: "" });
    const sheetClear = document.querySelector<HTMLButtonElement>("[data-action='clear-rating']")!;
    expect(sheetClear.hidden).toBe(false);
    sheetClear.click();
    expect(checked()).toHaveLength(0);
    expect(sheetClear.hidden).toBe(true);
    radios()[0]!.click();
    expect(sheetClear.hidden).toBe(false);
  });

  it("arrow keys move and select, like native radios", () => {
    const { radios, checked } = setup({ rating: 2, want_again: false, memory_url: "" });
    radios()[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(checked().map((r) => r.getAttribute("aria-label"))).toEqual(["3 de 5"]);
    radios()[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    radios()[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(checked().map((r) => r.getAttribute("aria-label"))).toEqual(["1 de 5"]);
  });

  it("opens prefilled and saves rating and Voltaria? together", () => {
    const { sheet, onSave, button } = setup({ rating: 4, want_again: false, memory_url: "" });
    const voltaria = sheet.element.querySelector<HTMLInputElement>("input[type='checkbox']")!;
    expect(voltaria.checked).toBe(false);
    expect(sheet.element.textContent).toContain("Voltaria?");
    voltaria.click();
    button("Salvar").click();
    expect(onSave).toHaveBeenCalledWith({ rating: 4, want_again: true, memory_url: "" });
  });

  it("Pular closes without saving; the close X and Escape behave the same", () => {
    const first = setup();
    first.button("Pular").click();
    expect(first.onSkip).toHaveBeenCalledTimes(1);
    expect(first.onSave).not.toHaveBeenCalled();
    expect(first.sheet.element.hidden).toBe(true);

    document.body.replaceChildren();
    const second = setup();
    second.sheet.element.querySelector<HTMLElement>("[aria-label='Fechar']")!.click();
    expect(second.onSave).not.toHaveBeenCalled();
    expect(second.sheet.element.hidden).toBe(true);

    document.body.replaceChildren();
    const third = setup();
    third.sheet.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(third.onSave).not.toHaveBeenCalled();
    expect(third.sheet.element.hidden).toBe(true);
  });

  it("edit mode labels the dismiss button Cancelar and shows save errors", () => {
    const sheet = createReviewSheet();
    document.body.appendChild(sheet.element);
    sheet.open({ label: "Museu", mode: "edit", initial: { rating: null, want_again: false, memory_url: "" }, onSave: vi.fn() });
    expect(
      Array.from(sheet.element.querySelectorAll("button")).some((b) => b.textContent === "Cancelar")
    ).toBe(true);
    sheet.setError("Falhou");
    expect(sheet.element.querySelector("[role='alert']")!.textContent).toBe("Falhou");
  });

  it("has a labelled memory link field, prefilled and saved", () => {
    const { sheet, onSave, button } = setup({
      rating: null,
      want_again: false,
      memory_url: "https://youtu.be/dQw4w9WgXcQ",
    });
    const input = sheet.element.querySelector<HTMLInputElement>("input[type='url']")!;
    expect(input.value).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(sheet.element.querySelector(`label[for='${input.id}']`)!.textContent).toBe(
      "Link da memória"
    );
    input.value = "  https://photos.app.goo.gl/abc  ";
    button("Salvar").click();
    expect(onSave).toHaveBeenCalledWith({
      rating: null,
      want_again: false,
      memory_url: "https://photos.app.goo.gl/abc",
    });
  });

  it("shows an inline https error while typing and clears it when valid or empty", () => {
    const { sheet } = setup();
    const input = sheet.element.querySelector<HTMLInputElement>("input[type='url']")!;
    const err = sheet.element.querySelector<HTMLElement>(`#${input.id}-error`)!;
    expect(err.hidden).toBe(true);
    input.value = "http://x.com";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(err.hidden).toBe(false);
    expect(err.textContent).toMatch(/https/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(err.id);
    input.value = "https://x.com/a";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(err.hidden).toBe(true);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });
});
