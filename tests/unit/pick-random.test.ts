import { describe, expect, it } from "vitest";
import { pickRandomItem } from "../../src/links/pick-random";

describe("pickRandomItem", () => {
  it("returns null for empty list", () => {
    expect(pickRandomItem([])).toBeNull();
  });

  it("returns the only item", () => {
    expect(pickRandomItem(["solo"])).toBe("solo");
  });

  it("uses the provided random source for index", () => {
    const items = ["a", "b", "c", "d"];
    expect(pickRandomItem(items, () => 0)).toBe("a");
    expect(pickRandomItem(items, () => 0.99)).toBe("d");
    expect(pickRandomItem(items, () => 0.5)).toBe("c");
  });
});
