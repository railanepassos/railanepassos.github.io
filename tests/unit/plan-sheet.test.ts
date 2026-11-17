/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanSheet } from "../../src/links/plan-sheet";
import { normalizePlan, type PlanDraft } from "../../src/links/plan";

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

type Initial = { people?: string[]; items?: PlanDraft[] };

function setup(base: Initial = {}, suggestions: string[] = []) {
  const initial = { people: [] as string[], items: [] as PlanDraft[], ...base };
  const onSave = vi.fn();
  const onSkip = vi.fn();
  const sheet = createPlanSheet({ getPeopleSuggestions: () => suggestions });
  document.body.appendChild(sheet.element);
  sheet.open({ label: "Museu", initial, onSave, onSkip });
  const button = (name: string) =>
    Array.from(sheet.element.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.trim() === name || b.getAttribute("aria-label") === name
    )!;
  const texts = (list: string) =>
    Array.from(
      sheet.element.querySelectorAll<HTMLInputElement>(`[data-plan-list='${list}'] .links-plan__text`)
    ).map((i) => i.value);
  const input = (list: string, i: number) =>
    sheet.element.querySelectorAll<HTMLInputElement>(`[data-plan-list='${list}'] .links-plan__text`)[i]!;
  return { sheet, onSave, onSkip, button, texts, input };
}

const item = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  text: "Ingressos",
  list: "checklist",
  who: "",
  done: false,
  ...over,
});

