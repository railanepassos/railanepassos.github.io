/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { createAppBarActions, renderSideNav, type ShellHandlers } from "../../src/links/app-shell";

function handlers(over: Partial<ShellHandlers> = {}): ShellHandlers {
  return {
    onSection: vi.fn(),
    onToggleCategory: vi.fn(),
    onClearCategories: vi.fn(),
    onQuery: vi.fn(),
    onAdd: vi.fn(),
    onDeck: vi.fn(),
    onDraw: vi.fn(),
    onAskClaude: vi.fn(),
    onAiRequests: vi.fn(),
    onSignOut: vi.fn(),
    ...over,
  };
}

describe("Pedir ao Claude entry points", () => {
  it("app bar has a Pedir ao Claude button", () => {
    const h = handlers();
    const bar = createAppBarActions(h, null);
    const btn = bar.querySelector<HTMLButtonElement>("[data-action='ask-claude']")!;
    expect(btn.getAttribute("aria-label")).toBe("Pedir ao Claude");
    btn.click();
    expect(h.onAskClaude).toHaveBeenCalled();
  });

  it("side nav has both items", () => {
    const h = handlers();
    const nav = document.createElement("nav");
    renderSideNav(
      nav,
      {
        section: "feed",
        categories: [],
        sectionCounts: { feed: 0, agenda: 0, done: 0, memories: 0 },
        categoryCounts: [],
      },
      h
    );
    nav.querySelector<HTMLButtonElement>("[data-action='ask-claude']")!.click();
    nav.querySelector<HTMLButtonElement>("[data-action='ai-requests']")!.click();
    expect(h.onAskClaude).toHaveBeenCalled();
    expect(h.onAiRequests).toHaveBeenCalled();
  });
});
