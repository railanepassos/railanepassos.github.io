/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanSheet } from "../../src/links/plan-sheet";
import type { PlanDraft } from "../../src/links/plan";

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

const item = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  text: "Ingressos",
  list: "checklist",
  who: "",
  done: false,
  ...over,
});

function setup(items: PlanDraft[], candidates: string[]) {
  const sheet = createPlanSheet({ getLessonCandidates: () => candidates });
  document.body.appendChild(sheet.element);
  sheet.open({ label: "Museu", initial: { people: [], items }, onSave: vi.fn() });
  const chips = () =>
    Array.from(sheet.element.querySelectorAll<HTMLButtonElement>("[data-lesson-suggestion]"));
  const section = () => sheet.element.querySelector<HTMLElement>("[data-lesson-suggestions]")!;
  const checklist = () =>
    Array.from(
      sheet.element.querySelectorAll<HTMLInputElement>("[data-plan-list='checklist'] .links-plan__text")
    ).map((i) => i.value);
  return { sheet, chips, section, checklist };
}

describe("plan sheet lesson suggestions", () => {
  it("lists the suggestions, hiding the ones already in the plan (any list)", () => {
    const { chips, section } = setup(
      [item({ text: "levar agua", list: "compras" })],
      ["Levar água", "Chegar cedo"]
    );
    expect(section().textContent).toContain("Sugestões das suas lições");
    expect(chips().map((c) => c.textContent)).toEqual(["Chegar cedo"]);
  });

  it("hides the whole section when there is nothing to suggest", () => {
    const { section, chips } = setup([], []);
    expect(chips()).toHaveLength(0);
    expect(section().hidden).toBe(true);
  });

  it("tapping adds a checklist item and removes the suggestion", () => {
    const { chips, section, checklist } = setup([item()], ["Chegar cedo", "Levar lanche"]);
    chips()[0]!.click();
    expect(checklist()).toEqual(["Ingressos", "Chegar cedo"]);
    expect(chips().map((c) => c.textContent)).toEqual(["Levar lanche"]);
    chips()[0]!.click();
    expect(section().hidden).toBe(true);
  });
});