describe("createPlanSheet", () => {
  it("is a dialog titled Plano do passeio, showing the place and both lists", () => {
    const { sheet } = setup();
    expect(sheet.element.hidden).toBe(false);
    expect(sheet.element.querySelector("[role='dialog']")).not.toBeNull();
    expect(sheet.element.textContent).toContain("Plano do passeio");
    expect(sheet.element.textContent).toContain("Museu");
    expect(sheet.element.querySelector("[data-plan-list='checklist']")).not.toBeNull();
    expect(sheet.element.querySelector("[data-plan-list='compras']")).not.toBeNull();
    expect(sheet.element.textContent).toContain("Lanches e compras");
  });

  it("uses the action bar that flows with the form and the shared cancel label", () => {
    const { sheet } = setup();
    expect(sheet.element.querySelector(".links-admin-form__actions--flow")).not.toBeNull();
    expect(sheet.element.querySelector("[data-action='skip-plan']")!.textContent).toBe("Cancelar");
  });

  it("saves participants and the items of both lists in order", () => {
    const { onSave, button, input } = setup({
      people: ["Alana"],
      items: [item({ text: "Ingressos" }), item({ text: "Pão", list: "compras" })],
    });
    button("Adicionar item ao checklist").click();
    input("checklist", 1).value = "Protetor solar";
    input("checklist", 1).dispatchEvent(new Event("input"));
    button("Salvar").click();
    expect(onSave).toHaveBeenCalledWith({
      people: ["Alana"],
      items: [
        item({ text: "Ingressos" }),
        item({ text: "Protetor solar" }),
        item({ text: "Pão", list: "compras" }),
      ],
    });
  });

  it("round-trips who and done untouched", () => {
    const { onSave, button } = setup({
      items: [item({ text: "Ingressos", who: "Alana", done: true })],
    });
    button("Salvar").click();
    expect(onSave.mock.calls[0]![0].items).toEqual([
      item({ text: "Ingressos", who: "Alana", done: true }),
    ]);
  });

  it("keeps a participant still being typed", () => {
    const { sheet, onSave, button } = setup();
    const people = sheet.element.querySelector<HTMLInputElement>("#links-plan-people")!;
    people.value = "Bia";
    button("Salvar").click();
    expect(onSave.mock.calls[0]![0].people).toEqual(["Bia"]);
  });

  it("removes and reorders items inside a list", () => {
    const { texts, button, onSave } = setup({
      items: [item({ text: "a" }), item({ text: "b" }), item({ text: "c" })],
    });
    button("Descer item 1").click();
    expect(texts("checklist")).toEqual(["b", "a", "c"]);
    button("Subir item 3").click();
    expect(texts("checklist")).toEqual(["b", "c", "a"]);
    button("Remover item 1").click();
    expect(texts("checklist")).toEqual(["c", "a"]);
    button("Salvar").click();
    expect(onSave.mock.calls[0]![0].items.map((i: PlanDraft) => i.text)).toEqual(["c", "a"]);
  });

  it("Enter adds an empty item below, focuses it and never submits", () => {
    const { sheet, onSave, input, texts } = setup({ items: [item({ text: "a" })] });
    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input("checklist", 0).dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(texts("checklist")).toEqual(["a", ""]);
    expect(document.activeElement).toBe(input("checklist", 1));
    expect(onSave).not.toHaveBeenCalled();
    // Enter on an empty last row does not pile up blank rows.
    input("checklist", 1).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );
    expect(texts("checklist")).toEqual(["a", ""]);
    expect(sheet.element.hidden).toBe(false);
  });

  it("hands blank rows to the caller, which drops them with normalizePlan", () => {
    const { onSave, button } = setup({ items: [item({ text: "a" })] });
    button("Adicionar item ao checklist").click();
    button("Salvar").click();
    expect(normalizePlan(onSave.mock.calls[0]![0].items)).toEqual([
      { text: "a", list: "checklist", done: false },
    ]);
  });

  it("opens with the previous values only (no leftovers from a former open)", () => {
    const { sheet, texts } = setup({ items: [item({ text: "velho" })] });
    sheet.open({
      label: "Outro",
      initial: { people: [], items: [item({ text: "novo", list: "compras" })] },
      onSave: vi.fn(),
    });
    expect(texts("checklist")).toEqual([]);
    expect(texts("compras")).toEqual(["novo"]);
  });

  it("Cancelar closes and reports the skip without saving", () => {
    const { sheet, onSave, onSkip, button } = setup();
    button("Cancelar").click();
    expect(sheet.element.hidden).toBe(true);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows errors and busy state", () => {
    const { sheet, button } = setup();
    sheet.setError("Item 1: texto longo.");
    expect(sheet.element.querySelector("[role='alert']")!.textContent).toBe("Item 1: texto longo.");
    sheet.setBusy(true);
    expect(button("Salvar").disabled).toBe(true);
    sheet.setBusy(false);
    expect(button("Salvar").disabled).toBe(false);
  });

  describe("item owner", () => {
    const owner = (sheet: { element: HTMLElement }, i = 0) =>
      sheet.element.querySelectorAll<HTMLSelectElement>(".links-plan__who")[i]!;
    const optionTexts = (sel: HTMLSelectElement) => Array.from(sel.options).map((o) => o.text);

    it("offers Ninguém plus the participants and saves the choice as who", () => {
      const { sheet, onSave, button } = setup({
        people: ["Alana", "Bia"],
        items: [item({ text: "Ingressos" })],
      });
      const sel = owner(sheet);
      expect(optionTexts(sel)).toEqual(["Ninguém", "Alana", "Bia"]);
      expect(sel.value).toBe("");
      sel.value = "Bia";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      button("Salvar").click();
      expect(onSave.mock.calls[0]![0].items[0].who).toBe("Bia");
    });

    it("keeps a stored owner that is no longer a participant, selected", () => {
      const { sheet, onSave, button } = setup({
        people: ["Alana"],
        items: [item({ text: "Ingressos", who: "Carlos" })],
      });
      const sel = owner(sheet);
      expect(optionTexts(sel)).toEqual(["Ninguém", "Alana", "Carlos"]);
      expect(sel.value).toBe("Carlos");
      button("Salvar").click();
      expect(onSave.mock.calls[0]![0].items[0].who).toBe("Carlos");
    });

    it("Ninguém clears the owner", () => {
      const { sheet, onSave, button } = setup({
        people: ["Alana"],
        items: [item({ text: "Ingressos", who: "Alana" })],
      });
      const sel = owner(sheet);
      sel.value = "";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      button("Salvar").click();
      expect(onSave.mock.calls[0]![0].items[0].who).toBe("");
    });

    it("picks up participants added while the sheet is open", () => {
      const { sheet } = setup({ people: ["Alana"], items: [item({ text: "Ingressos" })] });
      const people = sheet.element.querySelector<HTMLInputElement>("#links-plan-people")!;
      people.value = "Bia";
      people.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      const sel = owner(sheet);
      sel.dispatchEvent(new Event("focus"));
      expect(optionTexts(sel)).toEqual(["Ninguém", "Alana", "Bia"]);
    });
  });
});
