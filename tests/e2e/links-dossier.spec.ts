import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAddForm, openAuthedWith } from "./helpers/authed";

/** Phase 2: dossier and itinerary (fake data only). */

const DOSSIER = "Construído no século XIX.\nCuriosidade: tem um jardim secreto.\nNão perder: a sala azul.";
const ITINERARY = "09h chegada\n10h sala azul\n12h almoço";

const FULL = {
  id: "00000000-0000-4000-8000-0000000000b1",
  url: "https://example.com/lugar-dossie",
  label: "Lugar Com Dossiê",
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
  dossier: DOSSIER,
  itinerary: "<b>09h</b> chegada\n10h sala azul",
  created_at: "2026-11-10T12:00:00Z",
};

test.describe("dossier and itinerary", () => {
  test("detail shows both sections with line breaks, safely; legacy item hides them", async ({
    page,
  }) => {
    await openAuthedWith(page, [FULL, ...LINK_ROWS]);
    await page.locator(".feed-card", { hasText: "Lugar Com Dossiê" }).locator(".feed-card__open").click();
    const detail = page.locator(".links-detail");
    await expect(detail).toBeVisible();

    const dossier = detail.locator("[data-field='dossier']");
    await expect(dossier).toBeVisible();
    await expect(dossier).toContainText("Curiosidade: tem um jardim secreto.");
    // Line breaks preserved: the value renders on several visual lines.
    const value = dossier.locator(".links-detail__value");
    const lines = await value.evaluate((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      return Math.round(el.getBoundingClientRect().height / lh);
    });
    expect(lines).toBeGreaterThanOrEqual(3);

    // Markup in the text stays literal.
    const itinerary = detail.locator("[data-field='itinerary']");
    await expect(itinerary).toContainText("<b>09h</b> chegada");
    await expect(itinerary.locator("b")).toHaveCount(0);

    // No horizontal overflow of the section.
    const overflow = await dossier.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(overflow).toBe(false);

    await detail.getByRole("button", { name: /Voltar|Fechar/ }).first().click();
    await page.locator(".feed-card", { hasText: "Museu de Arte Moderna" }).locator(".feed-card__open").click();
    await expect(detail.locator("#links-view-title")).toHaveText("Museu de Arte Moderna");
    await expect(detail.locator("[data-field='dossier']")).toBeHidden();
    await expect(detail.locator("[data-field='itinerary']")).toBeHidden();
  });

  test("saves dossier and itinerary on create", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await sheet.getByLabel("Link do post ou lugar").fill("https://example.com/novo-dossie");
    await sheet.locator("details.links-admin-form__more").getByText("Mais detalhes").click();
    await sheet.getByLabel("Dossiê (opcional)").fill(DOSSIER);
    await sheet.getByLabel("Roteiro (opcional)").fill(ITINERARY);
    await sheet.getByRole("button", { name: "Salvar" }).click();

    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({ dossier: DOSSIER, itinerary: ITINERARY });
  });

  test("edits and clears dossier and itinerary", async ({ page }) => {
    const writes = await openAuthedWith(page, [FULL, ...LINK_ROWS]);
    const card = page.locator(".feed-card", { hasText: "Lugar Com Dossiê" });
    await card.getByRole("button", { name: "Mais opções" }).click();
    await card.getByRole("menuitem", { name: "Editar" }).click();

    const sheet = page.getByRole("dialog", { name: "Editar experiência" });
    await expect(sheet.locator("details.links-admin-form__more")).toHaveAttribute("open", "");
    const dossier = sheet.getByLabel("Dossiê (opcional)");
    await expect(dossier).toHaveValue(DOSSIER);
    // Opened section must have measured a real height (not collapsed to 0).
    expect((await dossier.boundingBox())?.height ?? 0).toBeGreaterThan(60);
    await dossier.fill("Novo dossiê\nsegunda linha");
    await sheet.getByLabel("Roteiro (opcional)").fill("");
    await sheet.getByRole("button", { name: "Salvar" }).click();

    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ dossier: "Novo dossiê\nsegunda linha", itinerary: null });
  });
});
