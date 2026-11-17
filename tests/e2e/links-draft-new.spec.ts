import { test, expect, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAuthedWith } from "./helpers/authed";

/** Phase 5: a new-item draft in #rascunho= opens "Nova experiência" pre-filled. Fake data only. */

function hashOf(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return "#rascunho=" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const DRAFT = {
  v: 1,
  kind: "novo",
  fields: {
    url: "https://example.com/lugar-rascunho",
    label: "Lugar Rascunho",
    description: "Descrição <b>fictícia</b>",
    source_url: "https://example.com/post-rascunho",
    category: "museu",
    tags: ["arte", "grátis"],
    people: ["Pessoa Teste"],
    cost_text: "Grátis",
    city: "Cidade Teste",
    address: "Rua Fictícia, 10",
    dossier: "História <img src=x onerror=window.__pwned=1>",
    itinerary: "Chegar cedo",
    image_url: "https://example.com/foto.jpg",
  },
};

const SHEET = "Nova experiência";

async function expectPrefilled(page: Page): Promise<void> {
  const sheet = page.getByRole("dialog", { name: SHEET });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Link do post ou lugar")).toHaveValue(DRAFT.fields.url);
  await expect(sheet.getByLabel(/^Nome do lugar/)).toHaveValue("Lugar Rascunho");
  await expect(sheet.getByLabel("Link do post original")).toHaveValue(DRAFT.fields.source_url);
  await expect(sheet.getByLabel("Cidade (opcional)")).toHaveValue("Cidade Teste");
  await expect(sheet.getByLabel("Endereço (opcional)")).toHaveValue("Rua Fictícia, 10");
  await expect(sheet.getByLabel("Custo (opcional)")).toHaveValue("Grátis");
  await expect(sheet.getByLabel("Dossiê (opcional)")).toHaveValue(DRAFT.fields.dossier);
  await expect(sheet.getByLabel("Roteiro (opcional)")).toHaveValue("Chegar cedo");
  await expect(sheet.locator("[data-category='museu']")).toHaveAttribute("aria-pressed", "true");
}

test.describe("Links app: new-item draft (#rascunho=)", () => {
  test("opens the form pre-filled; Salvar posts every field; text is never HTML", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS, { hash: hashOf(DRAFT) });
    await expectPrefilled(page);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await expect(page.locator("dialog img[src='x'], [role=dialog] img[src='x']")).toHaveCount(0);

    await page.getByRole("dialog", { name: SHEET }).getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({
      url: DRAFT.fields.url,
      label: "Lugar Rascunho",
      description: DRAFT.fields.description,
      source_url: DRAFT.fields.source_url,
      category: "museu",
      tags: ["arte", "grátis"],
      people: ["Pessoa Teste"],
      cost_text: "Grátis",
      city: "Cidade Teste",
      address: "Rua Fictícia, 10",
      dossier: DRAFT.fields.dossier,
      itinerary: "Chegar cedo",
      image_url: DRAFT.fields.image_url,
    });
  });

  test("the fragment leaves the URL as soon as the app reads it", async ({ page }) => {
    await openAuthedWith(page, LINK_ROWS, { hash: hashOf(DRAFT) });
    await expectPrefilled(page);
    expect(await page.evaluate(() => location.hash)).toBe("");
    expect(page.url()).not.toContain("rascunho");
  });

  test("Cancelar discards the draft: no write, and it does not come back", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS, { hash: hashOf(DRAFT) });
    const sheet = page.getByRole("dialog", { name: SHEET });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /Cancelar|Voltar|Fechar/ }).first().click();
    await expect(sheet).toBeHidden();
    await page.waitForTimeout(200);
    expect(writes.created).toBeNull();
    expect(writes.patched).toBeNull();
  });

  test("an invalid draft shows a clear message and opens nothing", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS, {
      hash: hashOf({ ...DRAFT, fields: { ...DRAFT.fields, url: "http://example.com/inseguro" } }),
    });
    await expect(page.getByRole("alert").filter({ hasText: "rascunho" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).toBe("");
    expect(writes.created).toBeNull();
  });

  test("broken base64 shows the message too", async ({ page }) => {
    await openAuthedWith(page, LINK_ROWS, { hash: "#rascunho=@@@" });
    await expect(page.getByRole("alert").filter({ hasText: "rascunho" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("logged out: the draft waits for the login, then the form opens with it", async ({ page }) => {
    await openAuthedWith(page, LINK_ROWS, { hash: hashOf(DRAFT), loggedOut: true });
    // fragment already read and cleared, form not open yet
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
    const login = page.getByRole("dialog", { name: /Entrar|Login/i });
    await expect(login).toBeVisible();
    await expect(page.getByRole("dialog", { name: SHEET })).toHaveCount(0);
    await login.getByLabel("Usuário").fill("tester");
    await login.getByLabel("Senha").fill("senha-de-teste");
    await login.getByRole("button", { name: /Entrar/ }).click();
    await expectPrefilled(page);
  });

  test("the draft image host gets no request on open; Carregar prévia loads it", async ({ page }) => {
    const hits: string[] = [];
    await page.route("https://draft-image.example.test/**", (route) => {
      hits.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>" });
    });
    await openAuthedWith(page, LINK_ROWS, {
      hash: hashOf({ v: 1, kind: "novo", fields: { url: "https://example.com/x", image_url: "https://draft-image.example.test/f.png" } }),
    });
    const sheet = page.getByRole("dialog", { name: SHEET });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400);
    expect(hits).toHaveLength(0);
    await sheet.getByRole("button", { name: "Carregar prévia" }).click();
    await expect.poll(() => hits.length).toBeGreaterThan(0);
  });

  test("draft with categories pre-fills the chips", async ({ page }) => {
    const { category: _drop, ...rest } = DRAFT.fields;
    const draft = { ...DRAFT, fields: { ...rest, categories: ["restaurante", "praia", "passeio"] } };
    const writes = await openAuthedWith(page, LINK_ROWS, { hash: hashOf(draft) });
    const sheet = page.getByRole("dialog", { name: SHEET });
    await expect(sheet).toBeVisible();
    for (const c of ["restaurante", "praia", "passeio"]) {
      await expect(sheet.locator(`[data-category="${c}"]`)).toHaveAttribute("aria-pressed", "true");
    }
    await expect(sheet.locator("[data-category='museu']")).toHaveAttribute("aria-pressed", "false");
    await expect(sheet.locator('[data-category="restaurante"]')).toHaveAttribute("data-main", "true");
    await expect(sheet.locator("[data-main]")).toHaveCount(1);

    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({
      category: "restaurante",
      extra_categories: ["praia", "passeio"],
    });
  });

  test("draft with sources pre-fills the Fontes editor and Salvar sends them", async ({ page }) => {
    const sources = [
      { title: "Guia da cidade", url: "https://example.com/guia" },
      { title: "<b>Notícia</b>", url: "https://example.com/noticia" },
    ];
    const writes = await openAuthedWith(page, LINK_ROWS, {
      hash: hashOf({ ...DRAFT, fields: { ...DRAFT.fields, sources } }),
    });
    const sheet = page.getByRole("dialog", { name: SHEET });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("Fonte 1: título")).toHaveValue("Guia da cidade");
    await expect(sheet.getByLabel("Fonte 1: link")).toHaveValue("https://example.com/guia");
    await expect(sheet.getByLabel("Fonte 2: título")).toHaveValue("<b>Notícia</b>");
    await expect(sheet.getByLabel("Fonte 3: título")).toHaveCount(0);

    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({ sources });
  });
});
