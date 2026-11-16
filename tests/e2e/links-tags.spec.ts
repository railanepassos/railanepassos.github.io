import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAddForm, openAuthedWith } from "./helpers/authed";

/** Phase 2: free tags (fake data only). */

function tagged(id: string, label: string, tags: string[]): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-0000000000${id}`,
    url: `https://example.com/${id}`,
    label,
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
    sort_order: 20,
    scheduled_start: null,
    scheduled_end: null,
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    tags,
    created_at: "2026-11-10T12:00:00Z",
  };
}

const ROWS = [
  tagged("c1", "Lugar Marcado Um", ["praia", "grátis"]),
  tagged("c2", "Lugar Marcado Dois", ["museu"]),
  ...LINK_ROWS,
];

test.describe("tags", () => {
  test("tapping a tag chip on a card filters the feed; the filter chip clears it", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    const total = await page.locator(".feed-card").count();

    await page
      .locator(".feed-card", { hasText: "Lugar Marcado Um" })
      .getByRole("button", { name: "Filtrar por #grátis" })
      .click();
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card")).toContainText("Lugar Marcado Um");

    await page.getByRole("button", { name: "Remover filtro #grátis" }).click();
    await expect(page.locator(".feed-card")).toHaveCount(total);
    await expect(page.locator(".links-tagfilter")).toHaveCount(0);
  });

  test("detail shows tags and tapping one closes the detail and filters", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await page.locator(".feed-card", { hasText: "Lugar Marcado Dois" }).locator(".feed-card__open").click();
    const detail = page.locator(".links-detail");
    await expect(detail.locator("[data-field='tags']")).toBeVisible();
    await detail.getByRole("button", { name: "Filtrar por #museu" }).click();
    await expect(detail).toBeHidden();
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card")).toContainText("Lugar Marcado Dois");
  });

  test("legacy items have no tag chips", async ({ page }) => {
    await openAuthedWith(page, LINK_ROWS);
    await expect(page.locator(".feed-card__tags")).toHaveCount(0);
  });

  test("form: autocomplete reuses an existing tag, case and accent variants collapse, and it saves", async ({
    page,
  }) => {
    const writes = await openAuthedWith(page, ROWS);
    await openAddForm(page);
    const dialog = page.getByRole("dialog", { name: "Nova experiência" });
    await dialog.getByLabel("Link do post ou lugar").fill("https://example.com/novo-lugar");
    await dialog.getByText("Mais detalhes").click();

    const tags = dialog.getByLabel("Tags (opcional)");
    await tags.fill("gra");
    await dialog.getByRole("button", { name: "#grátis", exact: true }).click();
    await tags.fill("#GRATIS");
    await tags.press("Enter");
    await tags.fill("#Mar");
    await tags.press("Enter");
    await expect(dialog.locator(".chip-input__chip")).toHaveCount(2);

    // Remove and re-add to prove removal works.
    await dialog.getByRole("button", { name: "Remover #mar" }).click();
    await expect(dialog.locator(".chip-input__chip")).toHaveCount(1);
    await tags.fill("Vista");
    // pending text (not yet committed) must still be saved
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created?.tags).toEqual(["grátis", "vista"]);
  });
});
