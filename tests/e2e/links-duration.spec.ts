import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAddForm, openAuthedWith } from "./helpers/authed";

/** Duração: optional field on an item (fake data only). */

const ID = "00000000-0000-4000-8000-0000000000d1";
const WITH_DURATION = {
  id: ID,
  url: "https://example.com/lugar-com-duracao",
  label: "Lugar Com Duração",
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
  duration: "meio-periodo",
  created_at: "2026-11-10T12:00:00Z",
  updated_at: "2026-11-10T12:00:00.000001+00:00",
};

function hashOf(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return "#rascunho=" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test.describe("duração", () => {
  test("detail shows the label; hidden when the item has none", async ({ page }) => {
    await openAuthedWith(page, [WITH_DURATION, ...LINK_ROWS]);
    await page.locator(".feed-card", { hasText: "Lugar Com Duração" }).locator(".feed-card__open").click();
    const detail = page.locator(".links-detail");
    await expect(detail.locator("[data-field='duration']")).toContainText("Duração");
    await expect(detail.locator("[data-field='duration']")).toContainText("Meio período");

    await detail.getByRole("button", { name: /Voltar|Fechar/ }).first().click();
    await page.locator(".feed-card", { hasText: "Museu de Arte Moderna" }).locator(".feed-card__open").click();
    await expect(detail.locator("#links-view-title")).toHaveText("Museu de Arte Moderna");
    await expect(detail.locator("[data-field='duration']")).toBeHidden();
  });

  test("form select sends the chosen value on POST (and null when left empty)", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await sheet.getByLabel("Link do post ou lugar").fill("https://example.com/novo-lugar");
    await sheet.locator("details.links-admin-form__more").getByText("Mais detalhes").click();
    const select = sheet.getByLabel("Duração (opcional)");
    await expect(select).toHaveValue("");
    await expect(select.locator("option")).toHaveText([
      "Não informada",
      "Rápido (até 2h)",
      "Meio período",
      "Dia inteiro",
    ]);
    if (isMobile(page)) {
      const box = await select.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      const size = await select.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size).toBeGreaterThanOrEqual(16);
    }
    await select.selectOption({ label: "Rápido (até 2h)" });
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({ url: "https://example.com/novo-lugar", duration: "rapido" });
  });

  test("editing keeps the stored value and can clear it", async ({ page }) => {
    const writes = await openAuthedWith(page, [WITH_DURATION, ...LINK_ROWS]);
    const card = page.locator(".feed-card", { hasText: "Lugar Com Duração" });
    await card.getByRole("button", { name: "Mais opções" }).click();
    await card.getByRole("menuitem", { name: "Editar" }).click();
    const sheet = page.getByRole("dialog", { name: "Editar experiência" });
    await expect(sheet.locator("details.links-admin-form__more")).toHaveAttribute("open", "");
    const select = sheet.getByLabel("Duração (opcional)");
    await expect(select).toHaveValue("meio-periodo");
    await select.selectOption("");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ duration: null });
  });

  test("a new-item draft with fields.duration pre-fills the select", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS, {
      hash: hashOf({ v: 1, kind: "novo", fields: { url: "https://example.com/rascunho", duration: "dia-inteiro" } }),
    });
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await expect(sheet.getByLabel("Duração (opcional)")).toHaveValue("dia-inteiro");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({ duration: "dia-inteiro" });
  });

  test("an update draft proposes the duration over the current one", async ({ page }) => {
    const writes = await openAuthedWith(page, [WITH_DURATION], {
      hash: hashOf({ v: 1, kind: "atualizacao", id: ID, fields: { duration: "rapido" } }),
    });
    const form = page.getByRole("dialog", { name: "Editar experiência" });
    await expect(form.getByLabel("Duração (opcional)")).toHaveValue("rapido");
    expect(writes.patched).toBeNull();
    await form.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ duration: "rapido" });
  });
});
