import { test, expect, type Page } from "@playwright/test";
import { openAuthedWith } from "./helpers/authed";

/** Phase 5: an update draft (#rascunho=, kind "atualizacao") for an existing item. Fake data only. */

function hashOf(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return "#rascunho=" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const ID = "00000000-0000-4000-8000-0000000000f1";
const ITEM = {
  id: ID,
  url: "https://example.com/lugar-atualizacao",
  label: "Lugar Atualização",
  description: "Descrição atual",
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
  updated_at: "2026-11-10T12:00:00.000001+00:00",
  city: "Cidade Atual",
  people: ["Alana"],
  plan_items: [
    { text: "Meu item", list: "checklist", who: "Alana", done: true },
    { text: "Biscoitos", list: "compras", done: false },
  ],
};

const FIELDS = { dossier: "História <b>proposta</b>", city: "Cidade Proposta" };
const PLAN = [
  { text: "biscoitos", list: "compras" },
  { text: "Água", list: "compras" },
  { text: "Levar casaco", list: "checklist" },
];

const FORM = "Editar experiência";
const SHEET = "Plano do passeio";

async function itemTexts(page: Page): Promise<string[]> {
  const sheet = page.getByRole("dialog", { name: SHEET });
  return sheet.locator("input[aria-label^='Item ']").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

test.describe("Links app: update draft (#rascunho=)", () => {
  test("fields: edit form shows the proposed values over the current ones; Salvar PATCHes them", async ({ page }) => {
    const writes = await openAuthedWith(page, [ITEM], {
      hash: hashOf({ v: 1, kind: "atualizacao", id: ID, fields: FIELDS }),
    });
    const form = page.getByRole("dialog", { name: FORM });
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Cidade (opcional)")).toHaveValue("Cidade Proposta");
    await expect(form.getByLabel("Dossiê (opcional)")).toHaveValue(FIELDS.dossier);
    await expect(form.getByLabel(/^Nome do lugar/)).toHaveValue("Lugar Atualização");
    expect(await page.evaluate(() => location.hash)).toBe("");
    expect(writes.patched).toBeNull();

    await form.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ city: "Cidade Proposta", dossier: FIELDS.dossier });
    await expect(form).toBeHidden();
    await expect(page.getByRole("dialog", { name: SHEET })).toHaveCount(0);
  });

  test("only plan: the sheet opens with the items appended; Salvar PATCHes plan_items conditioned on updated_at", async ({ page }) => {
    const writes = await openAuthedWith(page, [ITEM], {
      hash: hashOf({ v: 1, kind: "atualizacao", id: ID, plan: PLAN }),
    });
    await expect(page.getByRole("dialog", { name: FORM })).toHaveCount(0);
    const sheet = page.getByRole("dialog", { name: SHEET });
    await expect(sheet).toBeVisible();
    expect(await itemTexts(page)).toEqual(["Meu item", "Levar casaco", "Biscoitos", "Água"]);
    expect(writes.patched).toBeNull();

    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    const items = (writes.patched as { plan_items: Array<{ text: string }> }).plan_items;
    expect(items.map((i) => i.text)).toEqual(["Meu item", "Levar casaco", "Biscoitos", "Água"]);
    expect(items[0]).toMatchObject({ text: "Meu item", who: "Alana", done: true });
  });

  test("only plan: Cancelar saves nothing", async ({ page }) => {
    const writes = await openAuthedWith(page, [ITEM], {
      hash: hashOf({ v: 1, kind: "atualizacao", id: ID, plan: PLAN }),
    });
    const sheet = page.getByRole("dialog", { name: SHEET });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /Cancelar|Voltar|Fechar/ }).first().click();
    await expect(sheet).toBeHidden();
    await page.waitForTimeout(200);
    expect(writes.patched).toBeNull();
  });

  test("fields + plan: the form opens first, then the sheet after Salvar", async ({ page }) => {
    const writes = await openAuthedWith(page, [ITEM], {
      hash: hashOf({ v: 1, kind: "atualizacao", id: ID, fields: FIELDS, plan: PLAN }),
    });
    const form = page.getByRole("dialog", { name: FORM });
    await expect(form).toBeVisible();
    await expect(page.getByRole("dialog", { name: SHEET })).toHaveCount(0);

    await form.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.allPatched.length).toBe(1);
    const sheet = page.getByRole("dialog", { name: SHEET });
    await expect(sheet).toBeVisible();
    expect(await itemTexts(page)).toEqual(["Meu item", "Levar casaco", "Biscoitos", "Água"]);

    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.allPatched.length).toBe(2);
    expect(writes.allPatched[1]).toHaveProperty("plan_items");
  });

  test("fields + plan: cancelling the form saves nothing and does not open the sheet", async ({ page }) => {
    const writes = await openAuthedWith(page, [ITEM], {
      hash: hashOf({ v: 1, kind: "atualizacao", id: ID, fields: FIELDS, plan: PLAN }),
    });
    const form = page.getByRole("dialog", { name: FORM });
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: /Cancelar|Voltar|Fechar/ }).first().click();
    await expect(form).toBeHidden();
    await page.waitForTimeout(200);
    await expect(page.getByRole("dialog", { name: SHEET })).toHaveCount(0);
    expect(writes.allPatched).toHaveLength(0);
  });

  test("fields + plan: cancelling the sheet keeps the saved fields and saves no plan", async ({ page }) => {
    const writes = await openAuthedWith(page, [ITEM], {
      hash: hashOf({ v: 1, kind: "atualizacao", id: ID, fields: FIELDS, plan: PLAN }),
    });
    await page.getByRole("dialog", { name: FORM }).getByRole("button", { name: "Salvar" }).click();
    const sheet = page.getByRole("dialog", { name: SHEET });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /Cancelar|Voltar|Fechar/ }).first().click();
    await expect(sheet).toBeHidden();
    await page.waitForTimeout(200);
    expect(writes.allPatched).toHaveLength(1);
    expect(writes.allPatched[0]).not.toHaveProperty("plan_items");
  });

  test("unknown id: clear message, nothing opens", async ({ page }) => {
    const writes = await openAuthedWith(page, [ITEM], {
      hash: hashOf({ v: 1, kind: "atualizacao", id: "00000000-0000-4000-8000-0000000000ff", fields: FIELDS, plan: PLAN }),
    });
    await expect(page.getByRole("alert").filter({ hasText: "rascunho" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(writes.patched).toBeNull();
  });

  test("logged out: the update draft waits for the login", async ({ page }) => {
    await openAuthedWith(page, [ITEM], {
      hash: hashOf({ v: 1, kind: "atualizacao", id: ID, fields: FIELDS }),
      loggedOut: true,
    });
    const login = page.getByRole("dialog", { name: /Entrar|Login/i });
    await expect(login).toBeVisible();
    await login.getByLabel("Usuário").fill("tester");
    await login.getByLabel("Senha").fill("senha-de-teste");
    await login.getByRole("button", { name: /Entrar/ }).click();
    await expect(page.getByRole("dialog", { name: FORM }).getByLabel("Cidade (opcional)")).toHaveValue("Cidade Proposta");
  });
});
