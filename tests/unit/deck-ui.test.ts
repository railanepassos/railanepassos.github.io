/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeckScreen } from "../../src/links/deck-ui";
import type { LinkRow } from "../../src/links/links-repo";

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "link-1",
    url: "https://example.com",
    label: "Trilha da serra",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "trilha",
    sort_order: 0,
    scheduled_start: null,
    scheduled_end: null,
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    ...partial,
  };
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("createDeckScreen category art", () => {
  it("shows stock category backdrop on the deck card", () => {
    const deck = createDeckScreen({
      onWant: vi.fn(),
      onSkip: vi.fn(),
      onMarkDone: vi.fn(),
      onWantAgain: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(deck.element);
    deck.open([row()], "wishlist");

    const img = deck.element.querySelector(
      ".links-deck-screen__img"
    ) as HTMLImageElement | null;
    expect(img?.getAttribute("src")).toBe("/assets/img/categories/trilha.jpg");
    expect(
      deck.element
        .querySelector(".links-deck-screen__card")
        ?.classList.contains("link-card--cat-trilha")
    ).toBe(true);
    expect(deck.element.querySelector(".links-deck-screen__progress")?.textContent).toBe(
      "1 de 1"
    );
  });

  it("uses the same Voltar chrome as Detalhes", () => {
    const onClose = vi.fn();
    const deck = createDeckScreen({
      onWant: vi.fn(),
      onSkip: vi.fn(),
      onMarkDone: vi.fn(),
      onWantAgain: vi.fn(),
      onClose,
    });
    document.body.appendChild(deck.element);
    deck.open([row()], "wishlist");

    const back = deck.element.querySelector(
      ".links-admin-screen__back"
    ) as HTMLButtonElement | null;
    expect(back?.textContent).toBe("Voltar");
    expect(deck.element.querySelector("#links-deck-title")?.textContent).toBe(
      "Deck"
    );
    back?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a touch-friendly hint without keyboard shortcuts", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, media: "(pointer: fine)" })
    );
    const deck = createDeckScreen({
      onWant: vi.fn(),
      onSkip: vi.fn(),
      onMarkDone: vi.fn(),
      onWantAgain: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(deck.element);
    deck.open([row()], "wishlist");

    expect(deck.element.querySelector(".links-deck-screen__hint")?.textContent).toBe(
      "Deslize o card ou use os botões."
    );
  });

  it("mentions keyboard shortcuts only with a fine pointer", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(pointer: fine)",
        media: query,
      }))
    );
    const deck = createDeckScreen({
      onWant: vi.fn(),
      onSkip: vi.fn(),
      onMarkDone: vi.fn(),
      onWantAgain: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(deck.element);
    deck.open([row()], "wishlist");

    expect(deck.element.querySelector(".links-deck-screen__hint")?.textContent).toBe(
      "Use as setas. D marca como feita."
    );
  });
});
