import { describe, expect, it } from "vitest";
import { MAX_PLAN_ITEMS, mergeProposedPlanItems, type PlanDraft } from "../../src/links/plan";

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  text: "Comprar ingressos",
  list: "checklist",
  who: "",
  done: false,
  ...over,
});

describe("mergeProposedPlanItems", () => {
  const own = [draft({ text: "Meu item", who: "Alana", done: true })];

  it("appends proposed items at the end, keeping the current ones untouched", () => {
    const out = mergeProposedPlanItems(own, [
      { text: "Pão de queijo", list: "compras" },
      { text: "Levar água", list: "checklist" },
    ]);
    expect(out).toEqual([
      own[0],
      { text: "Pão de queijo", list: "compras", who: "", done: false },
      { text: "Levar água", list: "checklist", who: "", done: false },
    ]);
  });

  it("skips text that already exists, case-insensitively, also within the proposal", () => {
    const out = mergeProposedPlanItems(own, [
      { text: "  MEU ITEM ", list: "compras" },
      { text: "Biscoito", list: "compras" },
      { text: "biscoito", list: "checklist" },
    ]);
    expect(out.map((d) => d.text)).toEqual(["Meu item", "Biscoito"]);
  });

  it("stops at MAX_PLAN_ITEMS", () => {
    const full = Array.from({ length: MAX_PLAN_ITEMS - 1 }, (_, i) => draft({ text: `Item ${i}` }));
    const out = mergeProposedPlanItems(full, [
      { text: "Cabe", list: "checklist" },
      { text: "Não cabe", list: "checklist" },
    ]);
    expect(out).toHaveLength(MAX_PLAN_ITEMS);
    expect(out[out.length - 1]!.text).toBe("Cabe");
  });

  it("does not mutate its inputs", () => {
    const input = [...own];
    mergeProposedPlanItems(input, [{ text: "Novo", list: "compras" }]);
    expect(input).toEqual(own);
  });
});
