import { test, expect, type Locator, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAuthedWith } from "./helpers/authed";

/** Phase 4: "Enviar no WhatsApp" in the Plano section. Fake data only. */

const BASE = {
  id: "00000000-0000-4000-8000-0000000000f1",
  url: "https://example.com/lugar-whatsapp",
  label: "Lugar Whatsapp",
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

const PLANNED = {
  ...BASE,
  scheduled_start: "2026-12-05T09:00:00-03:00",
  scheduled_end: "2026-12-05T17:30:00-03:00",
  city: "Cidade Teste",
  people: ["Alana", "Bia Teste"],
  plan_items: [
    { text: "Comprar ingressos", list: "checklist", who: "Alana", done: true },
    { text: "Biscoitos", list: "compras", done: false },
  ],
};

const EXPECTED = [
  "Lugar Whatsapp",
  "5 dez 2026 · 09:00–17:30",
  "Cidade Teste",
  "",
  "Quem vai: Alana, Bia Teste",
  "",
  "Quem faz o quê",
  "Alana: ✓ Comprar ingressos",
  "",
  "Checklist",
  "✓ Comprar ingressos (Alana)",
  "",
  "Lanches e compras",
  "☐ Biscoitos",
].join("\n");

async function openDetail(page: Page, label: string): Promise<Locator> {
  await page.locator(".feed-card", { hasText: label }).locator(".feed-card__open").click();
  const detail = page.locator(".links-detail");
  await expect(detail).toBeVisible();
  return detail;
}

test.describe("Enviar plano no WhatsApp", () => {
  test("uses navigator.share with the message when available", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __shared: unknown[] }).__shared = [];
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: (data: unknown) => {
          (window as unknown as { __shared: unknown[] }).__shared.push(data);
          return Promise.resolve();
        },
      });
    });
    await openAuthedWith(page, [PLANNED, ...LINK_ROWS]);
    const detail = await openDetail(page, "Lugar Whatsapp");
    const button = detail.getByRole("button", { name: "Enviar no WhatsApp" });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared))
      .toEqual([{ text: EXPECTED }]);
  });

  test("falls back to window.open with the wa.me URL", async ({ page }) => {
    await page.addInitScript(() => {
      // Shadow the prototype's share so the page sees "no Web Share support".
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      (window as unknown as { __opened: unknown[][] }).__opened = [];
      window.open = ((...args: unknown[]) => {
        (window as unknown as { __opened: unknown[][] }).__opened.push(args);
        return null;
      }) as typeof window.open;
    });
    await openAuthedWith(page, [PLANNED, ...LINK_ROWS]);
    const detail = await openDetail(page, "Lugar Whatsapp");
    await detail.getByRole("button", { name: "Enviar no WhatsApp" }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __opened: unknown[][] }).__opened))
      .toEqual([[`https://wa.me/?text=${encodeURIComponent(EXPECTED)}`, "_blank", "noopener"]]);
  });

  test("button is hidden when the place has no plan and no participants", async ({ page }) => {
    await openAuthedWith(page, [BASE, ...LINK_ROWS]);
    const detail = await openDetail(page, "Lugar Whatsapp");
    await expect(detail.getByRole("button", { name: "Editar plano" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Enviar no WhatsApp" })).toBeHidden();
  });

  test("button shows with participants only", async ({ page }) => {
    await openAuthedWith(page, [{ ...BASE, people: ["Alana"] }, ...LINK_ROWS]);
    const detail = await openDetail(page, "Lugar Whatsapp");
    await expect(detail.getByRole("button", { name: "Enviar no WhatsApp" })).toBeVisible();
  });
});
