import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAuthedWith } from "./helpers/authed";

/** Phase 7: Modo visita (tabs, checklist ticks, finish) and the "Hoje" banner. Fake data only. */

const PLACE = {
  id: "00000000-0000-4000-8000-0000000000f1",
  url: "https://example.com/lugar-da-visita",
  label: "Lugar Da Visita",
  description: null,
  icon_preset: null,
  icon_url: null,
  category: "museu",
  sort_order: 10,
  scheduled_start: null,
  scheduled_end: null,
  status: "wishlist",
  priority: 0,
  want_again: false,
  image_url: null,
  note: null,
  completed_at: null,
  created_at: "2026-11-10T12:00:00Z",
  plan_items: [
    { text: "Comprar ingressos", list: "checklist", done: false },
    { text: "Protetor solar", list: "checklist", done: false },
  ],
};

function todayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const ROWS = [PLACE, ...LINK_ROWS];

test.describe("visit mode", () => {
  test("ticks persist and the mode reopens from #visita/<id> after a reload", async ({ page }) => {
    const writes = await openAuthedWith(page, ROWS);
    await page.locator(".feed-card", { hasText: "Lugar Da Visita" }).locator(".feed-card__open").click();
    await page.locator(".links-detail").getByRole("button", { name: "Modo visita" }).click();

    const mode = page.getByRole("dialog", { name: "Lugar Da Visita" });
    await expect(mode).toBeVisible();
    await mode.getByRole("tab", { name: "Checklist" }).click();
    await mode.getByRole("checkbox", { name: /Comprar ingressos/ }).check();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched?.plan_items).toEqual([
      { text: "Comprar ingressos", list: "checklist", done: true },
      { text: "Protetor solar", list: "checklist", done: false },
    ]);

    await expect(page).toHaveURL(new RegExp(`#visita/${PLACE.id}$`));
    await page.reload();
    const reopened = page.getByRole("dialog", { name: "Lugar Da Visita" });
    await expect(reopened).toBeVisible();
    await reopened.getByRole("tab", { name: "Checklist" }).click();
    await expect(reopened.getByRole("checkbox", { name: /Comprar ingressos/ })).toBeChecked();
    await expect(reopened.getByRole("checkbox", { name: /Protetor solar/ })).not.toBeChecked();
  });

  test("finishing the visit opens the 'Como foi' sheet", async ({ page }) => {
    await openAuthedWith(page, ROWS, { hash: `#visita/${PLACE.id}` });
    const mode = page.getByRole("dialog", { name: "Lugar Da Visita" });
    await expect(mode).toBeVisible();
    await mode.getByRole("button", { name: "Terminar visita" }).click();
    await mode.getByRole("button", { name: "Marcar como feito" }).click();
    await expect(page.getByRole("dialog", { name: "Como foi" })).toBeVisible();
  });
});

test.describe("today banner", () => {
  const SCHEDULED = { ...PLACE, label: "Passeio De Hoje", scheduled_start: todayAt(15), scheduled_end: todayAt(17) };

  test("shows for a place scheduled today and its button opens the mode", async ({ page }) => {
    await openAuthedWith(page, [SCHEDULED, ...LINK_ROWS]);
    const banner = page.locator(".links-today");
    await expect(banner).toContainText("Hoje: Passeio De Hoje");
    await banner.getByRole("button", { name: "Abrir modo visita" }).click();
    await expect(page.getByRole("dialog", { name: "Passeio De Hoje" })).toBeVisible();
  });

  test("dismissing hides it for the day, even after a reload", async ({ page }) => {
    await openAuthedWith(page, [SCHEDULED, ...LINK_ROWS]);
    await page.locator(".links-today").getByRole("button", { name: "Dispensar" }).click();
    await expect(page.locator(".links-today")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".feed-card").first()).toBeVisible();
    await expect(page.locator(".links-today")).toHaveCount(0);
  });

  test("no banner when nothing is scheduled today", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await expect(page.locator(".links-today")).toHaveCount(0);
  });
});
