import { test, expect, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAuthedWith } from "./helpers/authed";

/** Phase 3: ranking, minimum rating, "Voltaria" and the nota>=N token. Fake data only. */

function done(
  id: string,
  label: string,
  rating: number | null,
  completed: string,
  wantAgain = false
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
    want_again: wantAgain,
    image_url: null,
    note: null,
    completed_at: completed,
    created_at: "2026-11-10T12:00:00Z",
    rating,
  };
}

const ROWS = [
  done("r1", "Praia Sem Nota", null, "2026-12-20T10:00:00Z"),
  done("r2", "Museu Nota Tres", 3, "2026-12-18T10:00:00Z", true),
  done("r3", "Forte Nota Cinco Antigo", 5, "2026-12-01T10:00:00Z"),
  done("r4", "Cafe Nota Cinco Recente", 5, "2026-12-10T10:00:00Z", true),
  done("r5", "Mirante Nota Quatro", 4, "2026-12-15T10:00:00Z"),
  ...LINK_ROWS,
];

async function goToDone(page: Page): Promise<void> {
  const nav = isMobile(page) ? page.locator("#links-tabbar") : page.locator("#links-sidenav");
  await nav.locator('[data-section="done"]').click();
}

const titles = (page: Page): Promise<string[]> =>
  page.locator(".feed-card__title").allInnerTexts();

test.describe("Feitos ranking and filters", () => {
  test("ranking orders by rating, ties by most recent visit, unrated last", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await goToDone(page);
    // Default order is the most recent visit first.
    expect((await titles(page)).slice(0, 2)).toEqual(["Praia Sem Nota", "Museu Nota Tres"]);

    await page.getByRole("button", { name: "Ranking", exact: true }).click();
    expect((await titles(page)).slice(0, 5)).toEqual([
      "Cafe Nota Cinco Recente",
      "Forte Nota Cinco Antigo",
      "Mirante Nota Quatro",
      "Museu Nota Tres",
      "Praia Sem Nota",
    ]);
  });

  test("minimum rating select and Voltaria filter work together", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await goToDone(page);
    await page.getByRole("button", { name: "Ranking", exact: true }).click();

    await page.getByLabel("Nota mínima").selectOption("4");
    expect(await titles(page)).toEqual([
      "Cafe Nota Cinco Recente",
      "Forte Nota Cinco Antigo",
      "Mirante Nota Quatro",
    ]);
    // The select edits the same nota>=N token as typing.
    await expect(page.locator("#links-search-input")).toHaveValue("nota>=4");
    await expect(page.getByRole("button", { name: "Remover filtro nota ≥ 4" })).toBeVisible();

    await page.getByRole("button", { name: "Voltaria", exact: true }).click();
    expect(await titles(page)).toEqual(["Cafe Nota Cinco Recente"]);

    await page.getByLabel("Nota mínima").selectOption("");
    expect(await titles(page)).toEqual(["Cafe Nota Cinco Recente", "Museu Nota Tres"]);
  });

  test("nota>=4 token filters, shows a removable chip, ignores invalid N", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await goToDone(page);
    const input = page.locator("#links-search-input");
    if (isMobile(page) && !(await input.isVisible())) {
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
    }
    await input.fill("nota>=4");
    await expect(page.locator(".feed-card")).toHaveCount(3);
    await expect(page.locator(".links-tagfilter__chip")).toHaveCount(1);

    await page.getByRole("button", { name: "Remover filtro nota ≥ 4" }).click();
    const all = await page.locator(".feed-card").count();
    expect(all).toBeGreaterThanOrEqual(5);
    await expect(input).toHaveValue("");

    await input.fill("nota>=9");
    await expect(page.locator(".feed-card")).toHaveCount(all);
    await expect(page.locator(".links-tagfilter__chip")).toHaveCount(0);
  });
});
