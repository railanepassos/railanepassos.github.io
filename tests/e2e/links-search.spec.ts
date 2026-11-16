import { test, expect, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAuthedWith } from "./helpers/authed";

/** Phase 2: search syntax (#tag, @pessoa, cidade:, custo<). Fake data only (LGPD). */

function place(
  id: string,
  label: string,
  extra: Record<string, unknown>
): Record<string, unknown> {
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
    created_at: "2026-11-10T12:00:00Z",
    ...extra,
  };
}

const ROWS = [
  place("s1", "Casa do Recôncavo Fictício", {
    tags: ["praia"],
    people: ["Maria Clara Teste"],
    city: "Salvador",
    cost_text: "R$ 40",
  }),
  place("s2", "Forte de Teste", {
    tags: ["praia"],
    people: ["Bia Ficticia"],
    city: "Salvador",
    cost_text: "R$ 120",
  }),
  place("s3", "Mirante de Teste", {
    tags: ["museu"],
    people: ["Maria Clara Teste"],
    city: "Porto Seguro",
    cost_text: "grátis",
  }),
  place("s4", "Jardim Alfa de Teste", { people: ["Alana"] }),
  place("s5", "Jardim Beta de Teste", { people: ["Alana Souza"] }),
  ...LINK_ROWS,
];

async function search(page: Page, text: string): Promise<void> {
  const input = page.getByRole("searchbox", { name: "Buscar experiências" });
  if (isMobile(page) && !(await input.isVisible())) {
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
  }
  await input.fill(text);
}

const titles = (page: Page): Promise<string[]> =>
  page.locator(".feed-card__title").allInnerTexts();

test.describe("search syntax", () => {
  test("#tag @pessoa combine and show removable chips", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await search(page, '#praia @"maria clara teste"');
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card")).toContainText("Casa do Recôncavo Fictício");
    await expect(page.locator(".links-tagfilter__chip")).toHaveCount(2);

    await page.getByRole("button", { name: "Remover filtro @Maria Clara Teste" }).click();
    await expect(page.locator(".feed-card")).toHaveCount(2);
    await expect(page.getByRole("searchbox", { name: "Buscar experiências" })).toHaveValue("#praia");
  });

  test("@name is an exact match: tapping the Alana chip equals typing @alana", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await page
      .locator(".feed-card", { hasText: "Jardim Alfa de Teste" })
      .getByRole("button", { name: "Filtrar por @Alana" })
      .click();
    await expect(page.locator("#links-search-input")).toHaveValue("@Alana");
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card")).toContainText("Jardim Alfa de Teste");
    const tapped = await titles(page);

    await search(page, "@alana");
    expect(await titles(page)).toEqual(tapped);
  });

  test("free text, cidade: and custo< combine; accents and case are ignored", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await search(page, "RECONCAVO cidade:salvador custo<50");
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card")).toContainText("Casa do Recôncavo Fictício");

    await search(page, 'cidade:"porto seguro"');
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card")).toContainText("Mirante de Teste");

    // cost without a number never matches a cost filter
    await search(page, "mirante custo<500");
    await expect(page.locator(".feed-card")).toHaveCount(0);
  });

  test("tapping a chip equals typing the same filter, and the input follows", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await page
      .locator(".feed-card", { hasText: "Casa do Recôncavo Fictício" })
      .getByRole("button", { name: "Filtrar por @Maria Clara Teste" })
      .click();
    const tapped = await titles(page);
    expect(tapped).toHaveLength(2);
    await expect(page.locator("#links-search-input")).toHaveValue('@"Maria Clara Teste"');

    await search(page, '@"maria clara teste"');
    expect(await titles(page)).toEqual(tapped);

    await page.getByRole("button", { name: "Remover filtro @Maria Clara Teste" }).click();
    await expect(page.locator("#links-search-input")).toHaveValue("");
    await expect(page.locator(".links-tagfilter")).toHaveCount(0);
  });
});
