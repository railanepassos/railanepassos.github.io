import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAddForm, openAuthedWith } from "./helpers/authed";

/** Phase 2 foundation: cost, city, address and the map link (fake data only). */

const FULL = {
  id: "00000000-0000-4000-8000-0000000000a1",
  url: "https://example.com/lugar-completo",
  label: "Lugar Completo",
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
  cost_text: "R$ 20 inteira · grátis às quartas",
  city: "Cidade Modelo",
  address: "Rua Exemplo, 100",
  created_at: "2026-11-10T12:00:00Z",
};

test.describe("cost, city and address", () => {
  test("full item shows meta on the card and a map link in the detail; legacy item stays plain", async ({
    page,
  }) => {
    await openAuthedWith(page, [FULL, ...LINK_ROWS]);

    const full = page.locator(".feed-card", { hasText: "Lugar Completo" });
    await expect(full.locator(".feed-card__meta")).toContainText("grátis às quartas");
    await expect(full.locator(".feed-card__meta")).toContainText("Cidade Modelo");

    const legacy = page.locator(".feed-card", { hasText: "Museu de Arte Moderna" });
    await expect(legacy.locator(".feed-card__meta-item--cost")).toHaveCount(0);
    await expect(legacy.locator(".feed-card__meta-item--city")).toHaveCount(0);

    // Full detail.
    await full.locator(".feed-card__open").click();
    const detail = page.locator(".links-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Rua Exemplo, 100");
    const map = detail.getByRole("link", { name: "Abrir no mapa" });
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Rua%20Exemplo%2C%20100%2C%20Cidade%20Modelo"
    );
    await expect(map).toHaveAttribute("target", "_blank");
    await expect(map).toHaveAttribute("rel", /noopener/);

    // Legacy detail: no empty sections, no map link.
    await detail.getByRole("button", { name: /Voltar|Fechar/ }).first().click();
    await legacy.locator(".feed-card__open").click();
    await expect(detail.locator("#links-view-title")).toHaveText("Museu de Arte Moderna");
    for (const key of ["cost_text", "city", "address", "map"]) {
      await expect(detail.locator(`[data-field='${key}']`)).toBeHidden();
    }
    await expect(detail.getByRole("link", { name: "Abrir no mapa" })).toBeHidden();
  });

  test("saves the new fields from Mais detalhes on create", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await sheet.getByLabel("Link do post ou lugar").fill("https://example.com/novo-lugar");

    const more = sheet.locator("details.links-admin-form__more");
    await expect(more).not.toHaveAttribute("open", "");
    await more.getByText("Mais detalhes").click();
    await sheet.getByLabel("Custo (opcional)").fill("grátis");
    await sheet.getByLabel("Cidade (opcional)").fill("Cidade Modelo");
    await sheet.getByLabel("Endereço (opcional)").fill("Av. Exemplo, 5");
    await sheet.getByRole("button", { name: "Salvar" }).click();

    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({
      url: "https://example.com/novo-lugar",
      cost_text: "grátis",
      city: "Cidade Modelo",
      address: "Av. Exemplo, 5",
    });
  });

  test("editing a full item opens Mais detalhes and saves changes", async ({ page }) => {
    const writes = await openAuthedWith(page, [FULL, ...LINK_ROWS]);
    const card = page.locator(".feed-card", { hasText: "Lugar Completo" });
    await card.getByRole("button", { name: "Mais opções" }).click();
    await card.getByRole("menuitem", { name: "Editar" }).click();

    const sheet = page.getByRole("dialog", { name: "Editar experiência" });
    await expect(sheet.locator("details.links-admin-form__more")).toHaveAttribute("open", "");
    const city = sheet.getByLabel("Cidade (opcional)");
    await expect(city).toHaveValue("Cidade Modelo");
    await city.fill("Outra Cidade");
    await sheet.getByLabel("Custo (opcional)").fill("");
    await sheet.getByRole("button", { name: "Salvar" }).click();

    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ city: "Outra Cidade", cost_text: null });
  });
});
