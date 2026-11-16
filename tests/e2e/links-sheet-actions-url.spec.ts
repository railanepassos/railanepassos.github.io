import { test, expect, type Locator, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAddForm, openAuthedWith } from "./helpers/authed";

/**
 * Sheet actions sit at the end of the form (not sticky), and every URL field
 * accepts addresses typed without https://. Fake data only.
 */

const TODO = {
  id: "00000000-0000-4000-8000-0000000000e1",
  url: "https://example.com/lugar-para-fazer",
  label: "Lugar Para Fazer",
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

async function markTodoDone(page: Page): Promise<void> {
  await page
    .locator(".feed-card", { hasText: "Lugar Para Fazer" })
    .getByRole("button", { name: "Marcar Lugar Para Fazer como feito" })
    .click();
}

/** The button and its whole ancestor chain: none may be sticky or fixed. */
async function expectInFlow(button: Locator): Promise<void> {
  const positions = await button.evaluate((el) => {
    const out: string[] = [];
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
      const position = getComputedStyle(n).position;
      // The dialog overlay itself is a fixed full-screen layer; only the
      // button's own box and the form/actions wrappers matter.
      if (n.classList.contains("links-admin-modal")) break;
      out.push(position);
    }
    return out;
  });
  expect(positions).not.toContain("sticky");
  expect(positions).not.toContain("fixed");
}

async function expectReachableAtEnd(button: Locator): Promise<void> {
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport({ ratio: 1 });
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test.describe("sheet actions are not sticky (mobile)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "phone layout only");
  });

  test("Como foi: Salvar and Pular are in the normal flow and reachable by scrolling", async ({
    page,
  }) => {
    await openAuthedWith(page, [TODO, ...LINK_ROWS]);
    await markTodoDone(page);
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    const save = sheet.getByRole("button", { name: "Salvar" });
    const skip = sheet.getByRole("button", { name: "Pular" });
    await expectInFlow(save);
    await expectInFlow(skip);
    await expectReachableAtEnd(save);
    await expectReachableAtEnd(skip);
    const box = await skip.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  });

  test("Como foi: at the top the actions do not cover the fields", async ({ page }) => {
    await openAuthedWith(page, [TODO, ...LINK_ROWS]);
    await markTodoDone(page);
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    await expect(sheet.getByRole("heading", { name: "Como foi" })).toBeInViewport();
    await expect(sheet.getByRole("button", { name: "Salvar" })).not.toBeInViewport();
  });

  test("add form: Salvar is in the normal flow and reachable by scrolling", async ({ page }) => {
    await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    const save = sheet.getByRole("button", { name: "Salvar" });
    await expectInFlow(save);
    await expectReachableAtEnd(save);
  });
});

test.describe("URL fields accept addresses without https://", () => {
  test("place url, image url and source url are saved as https", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    const url = sheet.getByLabel("Link do post ou lugar");
    await url.fill("example.com/teste");
    await sheet.getByLabel("Nome do lugar ou experiência (opcional)").click();
    await expect(url).toHaveValue("https://example.com/teste");

    await sheet.getByLabel("Foto (opcional) — link da imagem").fill("www.example.com/foto.jpg");
    await sheet.locator("details.links-admin-form__more").getByText("Mais detalhes").click();
    await sheet.getByLabel("Link do post original").fill("http://example.com/post/1");
    await expect(sheet.getByText("inválido")).toBeHidden();
    await sheet.getByRole("button", { name: "Salvar" }).click();

    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({
      url: "https://example.com/teste",
      image_url: "https://www.example.com/foto.jpg",
      source_url: "https://example.com/post/1",
    });
  });

  test("a value that cannot be fixed still shows the error and blocks saving", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await sheet.getByLabel("Link do post ou lugar").fill("https://example.com/ok");
    await sheet.locator("details.links-admin-form__more").getByText("Mais detalhes").click();
    await sheet.getByLabel("Link do post original").fill("javascript:alert(1)");
    await expect(sheet.getByText("inválido")).toBeVisible();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await page.waitForTimeout(200);
    expect(writes.created).toBeNull();
  });

  test("Como foi: memory link typed without https:// is shown and patched as https", async ({
    page,
  }) => {
    const writes = await openAuthedWith(page, [TODO, ...LINK_ROWS]);
    await markTodoDone(page);
    const sheet = page.getByRole("dialog", { name: "Como foi" });
    const memory = sheet.getByLabel("Link da memória");
    await memory.fill("example.com/teste");
    await sheet.getByLabel("Impressões").click();
    await expect(memory).toHaveValue("https://example.com/teste");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.allPatched.length).toBeGreaterThan(0);
    expect(writes.allPatched.at(-1)).toMatchObject({ memory_url: "https://example.com/teste" });
  });
});
