/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncBodyScreenLock } from "../../src/links/screen-lock";

function mockWide(wide: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: wide }),
  });
}

function addOverlay(className: string): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.replaceChildren();
  document.body.className = "";
});

describe("syncBodyScreenLock", () => {
  it("locks the page when a modal is open", () => {
    mockWide(false);
    addOverlay("links-admin-modal");
    syncBodyScreenLock();
    expect(document.body.classList.contains("links-screen-open")).toBe(true);
  });

  it("locks for the detail view on mobile (full screen)", () => {
    mockWide(false);
    addOverlay("links-admin-modal links-detail");
    syncBodyScreenLock();
    expect(document.body.classList.contains("links-screen-open")).toBe(true);
    expect(document.body.classList.contains("links-detail-open")).toBe(false);
  });

  it("does not lock for the desktop side panel and flags the layout instead", () => {
    mockWide(true);
    addOverlay("links-admin-modal links-detail");
    syncBodyScreenLock();
    expect(document.body.classList.contains("links-screen-open")).toBe(false);
    expect(document.body.classList.contains("links-detail-open")).toBe(true);
  });

  it("clears both flags when nothing is open", () => {
    mockWide(true);
    const el = addOverlay("links-admin-modal links-detail");
    el.hidden = true;
    syncBodyScreenLock();
    expect(document.body.classList.contains("links-screen-open")).toBe(false);
    expect(document.body.classList.contains("links-detail-open")).toBe(false);
  });
});
