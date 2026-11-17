import { test, expect, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAddForm, openAuthedWith } from "./helpers/authed";

/** Multiple categories per item: form chips, filters, counts, draw, detail (fake data only). */

const TRIP = {
  id: "00000000-0000-4000-8000-0000000000c1",
  url: "https://example.com/vila-modelo",
  label: "Vila Modelo",
  description: null,
  icon_preset: null,
  icon_url: null,
  category: "restaurante",
  extra_categories: ["praia", "passeio"],
  sort_order: 20,
  scheduled_start: null,
  scheduled_end: null,
  status: "wishlist",
  priority: 0,
  want_again: false,
  image_url: null,
  note: null,
  completed_at: null,
  created_at: "2026-11-12T12:00:00Z",
};

function filterScope(page: Page) {
  return isMobile(page) ? page.locator("#links-chips") : page.locator("#links-sidenav");
}

test.describe("multiple categories per item", () => {
  test("ticking 3 chips posts category (main) + extra_categories and marks the main", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await sheet.getByLabel("Link do post ou lugar").fill("https://example.com/novo-lugar");

    for (const c of ["restaurante", "praia", "passeio"]) {
      await sheet.locator(`[data-category="${c}"]`).click();
    }
    await expect(sheet.locator('[data-category="restaurante"]')).toHaveAttribute("data-main", "true");
    await expect(sheet.locator('[data-category="restaurante"]')).toContainText("principal");
    await expect(sheet.locator('[data-category="praia"]')).not.toHaveAttribute("data-main", "true");
    await expect(sheet.locator('[data-category="praia"]')).toHaveAttribute("aria-pressed", "true");

    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({
      category: "restaurante",
      extra_categories: ["praia", "passeio"],
    });
  });

  test("unticking the main promotes the next; Automática clears; the limit of 4 holds", async ({ page }) => {
    await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    const chip = (c: string) => sheet.locator(`[data-category="${c}"]`);

    await chip("restaurante").click();
    await chip("praia").click();
    await chip("restaurante").click();
    await expect(chip("praia")).toHaveAttribute("data-main", "true");
    await expect(chip("restaurante")).toHaveAttribute("aria-pressed", "false");

    await chip("museu").click();
    await chip("bar").click();
    await chip("evento").click();
    await expect(chip("trilha")).toBeDisabled();
    await expect(sheet.locator("#links-form-category-hint")).toContainText("4 de 4");

    await chip("").click();
    await expect(chip("")).toHaveAttribute("aria-pressed", "true");
    await expect(sheet.locator("[data-main]")).toHaveCount(0);
    await expect(chip("trilha")).toBeEnabled();
  });

  test("editing pre-ticks the stored categories and PATCH sends the new split", async ({ page }) => {
    const writes = await openAuthedWith(page, [TRIP, ...LINK_ROWS]);
    const card = page.locator(".feed-card", { hasText: "Vila Modelo" });
    await card.getByRole("button", { name: "Mais opções" }).click();
    await card.getByRole("menuitem", { name: "Editar" }).click();
    const sheet = page.getByRole("dialog", { name: "Editar experiência" });
    await expect(sheet.locator('[data-category="restaurante"]')).toHaveAttribute("data-main", "true");
    await expect(sheet.locator('[data-category="passeio"]')).toHaveAttribute("aria-pressed", "true");

    await sheet.locator('[data-category="restaurante"]').click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ category: "praia", extra_categories: ["passeio"] });
  });

  test("filtering by an extra category shows the item; counts include extras", async ({ page }) => {
    await openAuthedWith(page, [TRIP, ...LINK_ROWS]);
    const scope = filterScope(page);

    // LINK_ROWS has one beach item: the trip counts under "praia" as well.
    await expect(scope.locator('[data-category="passeio"]')).toContainText("1");
    await expect(scope.locator('[data-category="praia"]')).toContainText("2");

    await scope.locator('[data-category="passeio"]').click();
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card__title")).toHaveText("Vila Modelo");

    await scope.locator('[data-category="passeio"]').click();
    await scope.locator('[data-category="praia"]').click();
    await expect(page.locator(".feed-card")).toHaveCount(2);
  });

  test("the draw respects an extra-category filter", async ({ page }) => {
    await openAuthedWith(page, [TRIP, ...LINK_ROWS]);
    await filterScope(page).locator('[data-category="passeio"]').click();
    await page.getByRole("button", { name: "Sortear experiência" }).first().click();
    const sheet = page.locator(".links-draw-sheet");
    await expect(sheet.locator(".links-draw-sheet__empty")).toBeHidden();
    // The main category of the only candidate shows once the reel settles.
    await expect(sheet.locator(".links-draw-sheet__category")).toHaveText("Restaurante", {
      timeout: 10_000,
    });
  });

  test("the detail lists every category; the card keeps the main one only", async ({ page }) => {
    await openAuthedWith(page, [TRIP, ...LINK_ROWS]);
    const card = page.locator(".feed-card", { hasText: "Vila Modelo" });
    await expect(card.locator(".feed-card__media img")).toHaveAttribute("src", /restaurante\.jpg$/);

    await card.locator(".feed-card__open").click();
    const detail = page.locator(".links-detail");
    await expect(detail.locator(".links-detail__chip--category")).toHaveText([
      "Restaurante",
      "Praia",
      "Passeio",
    ]);
  });

  test("a single-category item is unchanged", async ({ page }) => {
    await openAuthedWith(page, LINK_ROWS);
    await page.locator(".feed-card__open", { hasText: "Museu de Arte Moderna" }).click();
    await expect(page.locator(".links-detail .links-detail__chip--category")).toHaveText(["Museu"]);
  });
});
