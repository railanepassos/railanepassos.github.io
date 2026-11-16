import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAuthedWith } from "./helpers/authed";

/**
 * Authenticated UI with a mocked Supabase session. No real credentials or
 * data: the session is a fake JWT-shaped token and the rows come from
 * tests/fixtures/links-rows.ts. Every Supabase call is intercepted.
 */

const rows = LINK_ROWS;

const WISHLIST = rows.filter((r) => r.status !== "done").length;

test.describe("Links app — authenticated (mocked session)", () => {
  test.beforeEach(async ({ page }) => {
    await openAuthedWith(page, rows);
  });

  test("feed cards render with images", async ({ page }) => {
    const cards = page.locator("#links-list .feed-card");
    await expect(cards).toHaveCount(WISHLIST);
    const img = cards.first().locator(".feed-card__media img");
    await expect(img).toHaveAttribute("src", /\/assets\/img\/categories\/.+\.jpg$/);
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  test("shows a friendly title instead of a bare domain", async ({ page }) => {
    await expect(page.locator(".feed-card__title", { hasText: "Praia do Exemplo" })).toBeVisible();
    await expect(page.locator(".feed-card__title", { hasText: /^google\.com$/ })).toHaveCount(0);
  });

  test("bottom tab bar only on mobile", async ({ page }) => {
    const tabbar = page.locator("#links-tabbar");
    if (isMobile(page)) {
      await expect(tabbar).toBeVisible();
      await expect(tabbar.getByRole("button", { name: "Nova experiência" })).toBeVisible();
      await expect(page.locator("#links-sidenav")).toBeHidden();
    } else {
      await expect(tabbar).toBeHidden();
      await expect(page.locator("#links-sidenav")).toBeVisible();
    }
  });

  test("desktop grid uses more than one column", async ({ page }) => {
    test.skip(isMobile(page), "desktop only");
    const columns = await page
      .locator("#links-list")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBeGreaterThan(1);
  });

  test("no Excluir is visible on cards until the menu opens", async ({ page }) => {
    const card = page.locator(".feed-card").first();
    await expect(page.getByRole("button", { name: /Excluir/ })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Excluir" })).toHaveCount(0);

    await card.getByRole("button", { name: "Mais opções" }).click();
    await expect(card.getByRole("menuitem", { name: "Editar" })).toBeVisible();
    await expect(card.getByRole("menuitem", { name: "Excluir" })).toBeVisible();

    await card.getByRole("menuitem", { name: "Excluir" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toContainText("Excluir");
  });

  test("tapping a card opens the detail (full screen on mobile, side panel on desktop)", async ({
    page,
  }) => {
    await page.locator(".feed-card__open", { hasText: "Museu de Arte Moderna" }).click();
    const detail = page.locator(".links-detail");
    await expect(detail).toBeVisible();
    await expect(detail.locator("#links-view-title")).toHaveText("Museu de Arte Moderna");
    await expect(detail.getByRole("link", { name: /Ver link original/ })).toBeVisible();
    await expect(detail.locator(".links-detail__primary")).toHaveText("Reagendar");

    const box = await detail.locator(".links-detail__dialog").boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).not.toBeNull();
    if (isMobile(page)) {
      expect(Math.round(box!.width)).toBe(viewport.width);
    } else {
      expect(box!.width).toBeLessThan(viewport.width / 2);
      expect(box!.x).toBeGreaterThan(viewport.width / 2);
      // Grid stays visible and interactive beside the panel.
      await expect(page.locator(".feed-card").first()).toBeVisible();
      await expect(page.locator(".feed-card--selected")).toHaveCount(1);
    }

    // Title and action bar stay visible inside the panel without scrolling.
    const title = detail.locator("#links-view-title");
    const dialogBox = (await detail.locator(".links-detail__dialog").boundingBox())!;
    const titleBox = (await title.boundingBox())!;
    expect(titleBox.y).toBeGreaterThanOrEqual(dialogBox.y);
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height);
    if (!isMobile(page)) {
      const hero = (await detail.locator(".links-detail__hero").boundingBox())!;
      expect(hero.height).toBeLessThanOrEqual(241);
      const barBox = (await detail.locator(".links-detail__bar").boundingBox())!;
      expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height);
      expect(barBox.y).toBeGreaterThan(titleBox.y);
    }

    await detail.getByRole("button", { name: "Voltar" }).click();
    await expect(detail).toBeHidden();
  });

  test("category filter narrows the list", async ({ page }) => {
    const scope = isMobile(page) ? page.locator("#links-chips") : page.locator("#links-sidenav");
    await scope.locator('[data-category="praia"]').click();
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card__title")).toHaveText("Praia do Exemplo");
    await expect(scope.locator('[data-category="praia"]')).toHaveAttribute("aria-pressed", "true");

    await scope.locator('[data-category="praia"]').click();
    await expect(page.locator(".feed-card")).toHaveCount(WISHLIST);
  });

  test("search filters by text, accent-insensitive", async ({ page }) => {
    if (isMobile(page)) {
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
    }
    const input = page.getByRole("searchbox", { name: "Buscar experiências" });
    await expect(input).toBeVisible();
    await input.fill("ficticio");
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card__title")).toHaveText("Restaurante Fictício");
    await input.fill("");
    await expect(page.locator(".feed-card")).toHaveCount(WISHLIST);
  });

  test("Feitos section lists completed items", async ({ page }) => {
    const nav = isMobile(page) ? page.locator("#links-tabbar") : page.locator("#links-sidenav");
    await nav.locator('[data-section="done"]').click();
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card__title")).toHaveText("Café Amostra");
  });

  test("Deck opens from the tab bar or the sidebar", async ({ page }) => {
    if (isMobile(page)) {
      await page.locator("#links-tabbar").getByRole("button", { name: "Deck" }).click();
    } else {
      await page.locator('#links-sidenav [data-action="deck"]').click();
    }
    await expect(page.locator(".links-deck-screen")).toBeVisible();
    await expect(page.locator(".links-deck-screen__card")).toBeVisible();

    // Every action label fits inside the viewport (no clipping).
    const viewport = page.viewportSize()!;
    const captions = page.locator(".links-deck-screen__btn-caption");
    const n = await captions.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const b = (await captions.nth(i).boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(viewport.height);
    }
    const overflow = await page.locator(".links-deck-screen__dialog").evaluate(
      (el) => el.scrollHeight - el.clientHeight
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("add sheet offers one-tap category chips", async ({ page }) => {
    if (isMobile(page)) {
      await page.locator("#links-tabbar").getByRole("button", { name: "Nova experiência" }).click();
    } else {
      await page.locator(".links-appbar__add").click();
    }
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await expect(sheet).toBeVisible();
    await sheet.locator('[data-category="praia"]').click();
    await expect(sheet.locator('[data-category="praia"]')).toHaveAttribute("aria-pressed", "true");
  });
});
