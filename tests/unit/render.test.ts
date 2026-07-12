/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import type { LinkRow } from "../../src/links/links-repo";
import { renderGuestGate, renderPublicCard } from "../../src/links/render";

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "link-1",
    url: "https://example.com",
    label: "Museu",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
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

describe("renderGuestGate", () => {
  it("shows login prompt and no experience cards", () => {
    const container = document.createElement("nav");
    container.appendChild(document.createElement("a")).className = "link-card";

    renderGuestGate(container);

    expect(container.querySelectorAll(".link-card")).toHaveLength(0);
    const status = container.querySelector(".links-status");
    expect(status?.textContent).toBe("Entre para ver as experiências.");
  });
});

describe("renderPublicCard", () => {
  it("renders a schedule chip when start and end are present", () => {
    const card = renderPublicCard(
      row({
        scheduled_start: "2026-08-03T09:00:00-03:00",
        scheduled_end: "2026-08-03T17:00:00-03:00",
      })
    );

    const chip = card.querySelector(".link-card__schedule");
    expect(chip?.textContent).toBe("3 ago · 9–17");
  });

  it("applies category theme and trilha backdrop", () => {
    const card = renderPublicCard(
      row({ category: "trilha", label: "Pico do Itacolomi" })
    );
    expect(card.classList.contains("link-card--cat-trilha")).toBe(true);
    expect(card.querySelector(".link-card__backdrop")?.getAttribute("src")).toBe(
      "/assets/img/categories/trilha.jpg"
    );
  });
});
