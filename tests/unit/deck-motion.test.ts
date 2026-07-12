/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefersDeckMotion, waitForMotion } from "../../src/links/deck-motion";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("prefersDeckMotion", () => {
  it("returns false when reduced motion is preferred", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({
        matches: q.includes("prefers-reduced-motion"),
        media: q,
      }))
    );
    expect(prefersDeckMotion()).toBe(false);
  });

  it("returns true when reduced motion is not preferred", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, media: "" })
    );
    expect(prefersDeckMotion()).toBe(true);
  });

  it("returns false when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersDeckMotion()).toBe(false);
  });
});

describe("waitForMotion", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("resolves when animationend fires on the element", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const done = waitForMotion(el, { className: "go" });
    expect(el.classList.contains("go")).toBe(true);
    el.dispatchEvent(new Event("animationend"));
    await done;
    expect(el.classList.contains("go")).toBe(false);
  });

  it("resolves on timeout if no event", async () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const done = waitForMotion(el, { className: "go", timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    await done;
    expect(el.classList.contains("go")).toBe(false);
  });
});
