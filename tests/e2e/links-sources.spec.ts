import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAddForm, openAuthedWith } from "./helpers/authed";

/** Fontes: sources list on an item (fake data only). */

const WITH_SOURCES = {
  id: "00000000-0000-4000-8000-0000000000e1",
  url: "https://example.com/lugar-com-fontes",
  label: "Lugar Com Fontes",
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
  sources: [
    { title: "Guia da cidade", url: "https://example.com/guia" },
    { title: "<b>Notícia</b>", url: "https://example.com/noticia" },
  ],
  created_at: "2026-11-10T12:00:00Z",
};

test.describe("fontes", () => {
  test("detail lists safe new-tab links; hidden when empty", async ({ page }) => {
    await openAuthedWith(page, [WITH_SOURCES, ...LINK_ROWS]);
    await page.locator(".feed-card", { hasText: "Lugar Com Fontes" }).locator(".feed-card__open").click();
    const detail = page.locator(".links-detail");
    const items = detail.locator("[data-field='sources'] li");
    await expect(items).toHaveCount(2);
    const first = items.nth(0).getByRole("link");
    await expect(first).toHaveText("Guia da cidade");
    await expect(first).toHaveAttribute("href", "https://example.com/guia");
    await expect(first).toHaveAttribute("target", "_blank");
    await expect(first).toHaveAttribute("rel", "noopener noreferrer");
    await expect(items.nth(1)).toContainText("<b>Notícia</b>");
    await expect(items.nth(1).locator("b")).toHaveCount(0);
    if (isMobile(page)) {
      const box = await first.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }

    await detail.getByRole("button", { name: /Voltar|Fechar/ }).first().click();
    await page.locator(".feed-card", { hasText: "Museu de Arte Moderna" }).locator(".feed-card__open").click();
    await expect(detail.locator("#links-view-title")).toHaveText("Museu de Arte Moderna");
    await expect(detail.locator("[data-field='sources']")).toBeHidden();
  });

  test("form adds 2 sources, drops a blank row and sends them on POST", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await sheet.getByLabel("Link do post ou lugar").fill("https://example.com/novo-lugar");
    await sheet.locator("details.links-admin-form__more").getByText("Mais detalhes").click();
    await expect(sheet.getByText("Fontes (opcional)")).toBeVisible();

    const add = sheet.getByRole("button", { name: "Adicionar fonte" });
    await add.click();
    await add.click();
    await add.click();
    await sheet.getByLabel("Fonte 1: título").fill("Guia");
    await sheet.getByLabel("Fonte 1: link").fill("https://example.com/guia");
    await sheet.getByLabel("Fonte 2: título").fill("Notícia");
    await sheet.getByLabel("Fonte 2: link").fill("https://example.com/noticia");

    if (isMobile(page)) {
      for (const el of [
        sheet.getByLabel("Fonte 3: título"),
        sheet.getByLabel("Fonte 3: link"),
        add,
        sheet.getByRole("button", { name: "Remover fonte 3" }),
      ]) {
        const box = await el.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(48);
      }
      const sizes = await sheet
        .locator(".links-sources")
        .evaluate((el) =>
          Array.from(el.querySelectorAll("input, button")).map((c) => parseFloat(getComputedStyle(c).fontSize))
        );
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
    }

    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({
      sources: [
        { title: "Guia", url: "https://example.com/guia" },
        { title: "Notícia", url: "https://example.com/noticia" },
      ],
    });
  });

  test("a half-filled row blocks saving with an inline message", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await sheet.getByLabel("Link do post ou lugar").fill("https://example.com/novo-lugar");
    await sheet.locator("details.links-admin-form__more").getByText("Mais detalhes").click();
    await sheet.getByRole("button", { name: "Adicionar fonte" }).click();
    await sheet.getByLabel("Fonte 1: título").fill("Só título");
    await expect(sheet.locator(".links-sources")).toContainText("inválido");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await page.waitForTimeout(200);
    expect(writes.created).toBeNull();
  });

  test("editing keeps stored sources and PATCH sends the edited list", async ({ page }) => {
    const writes = await openAuthedWith(page, [WITH_SOURCES, ...LINK_ROWS]);
    const card = page.locator(".feed-card", { hasText: "Lugar Com Fontes" });
    await card.getByRole("button", { name: "Mais opções" }).click();
    await card.getByRole("menuitem", { name: "Editar" }).click();
    const sheet = page.getByRole("dialog", { name: "Editar experiência" });
    await expect(sheet.locator("details.links-admin-form__more")).toHaveAttribute("open", "");
    await expect(sheet.getByLabel("Fonte 1: título")).toHaveValue("Guia da cidade");
    await expect(sheet.getByLabel("Fonte 2: link")).toHaveValue("https://example.com/noticia");
    await sheet.getByRole("button", { name: "Remover fonte 2" }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({
      sources: [{ title: "Guia da cidade", url: "https://example.com/guia" }],
    });
  });
});
