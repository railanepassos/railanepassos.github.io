/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { ICON_NAMES, uiIcon } from "../../src/links/ui-icons";

describe("uiIcon", () => {
  it("builds a decorative stroke SVG with the shared 1.8 stroke", () => {
    const svg = uiIcon("calendar");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("stroke-width")).toBe("1.8");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.childElementCount).toBeGreaterThan(0);
  });

  it("honours a custom size", () => {
    expect(uiIcon("plus", 24).getAttribute("height")).toBe("24");
  });

  it("renders every registered icon without throwing", () => {
    for (const name of ICON_NAMES) {
      expect(uiIcon(name).childElementCount).toBeGreaterThan(0);
    }
  });
});
