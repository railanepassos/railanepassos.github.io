/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPageZoom } from "../../src/links/viewport-zoom";

const ORIGINAL = "width=device-width, initial-scale=1, viewport-fit=cover";

describe("resetPageZoom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = `<meta name="viewport" content="${ORIGINAL}">`;
  });
  afterEach(() => vi.useRealTimers());

  const content = () => document.querySelector('meta[name="viewport"]')!.getAttribute("content");

  it("briefly caps the scale so iOS Safari snaps back to 1x", () => {
    resetPageZoom();
    expect(content()).toBe(`${ORIGINAL}, maximum-scale=1`);
  });

  it("restores the original viewport so pinch-zoom keeps working", () => {
    resetPageZoom();
    vi.runAllTimers();
    expect(content()).toBe(ORIGINAL);
  });

  it("restores the original even when called twice in a row", () => {
    resetPageZoom();
    resetPageZoom();
    vi.runAllTimers();
    expect(content()).toBe(ORIGINAL);
  });

  it("does nothing without a viewport meta", () => {
    document.head.innerHTML = "";
    expect(() => resetPageZoom()).not.toThrow();
  });
});
