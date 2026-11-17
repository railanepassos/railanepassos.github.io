import { test, expect, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAuthedWith } from "./helpers/authed";

/** Phase 6: Memórias timeline (done items with a visit date). Fake data only. */

function done(
  id: string,
  label: string,
  completed: string | null,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-0000000000${id}`,
    url: `https://example.com/${id}`,
    label,
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
    sort_order: 30,
    scheduled_start: null,
    scheduled_end: null,
    status: "done",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: completed,
    created_at: "2026-11-10T12:00:00Z",
    rating: null,
    ...extra,
  };
}

/** The shared fixture has one done row; keep only the wishlist ones. */
const WISHLIST = LINK_ROWS.filter((r) => r.status === "wishlist");

const ROWS = [
  done("m1", "Museu Novembro", "2026-11-20T15:00:00Z", {
    rating: 4,
    impressions: "Passeio muito bom. ".repeat(20),
    memory_url: "https://youtu.be/dQw4w9WgXcQ",
  }),
  done("m2", "Forte Fevereiro", "2026-02-14T15:00:00Z"),
  done("m3", "Praia Antiga", "2025-03-10T15:00:00Z", { memory_url: "https://photos.app.goo.gl/abc" }),
  done("m4", "Sem Data", null),
  ...WISHLIST,
];

async function openMemories(page: Page): Promise<void> {
  if (isMobile(page)) {
    await page.locator("#links-tabbar").locator('[data-section="done"]').click();
    await page.locator(".links-memswitch").getByRole("button", { name: "Memórias" }).click();
  } else {
    await page.locator("#links-sidenav").locator('[data-section="memories"]').click();
  }
}

test.describe("Memórias", () => {
  test("lists dated done items grouped by year and month, newest first", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await openMemories(page);

    await expect(page.locator(".links-memories__year-title")).toHaveText(["2026", "2025"]);
    await expect(page.locator(".links-memories__month-title")).toHaveText([
      "Novembro",
      "Fevereiro",
      "Março",
    ]);
    await expect(page.locator(".links-memory__open")).toHaveText([
      "Museu Novembro",
      "Forte Fevereiro",
      "Praia Antiga",
    ]);
    await expect(page.getByText("Sem Data")).toHaveCount(0);

    const first = page.locator(".links-memory").first();
    await expect(first.locator(".links-memory__date")).toContainText("2026");
    await expect(first.locator(".links-memory__rating")).toContainText("4/5");
    await expect(first.locator("[data-action=open-memory]")).toContainText("Assistir");
    await expect(
      page.locator(".links-memory").nth(2).locator("[data-action=open-memory]")
    ).toContainText("Ver álbum");
    const impressions = (await first.locator(".links-memory__impressions").innerText()).length;
    expect(impressions).toBeLessThan(200);
  });

  test("tapping an entry opens the detail", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await openMemories(page);
    await page.locator(".links-memory__open", { hasText: "Forte Fevereiro" }).click();
    await expect(page.locator(".links-detail")).toBeVisible();
    await expect(page.locator(".links-detail")).toContainText("Forte Fevereiro");
  });

  test("empty state explains how to add memories", async ({ page }) => {
    await openAuthedWith(page, [...WISHLIST]);
    await openMemories(page);
    await expect(page.locator(".links-memories__empty")).toContainText("Marque uma experiência como feita");
  });

  test("mobile: switch goes back to the list and controls are touch-sized", async ({ page }) => {
    test.skip(!isMobile(page), "mobile only");
    await openAuthedWith(page, ROWS);
    await openMemories(page);
    for (const sel of [".links-memswitch__btn", ".links-memory__open", ".links-memory__action"]) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      const size = await page
        .locator(sel)
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size).toBeGreaterThanOrEqual(16);
    }
    await page.locator(".links-memswitch").getByRole("button", { name: "Lista" }).click();
    await expect(page.locator(".feed-card__title").first()).toBeVisible();
    await expect(page.locator("#links-tabbar [data-section=done]")).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("desktop: side nav has Memórias and no switch", async ({ page }) => {
    test.skip(isMobile(page), "desktop only");
    await openAuthedWith(page, ROWS);
    await expect(page.locator('#links-sidenav [data-section="memories"]')).toContainText("Memórias");
    await expect(page.locator(".links-memswitch")).toBeHidden();
  });
});
