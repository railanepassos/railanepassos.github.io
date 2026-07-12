/**
 * @vitest-environment jsdom
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (typeof globalThis.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      public readonly pointerId: number;
      constructor(type: string, init?: PointerEventInit) {
        super(type, init as MouseEventInit);
        this.pointerId = (init as PointerEventInit)?.pointerId ?? 0;
      }
    }
    (globalThis as unknown as Record<string, unknown>).PointerEvent =
      PointerEventPolyfill;
  }
  if (typeof HTMLElement.prototype.setPointerCapture === "undefined") {
    HTMLElement.prototype.setPointerCapture = () => {};
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
});
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

describe("createDeckScreen motion", () => {
  function stubMotion(reduced: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({
        matches: reduced && q.includes("prefers-reduced-motion"),
        media: q,
      }))
    );
  }

  it("does not call onWant until fly animation ends", async () => {
    stubMotion(false);
    const onWant = vi.fn();
    const deck = createDeckScreen({
      onWant,
      onSkip: vi.fn(),
      onMarkDone: vi.fn(),
      onWantAgain: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(deck.element);
    deck.open([row({ id: "a" }), row({ id: "b", label: "B" })], "wishlist");

    const wantBtn = deck.element.querySelector(
      ".links-deck-screen__btn--want"
    ) as HTMLButtonElement;
    wantBtn.click();

    expect(onWant).not.toHaveBeenCalled();
    const card = deck.element.querySelector(
      ".links-deck-screen__card"
    ) as HTMLElement;
    expect(card.classList.contains("links-deck-screen__card--fly-right")).toBe(
      true
    );
    card.dispatchEvent(new Event("animationend"));
    await vi.waitFor(() => expect(onWant).toHaveBeenCalledTimes(1));
  });

  it("does not call onMarkDone until fly animation ends", async () => {
    stubMotion(false);
    const onMarkDone = vi.fn();
    const deck = createDeckScreen({
      onWant: vi.fn(),
      onSkip: vi.fn(),
      onMarkDone,
      onWantAgain: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(deck.element);
    deck.open([row()], "wishlist");

    const doneBtn = deck.element.querySelector(
      ".links-deck-screen__btn--done"
    ) as HTMLButtonElement;
    doneBtn.click();

    expect(onMarkDone).not.toHaveBeenCalled();
    const card = deck.element.querySelector(
      ".links-deck-screen__card"
    ) as HTMLElement;
    expect(card.classList.contains("links-deck-screen__card--fly-up")).toBe(
      true
    );
    card.dispatchEvent(new Event("animationend"));
    await vi.waitFor(() => expect(onMarkDone).toHaveBeenCalledTimes(1));
  });

  it("calls onWant immediately when reduced motion", async () => {
    stubMotion(true);
    const onWant = vi.fn();
    const deck = createDeckScreen({
      onWant,
      onSkip: vi.fn(),
      onMarkDone: vi.fn(),
      onWantAgain: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(deck.element);
    deck.open([row()], "wishlist");
    (
      deck.element.querySelector(
        ".links-deck-screen__btn--want"
      ) as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(onWant).toHaveBeenCalledTimes(1));
  });

  it("snap-back does not call onSkip or onWant", async () => {
    stubMotion(false);
    const onWant = vi.fn();
    const onSkip = vi.fn();
    const deck = createDeckScreen({
      onWant,
      onSkip,
      onMarkDone: vi.fn(),
      onWantAgain: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(deck.element);
    deck.open([row()], "wishlist");
    const card = deck.element.querySelector(
      ".links-deck-screen__card"
    ) as HTMLElement;
    card.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1, button: 0, clientX: 100 })
    );
    card.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientX: 120 })
    );
    card.dispatchEvent(
      new PointerEvent("pointerup", { pointerId: 1, clientX: 120 })
    );
    expect(onWant).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });
});
