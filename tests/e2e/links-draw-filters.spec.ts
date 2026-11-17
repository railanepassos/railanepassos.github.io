import { test, expect, type Page } from "@playwright/test";
import { openAuthedWith } from "./helpers/authed";

/** "Sortear" sheet: filters narrow the draw; the drawn item is always inside (fake data only). */

function row(n: number, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-0000000000d${n}`,
    url: `https://example.com/sorteio-${n}`,
    label: `Lugar ${n}`,
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "passeio",
    extra_categories: [],
    sort_order: n,
    scheduled_start: null,
    scheduled_end: null,
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    created_at: "2026-11-12T12:00:00Z",
    ...extra,
  };
}

const ROWS = [
  row(1, { city: "Recife", cost_text: "R$ 10", tags: ["praia"], duration: "rapido" }),
  row(2, { city: "Olinda", cost_text: "R$ 200", tags: ["praia"], duration: "dia-inteiro" }),
  row(3, { city: "São Paulo", cost_text: "Grátis", tags: [], duration: null }),
];

async function openSheet(page: Page) {
  await page.getByRole("button", { name: "Sortear experiência" }).first().click();
  const sheet = page.locator(".links-draw-filter-sheet");
  await expect(sheet.getByRole("dialog", { name: "Sortear" })).toBeVisible();
  return sheet;
}

test.describe("draw filters", () => {
  test("live count, clear, disabled at zero", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    const sheet = await openSheet(page);
    const status = sheet.getByRole("status");
    await expect(status).toHaveText("3 lugares no sorteio");

    await sheet.getByLabel("Custo até R$").fill("20");
    await expect(status).toHaveText("2 lugares no sorteio");

    await sheet.getByLabel("Cidade").selectOption("Olinda");
    await expect(status).toHaveText("0 lugares no sorteio");
    await expect(sheet.getByRole("button", { name: "Sortear", exact: true })).toBeDisabled();

    await sheet.getByRole("button", { name: "Limpar filtros" }).click();
    await expect(status).toHaveText("3 lugares no sorteio");
    await expect(sheet.getByRole("button", { name: "Sortear", exact: true })).toBeEnabled();
  });

  test("the drawn item is within the filters, which persist across openings", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    let sheet = await openSheet(page);
    await sheet.getByLabel("Cidade").selectOption("Recife");
    await sheet.getByRole("button", { name: "Sortear", exact: true }).click();

    const result = page.locator(".links-draw-sheet");
    await expect(result.locator(".links-draw-sheet__category")).toHaveText("Passeio", { timeout: 10_000 });
    await expect(result.locator(".links-draw-sheet__reel-item--winner")).toHaveText("Lugar 1");
    await result.getByRole("button", { name: "Ver" }).waitFor();
    await result.getByRole("button", { name: "Fechar sorteio" }).click({ position: { x: 5, y: 5 } });
    await expect(result).toBeHidden();

    sheet = await openSheet(page);
    await expect(sheet.getByLabel("Cidade")).toHaveValue("Recife");
    await expect(sheet.getByRole("status")).toHaveText("1 lugar no sorteio");
  });

  test("controls are touch friendly: 16px+ text, 48px+ targets", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    const sheet = await openSheet(page);
    for (const el of [
      sheet.getByLabel("Custo até R$"),
      sheet.getByLabel("Cidade"),
      sheet.getByLabel("Duração"),
      sheet.getByRole("button", { name: "Sortear", exact: true }),
      sheet.getByRole("button", { name: "Limpar filtros" }),
      sheet.getByRole("button", { name: "#praia" }),
    ]) {
      const m = await el.evaluate((n) => {
        const cs = getComputedStyle(n);
        return { h: n.getBoundingClientRect().height, fs: parseFloat(cs.fontSize) };
      });
      expect(m.h).toBeGreaterThanOrEqual(48);
      expect(m.fs).toBeGreaterThanOrEqual(16);
    }
  });
});
