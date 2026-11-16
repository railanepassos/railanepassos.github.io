import { test, expect, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAuthedWith } from "./helpers/authed";

/** Phase 3: impressions and lessons learned in "Como foi". Fake data only. */

const BASE = {
  description: null,
  icon_preset: null,
  icon_url: null,
  category: "museu",
  sort_order: 10,
  scheduled_start: null,
  scheduled_end: null,
  priority: 0,
  image_url: null,
  note: null,
  created_at: "2026-11-10T12:00:00Z",
};

const DONE = {
  ...BASE,
  id: "00000000-0000-4000-8000-0000000000c1",
  url: "https://example.com/lugar-feito",
  label: "Lugar Feito",
  status: "done",
  want_again: false,
  completed_at: "2026-12-12T15:00:00Z",
};

const FILLED = {
  ...DONE,
  id: "00000000-0000-4000-8000-0000000000c2",
  url: "https://example.com/lugar-com-licoes",
  label: "Lugar Com Lições",
  sort_order: 11,
  impressions: "Fila grande.\nMas valeu a pena <b>muito</b>.",
  lessons: ["levar lanche", "chegar antes das 9h"],
};

async function goToDone(page: Page): Promise<void> {
  const nav = isMobile(page) ? page.locator("#links-tabbar") : page.locator("#links-sidenav");
  await nav.locator('[data-section="done"]').click();
}

async function openDetail(page: Page, title: string): Promise<void> {
  await goToDone(page);
  await page.locator(".feed-card", { hasText: title }).locator(".feed-card__open").click();
}

test.describe("impressions and lessons", () => {
  test("saves impressions and ordered lessons from Como foi and shows them in the detail", async ({
    page,
  }) => {
    const writes = await openAuthedWith(page, [DONE, ...LINK_ROWS]);
    await openDetail(page, "Lugar Feito");
    const detail = page.locator(".links-detail");
    await expect(detail.locator("[data-field='impressions']")).toBeHidden();
    await expect(detail.locator("[data-field='lessons']")).toBeHidden();

    await detail.getByRole("button", { name: "Editar Como foi" }).click();
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await sheet.getByLabel("Impressões").fill("Gostei da vista.\nCaro para o que oferece.");
    for (const text of ["chegar antes das 9h", "levar lanche", "  ", "apagar"]) {
      await sheet.getByRole("button", { name: "Adicionar lição" }).click();
      await sheet.locator(".links-lessons__text").last().fill(text);
    }
    await sheet.getByRole("button", { name: "Remover lição 4" }).click();
    await sheet.getByRole("button", { name: "Subir lição 2" }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();

    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({
      impressions: "Gostei da vista.\nCaro para o que oferece.",
      lessons: ["levar lanche", "chegar antes das 9h"],
    });

    const impressions = detail.locator("[data-field='impressions']");
    await expect(impressions).toContainText("Gostei da vista.");
    await expect(impressions).toContainText("Caro para o que oferece.");
    const items = detail.locator("[data-field='lessons'] li");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveText("levar lanche");
    await expect(items.nth(1)).toHaveText("chegar antes das 9h");
  });

  test("detail renders as text and keeps line breaks in impressions", async ({ page }) => {
    await openAuthedWith(page, [FILLED, ...LINK_ROWS]);
    await openDetail(page, "Lugar Com Lições");
    const value = page.locator(".links-detail [data-field='impressions'] dd");
    await expect(value).toContainText("<b>muito</b>");
    expect(await value.locator("b").count()).toBe(0);
    expect(await value.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("pre-line");
  });

  test("the sheet opens prefilled and clearing both sends null", async ({ page }) => {
    const writes = await openAuthedWith(page, [FILLED, ...LINK_ROWS]);
    await openDetail(page, "Lugar Com Lições");
    await page.locator(".links-detail").getByRole("button", { name: "Editar Como foi" }).click();
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await expect(sheet.getByLabel("Impressões")).toHaveValue(/Fila grande\./);
    await expect(sheet.locator(".links-lessons__text")).toHaveCount(2);

    await sheet.getByLabel("Impressões").fill("");
    await sheet.getByRole("button", { name: "Remover lição 2" }).click();
    await sheet.getByRole("button", { name: "Remover lição 1" }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ impressions: null, lessons: null });
    await expect(page.locator(".links-detail [data-field='impressions']")).toBeHidden();
    await expect(page.locator(".links-detail [data-field='lessons']")).toBeHidden();
  });

  test("the lesson list stops at 20 items and Cancelar writes nothing", async ({ page }) => {
    const writes = await openAuthedWith(page, [DONE, ...LINK_ROWS]);
    await openDetail(page, "Lugar Feito");
    await page.locator(".links-detail").getByRole("button", { name: "Editar Como foi" }).click();
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    const add = sheet.getByRole("button", { name: "Adicionar lição" });
    for (let i = 0; i < 20; i++) await add.click();
    await expect(add).toBeDisabled();
    await expect(sheet.locator(".links-lessons__text").first()).toHaveAttribute("maxlength", "300");
    await sheet.getByRole("button", { name: "Cancelar" }).click();
    expect(writes.patched).toBeNull();
  });

  test("Enter adds a lesson below and focuses it; move buttons only appear with 2+ lessons", async ({
    page,
  }) => {
    const writes = await openAuthedWith(page, [DONE, ...LINK_ROWS]);
    await openDetail(page, "Lugar Feito");
    await page.locator(".links-detail").getByRole("button", { name: "Editar Como foi" }).click();
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    const inputs = sheet.locator(".links-lessons__text");
    await sheet.getByRole("button", { name: "Adicionar lição" }).click();
    await expect(inputs).toHaveCount(1);
    await expect(inputs.first()).toHaveAttribute("enterkeyhint", "next");
    await expect(sheet.getByRole("button", { name: "Subir lição 1" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Descer lição 1" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Remover lição 1" })).toBeVisible();

    await inputs.first().fill("levar lanche");
    await inputs.first().press("Enter");
    await expect(inputs).toHaveCount(2);
    await expect(inputs.nth(1)).toBeFocused();
    // Enter on the empty last row does nothing.
    await inputs.nth(1).press("Enter");
    await expect(inputs).toHaveCount(2);
    await expect(sheet).toBeVisible();

    await expect(sheet.getByRole("button", { name: "Subir lição 1" })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: "Descer lição 1" })).toBeEnabled();
    await expect(sheet.getByRole("button", { name: "Subir lição 2" })).toBeEnabled();
    await expect(sheet.getByRole("button", { name: "Descer lição 2" })).toBeDisabled();
    for (const name of ["Subir lição 1", "Descer lição 2", "Remover lição 1"]) {
      const box = await sheet.getByRole("button", { name }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await inputs.nth(1).fill("chegar cedo");
    await inputs.nth(1).press("Enter");
    await inputs.nth(2).press("Enter");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ lessons: ["levar lanche", "chegar cedo"] });
  });

  test("free-text search finds a place by a word from its lessons or impressions", async ({
    page,
  }) => {
    await openAuthedWith(page, [FILLED, DONE, ...LINK_ROWS]);
    await goToDone(page);
    const input = page.locator("#links-search-input");
    if (isMobile(page) && !(await input.isVisible())) {
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
    }
    await input.fill("lanche");
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card")).toContainText("Lugar Com Lições");
    await input.fill("FILA");
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await input.fill("naoexiste");
    await expect(page.locator(".feed-card")).toHaveCount(0);
  });
});
