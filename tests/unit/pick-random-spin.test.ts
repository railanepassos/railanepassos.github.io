import { describe, expect, it } from "vitest";
import { buildSpinLabels } from "../../src/links/pick-random";

describe("buildSpinLabels", () => {
  it("ends with the winner label", () => {
    const reel = buildSpinLabels(["A", "B", "C"], "B", 6, () => 0);
    expect(reel[reel.length - 1]).toBe("B");
    expect(reel).toHaveLength(6);
  });

  it("returns only winner when pool is empty", () => {
    expect(buildSpinLabels([], "Solo", 8)).toEqual(["Solo"]);
  });

  it("uses at least one frame when count is 1", () => {
    expect(buildSpinLabels(["A"], "A", 1)).toEqual(["A"]);
  });
});
