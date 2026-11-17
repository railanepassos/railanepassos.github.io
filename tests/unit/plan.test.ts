import { describe, expect, it } from "vitest";
import {
  MAX_PLAN_ITEMS,
  PLAN_TEXT_MAX,
  PLAN_WHO_MAX,
  normalizePlan,
  planDraftsFromItems,
  planError,
  planFromLink,
  planToPatch,
  planProgress,
  readPlanItems,
  storedPlanError,
  type PlanDraft,
} from "../../src/links/plan";

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  text: "Comprar ingressos",
  list: "checklist",
  who: "",
  done: false,
  ...over,
});

describe("normalizePlan", () => {
  it("trims text and who, drops blank rows and keeps order", () => {
    expect(
      normalizePlan([
        draft({ text: "  Protetor solar ", who: " Alana " }),
        draft({ text: "   " }),
        draft({ text: "Pão", list: "compras" }),
      ])
    ).toEqual([
      { text: "Protetor solar", list: "checklist", who: "Alana", done: false },
      { text: "Pão", list: "compras", done: false },
    ]);
  });

  it("round-trips who and done untouched", () => {
    const items = [{ text: "Ingressos", list: "checklist" as const, who: "Alana", done: true }];
    expect(normalizePlan(planDraftsFromItems(items))).toEqual(items);
  });

  it("returns null when nothing is left", () => {
    expect(normalizePlan([])).toBeNull();
    expect(normalizePlan([draft({ text: " " })])).toBeNull();
  });
});

describe("planError", () => {
  it("accepts a valid list and blank rows", () => {
    expect(planError([draft(), draft({ text: "" })])).toBeNull();
  });

  it("names the item whose text is too long", () => {
    expect(planError([draft(), draft({ text: "x".repeat(PLAN_TEXT_MAX + 1) })])).toBe(
      `Item 2: o texto deve ter no máximo ${PLAN_TEXT_MAX} caracteres.`
    );
  });

  it("names the item whose responsible is too long", () => {
    expect(planError([draft({ who: "y".repeat(PLAN_WHO_MAX + 1) })])).toBe(
      `Item 1: o responsável deve ter no máximo ${PLAN_WHO_MAX} caracteres.`
    );
  });

  it("limits the number of items (blank rows do not count)", () => {
    const many = Array.from({ length: MAX_PLAN_ITEMS + 1 }, () => draft());
    expect(planError(many)).toBe(`Use no máximo ${MAX_PLAN_ITEMS} itens no plano.`);
    expect(planError([...many.slice(1), draft({ text: "" })])).toBeNull();
  });
});

describe("storedPlanError", () => {
  it("rejects blank text and unknown lists", () => {
    expect(storedPlanError([{ text: " ", list: "checklist", done: false }])).toBe(
      "Item 1: o texto não pode ficar em branco."
    );
    expect(storedPlanError([{ text: "a", list: "outra" as never, done: false }])).toBe(
      "Item 1: lista inválida."
    );
  });

  it("accepts a valid plan", () => {
    expect(storedPlanError([{ text: "a", list: "compras", who: "Ana", done: true }])).toBeNull();
  });
});

describe("readPlanItems", () => {
  it("returns [] for anything that is not an array", () => {
    expect(readPlanItems(null)).toEqual([]);
    expect(readPlanItems("x")).toEqual([]);
    expect(readPlanItems({})).toEqual([]);
  });

  it("keeps valid items and drops malformed ones", () => {
    expect(
      readPlanItems([
        { text: "ok", list: "compras", who: "Ana", done: true },
        { text: "  ", list: "checklist", done: false },
        { text: "lista ruim", list: "x", done: false },
        { list: "checklist", done: false },
        "texto",
        null,
        { text: "sem done", list: "checklist", who: 5 },
      ])
    ).toEqual([
      { text: "ok", list: "compras", who: "Ana", done: true },
      { text: "sem done", list: "checklist", done: false },
    ]);
  });
});

describe("planProgress", () => {
  const items = readPlanItems([
    { text: "a", list: "checklist", done: true },
    { text: "b", list: "checklist", done: false },
    { text: "c", list: "compras", done: true },
  ]);

  it("counts per list", () => {
    expect(planProgress(items, "checklist")).toEqual({ done: 1, total: 2, label: "1 de 2" });
    expect(planProgress(items, "compras")).toEqual({ done: 1, total: 1, label: "1 de 1" });
  });

  it("handles an empty list", () => {
    expect(planProgress([], "compras")).toEqual({ done: 0, total: 0, label: "0 de 0" });
  });
});

describe("planFromLink / planToPatch", () => {
  it("reads people and items from a link (defensive) into sheet values", () => {
    expect(
      planFromLink({
        people: ["Alana", "Bia"],
        plan_items: [{ text: "Ingressos", list: "checklist", who: "Alana", done: true }],
      })
    ).toEqual({
      people: ["Alana", "Bia"],
      items: [{ text: "Ingressos", list: "checklist", who: "Alana", done: true }],
    });
    expect(planFromLink({})).toEqual({ people: [], items: [] });
  });

  it("builds the PATCH with deduped people and normalized items, null when empty", () => {
    expect(
      planToPatch({
        people: ["Alana", " alana ", "Bia"],
        items: [draft({ text: " Ingressos ", who: "Alana", done: true }), draft({ text: "" })],
      })
    ).toEqual({
      people: ["Alana", "Bia"],
      plan_items: [{ text: "Ingressos", list: "checklist", who: "Alana", done: true }],
    });
    expect(planToPatch({ people: [], items: [draft({ text: " " })] })).toEqual({
      people: null,
      plan_items: null,
    });
  });
});
