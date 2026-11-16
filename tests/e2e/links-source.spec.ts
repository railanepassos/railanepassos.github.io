import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAddForm, openAuthedWith } from "./helpers/authed";

/** Phase 2: source post link (fake data only). */

const WITH_SOURCE = {
  id: "00000000-0000-4000-8000-0000000000b1",
  url: "https://example.com/lugar-com-post",
  label: "Lugar Com Post",
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
  source_url: "https://example.com/post/abc123",
  created_at: "2026-11-10T12:00:00Z",
};

test.describe("source post link", () => {
  test("detail opens the post in a new tab with noopener; hidden for items without one", async ({
    page,
  }) => {
    await openAuthedWith(page, [WITH_SOURCE, ...LINK_ROWS]);

    await page.locator(".feed-card", { hasText: "Lugar Com Post" }).locator(".feed-card__open").click();
    const detail = page.locator(".links-detail");
    await expect(detail).toBeVisible();
    const post = detail.getByRole("link", { name: "Ver post original" });
    await expect(post).toBeVisible();
    await expect(post).toHaveAttribute("href", "https://example.com/post/abc123");
    await expect(post).toHaveAttribute("target", "_blank");
    await expect(post).toHaveAttribute("rel", /noopener/);

    await detail.getByRole("button", { name: /Voltar|Fechar/ }).first().click();
    await page.locator(".feed-card", { hasText: "Museu de Arte Moderna" }).locator(".feed-card__open").click();
    await expect(detail.locator("#links-view-title")).toHaveText("Museu de Arte Moderna");
    await expect(detail.locator("[data-field='source_url']")).toBeHidden();
    await expect(detail.getByRole("link", { name: "Ver post original" })).toBeHidden();
  });

  test("form rejects a non-https link inline, then saves a valid one", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await sheet.getByLabel("Link do post ou lugar").fill("https://example.com/novo-lugar");
    await sheet.locator("details.links-admin-form__more").getByText("Mais detalhes").click();

    const source = sheet.getByLabel("Link do post original");
    await source.fill("http://example.com/post/1");
    await expect(sheet.getByText("precisa ser uma URL https válida")).toBeVisible();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await page.waitForTimeout(200);
    expect(writes.created).toBeNull();

    await source.fill("https://example.com/post/1");
    await expect(sheet.getByText("precisa ser uma URL https válida")).toBeHidden();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({
      url: "https://example.com/novo-lugar",
      source_url: "https://example.com/post/1",
    });
  });

  test("editing keeps the stored link and can clear it", async ({ page }) => {
    const writes = await openAuthedWith(page, [WITH_SOURCE, ...LINK_ROWS]);
    const card = page.locator(".feed-card", { hasText: "Lugar Com Post" });
    await card.getByRole("button", { name: "Mais opções" }).click();
    await card.getByRole("menuitem", { name: "Editar" }).click();
    const sheet = page.getByRole("dialog", { name: "Editar experiência" });
    await expect(sheet.locator("details.links-admin-form__more")).toHaveAttribute("open", "");
    const source = sheet.getByLabel("Link do post original");
    await expect(source).toHaveValue("https://example.com/post/abc123");
    await source.fill("");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ source_url: null });
  });
});
