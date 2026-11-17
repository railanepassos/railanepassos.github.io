import { test, expect, type Locator, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAddForm, openAuthedWith } from "./helpers/authed";

/**
 * Mobile regressions reported on an iPhone: iOS Safari zooms into any form
 * control under 16px, and the "Como foi" sheet must always open at the top.
 * Fake data only.
 */

const TODO = {
  id: "00000000-0000-4000-8000-0000000000d1",
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

const DONE = {
  ...TODO,
  id: "00000000-0000-4000-8000-0000000000d2",
  url: "https://example.com/lugar-feito",
  label: "Lugar Feito",
  sort_order: 11,
  status: "done",
  completed_at: "2026-12-12T15:00:00Z",
  lessons: ["levar lanche", "chegar cedo", "usar tênis", "levar água", "ir de manhã"],
};

async function markTodoDone(page: Page): Promise<void> {
  await page
    .locator(".feed-card", { hasText: "Lugar Para Fazer" })
    .getByRole("button", { name: "Marcar Lugar Para Fazer como feito" })
    .click();
}

async function goToDone(page: Page): Promise<void> {
  const nav = isMobile(page) ? page.locator("#links-tabbar") : page.locator("#links-sidenav");
  await nav.locator('[data-section="done"]').click();
}

async function openEditFromDetail(page: Page): Promise<void> {
  await goToDone(page);
  await page.locator(".feed-card", { hasText: "Lugar Feito" }).locator(".feed-card__open").click();
  await page.locator(".links-detail").getByRole("button", { name: "Editar Como foi" }).click();
}

/** Computed font sizes (px) of every visible input, textarea and select inside `root`. */
async function controlFontSizes(root: Locator): Promise<Array<{ id: string; size: number }>> {
  return root.evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>("input, textarea, select"))
      .filter((c) => {
        const box = c.getBoundingClientRect();
        const style = getComputedStyle(c);
        const type = (c as HTMLInputElement).type;
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.visibility !== "hidden" &&
          type !== "checkbox" &&
          type !== "radio" &&
          type !== "hidden"
        );
      })
      .map((c) => ({
        id: c.id || c.className || c.tagName,
        size: parseFloat(getComputedStyle(c).fontSize),
      }))
  );
}

test.describe("iOS focus zoom (controls at least 16px)", () => {
  test("every visible control in the Como foi sheet is at least 16px", async ({ page }) => {
    await openAuthedWith(page, [TODO, ...LINK_ROWS]);
    await markTodoDone(page);
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await sheet.getByRole("button", { name: "Adicionar lição" }).click();
    const sizes = await controlFontSizes(sheet);
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    for (const c of sizes) expect(c.size, c.id).toBeGreaterThanOrEqual(16);
  });

  test("every visible control in the Plano do passeio sheet is at least 16px", async ({ page }) => {
    const PLANNED = {
      ...TODO,
      plan_items: [{ text: "Comprar ingressos", list: "checklist", done: false }],
    };
    await openAuthedWith(page, [PLANNED, ...LINK_ROWS]);
    await page
      .locator(".feed-card", { hasText: "Lugar Para Fazer" })
      .locator(".feed-card__open")
      .click();
    await page.locator(".links-detail").getByRole("button", { name: "Editar plano" }).click();
    const sheet = page.getByRole("dialog", { name: "Plano do passeio" });
    await sheet.getByRole("button", { name: "Adicionar item a lanches e compras" }).click();
    const sizes = await controlFontSizes(sheet);
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    for (const c of sizes) expect(c.size, c.id).toBeGreaterThanOrEqual(16);
  });

  test("every visible control in the add form is at least 16px", async ({ page }) => {
    await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const form = page.getByRole("dialog", { name: "Nova experiência" });
    await expect(form).toBeVisible();
    const sizes = await controlFontSizes(form);
    expect(sizes.length).toBeGreaterThanOrEqual(2);
    for (const c of sizes) expect(c.size, c.id).toBeGreaterThanOrEqual(16);
  });

  test("the done-list controls are at least 16px", async ({ page }) => {
    await openAuthedWith(page, [DONE, ...LINK_ROWS]);
    await goToDone(page);
    const sizes = await controlFontSizes(page.locator("body"));
    for (const c of sizes) expect(c.size, c.id).toBeGreaterThanOrEqual(16);
  });

  test("the viewport still allows user zoom", async ({ page }) => {
    await openAuthedWith(page, LINK_ROWS);
    const content = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)/);
    expect(content).not.toMatch(/maximum-scale/);
  });
});

test.describe("Como foi opens at the top", () => {
  async function expectAtTop(page: Page): Promise<void> {
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Como foi" })).toBeInViewport();
    const tops = await sheet.evaluate((el) => ({
      dialog: el.scrollTop,
      form: el.querySelector("form")!.scrollTop,
    }));
    expect(tops).toEqual({ dialog: 0, form: 0 });
    // No text field grabbed focus (that would raise the keyboard on a phone).
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(["INPUT", "TEXTAREA", "SELECT"]).not.toContain(focusedTag);
  }

  test("mark as done opens at the top", async ({ page }) => {
    await openAuthedWith(page, [TODO, ...LINK_ROWS]);
    await markTodoDone(page);
    await expectAtTop(page);
  });

  test("edit from the detail opens at the top even after a previous scroll", async ({ page }) => {
    await openAuthedWith(page, [DONE, ...LINK_ROWS]);
    await openEditFromDetail(page);
    await expectAtTop(page);
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await sheet.locator("form").evaluate((f) => (f.scrollTop = f.scrollHeight));
    await sheet.getByRole("button", { name: "Cancelar" }).click();
    await expect(sheet).toBeHidden();
    await page.locator(".links-detail").getByRole("button", { name: "Editar Como foi" }).click();
    await expectAtTop(page);
  });
});
