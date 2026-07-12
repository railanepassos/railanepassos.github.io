import { describe, expect, it } from "vitest";
import { applyReorder } from "../../src/links/reorder";

describe("applyReorder", () => {
  it("moves item and reindexes sort_order", () => {
    const items = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ];
    const result = applyReorder(items, "c", 0);
    expect(result.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(result.map((r) => r.sort_order)).toEqual([0, 1, 2]);
  });

  it("clamps targetIndex to valid range", () => {
    const items = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ];
    // targetIndex out of range (too high)
    const resultHigh = applyReorder(items, "a", 10);
    expect(resultHigh.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(resultHigh.map((r) => r.sort_order)).toEqual([0, 1, 2]);

    // targetIndex negative (too low)
    const resultLow = applyReorder(items, "b", -5);
    expect(resultLow.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(resultLow.map((r) => r.sort_order)).toEqual([0, 1, 2]);
  });

  it("returns sorted and reindexed copy when movedId is not found", () => {
    const items = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ];
    const result = applyReorder(items, "unknown", 1);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result.map((r) => r.sort_order)).toEqual([0, 1, 2]);
  });

  it("does not mutate input array or items", () => {
    const items = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ];
    const itemsSnapshot = JSON.stringify(items);
    applyReorder(items, "b", 2);
    expect(JSON.stringify(items)).toBe(itemsSnapshot);
  });
});
