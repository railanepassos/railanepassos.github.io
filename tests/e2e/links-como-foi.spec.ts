import { test, expect, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAuthedWith } from "./helpers/authed";

/** Phase 3 foundation: the "Como foi" sheet (rating + Voltaria?). Fake data only. */

const TODO = {
  id: "00000000-0000-4000-8000-0000000000b1",
  url: "https://example.com/lugar-para-fazer",
  label: "Lugar Para Fazer",
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
};

const RATED = {
  ...TODO,
  id: "00000000-0000-4000-8000-0000000000b2",
  url: "https://example.com/lugar-avaliado",
  label: "Lugar Avaliado",
  sort_order: 11,
  status: "done",
  want_again: true,
  completed_at: "2026-12-12T15:00:00Z",
  rating: 3,
};

async function goToDone(page: Page): Promise<void> {
  const nav = isMobile(page) ? page.locator("#links-tabbar") : page.locator("#links-sidenav");
  await nav.locator('[data-section="done"]').click();
}

async function markTodoDone(page: Page): Promise<void> {
  const card = page.locator(".feed-card", { hasText: "Lugar Para Fazer" });
  await card.getByRole("button", { name: "Marcar Lugar Para Fazer como feito" }).click();
}

test.describe("Como foi sheet", () => {
  test("mark done opens the sheet; rating and Voltaria? are saved in one PATCH", async ({ page }) => {
    const writes = await openAuthedWith(page, [TODO, ...LINK_ROWS]);
    await markTodoDone(page);

    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Lugar Para Fazer");
    await sheet.getByRole("radio", { name: "4 de 5" }).click();
    await sheet.getByLabel("Voltaria?").check();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet).toBeHidden();

    expect(writes.allPatched).toHaveLength(2);
    expect(writes.allPatched[0]).toMatchObject({ status: "done" });
    expect(writes.allPatched[1]).toEqual({ rating: 4, want_again: true, impressions: null, lessons: null });

    // The rating shows on the card, in the Feitos section.
    await goToDone(page);
    const card = page.locator(".feed-card", { hasText: "Lugar Para Fazer" });
    await expect(card.locator(".feed-card__meta-item--rating")).toContainText("4/5");
  });

  test("Pular closes the sheet without saving any review data", async ({ page }) => {
    const writes = await openAuthedWith(page, [TODO, ...LINK_ROWS]);
    await markTodoDone(page);

    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await sheet.getByRole("radio", { name: "5 de 5" }).click();
    await sheet.getByRole("button", { name: "Pular" }).click();
    await expect(sheet).toBeHidden();

    expect(writes.allPatched).toHaveLength(1);
    expect(writes.allPatched[0]).toMatchObject({ status: "done" });
    expect(writes.allPatched[0]).not.toHaveProperty("rating");
    expect(writes.allPatched[0]).not.toHaveProperty("want_again");

    await goToDone(page);
    const card = page.locator(".feed-card", { hasText: "Lugar Para Fazer" });
    await expect(card).toBeVisible();
    await expect(card.locator(".feed-card__meta-item--rating")).toHaveCount(0);
  });

  test("rating is a 5-option radiogroup with 44px touch targets, changeable and clearable", async ({
    page,
  }) => {
    await openAuthedWith(page, [TODO, ...LINK_ROWS]);
    await markTodoDone(page);

    const sheet = page.getByRole("dialog", { name: "Como foi" });
    const group = sheet.getByRole("radiogroup", { name: "Nota" });
    const radios = group.getByRole("radio");
    await expect(radios).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const box = await radios.nth(i).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await radios.nth(2).click();
    await expect(radios.nth(2)).toHaveAttribute("aria-checked", "true");
    await radios.nth(4).click();
    await expect(radios.nth(4)).toHaveAttribute("aria-checked", "true");
    await expect(radios.nth(2)).toHaveAttribute("aria-checked", "false");
    await radios.nth(4).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(radios.nth(3)).toHaveAttribute("aria-checked", "true");

    await sheet.getByRole("button", { name: "Limpar nota" }).click();
    await expect(group.locator("[aria-checked='true']")).toHaveCount(0);
  });

  test("detail of a rated place shows visit, rating and Voltaria?; edit saves a changed rating", async ({
    page,
  }) => {
    const writes = await openAuthedWith(page, [RATED, ...LINK_ROWS]);
    await goToDone(page);
    const card = page.locator(".feed-card", { hasText: "Lugar Avaliado" });
    await expect(card.locator(".feed-card__meta-item--rating")).toContainText("3/5");
    await card.locator(".feed-card__open").click();

    const detail = page.locator(".links-detail");
    await expect(detail.locator("[data-field='completed_at']")).toContainText("12 de dezembro de 2026");
    await expect(detail.locator("[data-field='rating']")).toContainText("3 de 5");
    await expect(detail.locator("[data-field='want_again']")).toContainText("Sim");

    await detail.getByRole("button", { name: "Editar Como foi" }).click();
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await expect(sheet.getByRole("radio", { name: "3 de 5" })).toHaveAttribute("aria-checked", "true");
    await expect(sheet.getByLabel("Voltaria?")).toBeChecked();
    await expect(sheet.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await sheet.getByRole("radio", { name: "5 de 5" }).click();
    await sheet.getByLabel("Voltaria?").uncheck();
    await sheet.getByRole("button", { name: "Salvar" }).click();

    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toEqual({ rating: 5, want_again: false, impressions: null, lessons: null });
    // Back on the detail with the new rating.
    await expect(detail.locator("[data-field='rating']")).toContainText("5 de 5");
    await expect(detail.locator("[data-field='want_again']")).toBeHidden();
  });

  test("clearing the rating from the detail sends null", async ({ page }) => {
    const writes = await openAuthedWith(page, [RATED, ...LINK_ROWS]);
    await goToDone(page);
    await page.locator(".feed-card", { hasText: "Lugar Avaliado" }).locator(".feed-card__open").click();
    await page.locator(".links-detail").getByRole("button", { name: "Editar Como foi" }).click();
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await sheet.getByRole("button", { name: "Limpar nota" }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toEqual({ rating: null, want_again: true, impressions: null, lessons: null });
    await expect(page.locator(".links-detail [data-field='rating']")).toBeHidden();
  });

  test("unmarking done changes only status and completed_at and keeps the review", async ({ page }) => {
    const writes = await openAuthedWith(page, [RATED, ...LINK_ROWS]);
    await goToDone(page);
    const card = page.locator(".feed-card", { hasText: "Lugar Avaliado" });
    await card.getByRole("button", { name: "Mais opções" }).click();
    await card.getByRole("menuitem", { name: "Desmarcar feito" }).click();

    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toEqual({ status: "wishlist", completed_at: null });
    await expect(page.locator(".feed-card", { hasText: "Lugar Avaliado" })).toHaveCount(0);

    // Back in the wishlist the card looks like any other: no rating shown.
    const nav = isMobile(page) ? page.locator("#links-tabbar") : page.locator("#links-sidenav");
    await nav.locator('[data-section="feed"]').click();
    const back = page.locator(".feed-card", { hasText: "Lugar Avaliado" });
    await expect(back).toBeVisible();
    await expect(back.locator(".feed-card__meta-item--rating")).toHaveCount(0);

    // Marking it done again brings the sheet back prefilled with the kept data.
    await back.getByRole("button", { name: "Marcar Lugar Avaliado como feito" }).click();
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await expect(sheet.getByRole("radio", { name: "3 de 5" })).toHaveAttribute("aria-checked", "true");
    await expect(sheet.getByLabel("Voltaria?")).toBeChecked();
  });

  test("wishlist and legacy items look unchanged", async ({ page }) => {
    await openAuthedWith(page, [TODO, ...LINK_ROWS]);
    await expect(page.locator(".feed-card__meta-item--rating")).toHaveCount(0);
    await page.locator(".feed-card", { hasText: "Lugar Para Fazer" }).locator(".feed-card__open").click();
    const detail = page.locator(".links-detail");
    for (const key of ["completed_at", "rating", "want_again", "review-edit"]) {
      await expect(detail.locator(`[data-field='${key}']`)).toBeHidden();
    }
  });
});
