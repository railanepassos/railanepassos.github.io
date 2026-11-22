import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAddForm, openAuthedWith } from "./helpers/authed";

/** Phase 8: "Buscar imagem" (Wikipedia). The API and the thumbnails are intercepted: no real network. */

const THUMB = (n: number) =>
  `https://upload.wikimedia.org/wikipedia/commons/thumb/${n}/Fixture${n}.png/800px-Fixture${n}.png`;

// 1x1 transparent PNG
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);

const API_BODY = {
  query: {
    pages: {
      "10": { title: "Segunda", index: 2, thumbnail: { source: THUMB(2) } },
      "11": { title: "Primeira", index: 1, thumbnail: { source: THUMB(1) } },
    },
  },
};

test.describe("Buscar imagem", () => {
  test("new item: search, choose a thumbnail, save, the card shows that image", async ({ page }) => {
    let apiQuery: string | null = null;
    await page.route("https://pt.wikipedia.org/w/api.php*", async (route) => {
      apiQuery = new URL(route.request().url()).searchParams.get("gsrsearch");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(API_BODY),
      });
    });
    await page.route("https://upload.wikimedia.org/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PNG })
    );
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const dialog = page.getByRole("dialog", { name: "Nova experiência" });

    const search = dialog.getByRole("button", { name: "Buscar imagem" });
    await expect(search).toBeDisabled();
    await dialog.getByLabel("Link do post ou lugar").fill("https://example.com/imagem-fixture");
    await dialog.getByLabel("Nome do lugar ou experiência (opcional)").fill("Lugar Fixture Imagem");
    await expect(search).toBeEnabled();
    await search.click();

    const options = dialog.locator(".links-image-search__option");
    await expect(options).toHaveCount(2);
    expect(apiQuery).toBe("Lugar Fixture Imagem");
    await expect(options.first().locator("img")).toHaveAttribute("alt", "Primeira");
    await options.first().click();

    await expect(dialog.getByLabel("Foto (opcional) — link da imagem")).toHaveValue(THUMB(1));
    await expect(dialog.locator(".links-image-search__option")).toHaveCount(0);

    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created?.image_url).toBe(THUMB(1));
    await expect(
      page.locator(".feed-card", { hasText: "Lugar Fixture Imagem" }).locator(".feed-card__media img")
    ).toHaveAttribute("src", THUMB(1));
  });

  test("no result shows the notice and the form keeps working", async ({ page }) => {
    await page.route("https://pt.wikipedia.org/w/api.php*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ batchcomplete: "" }),
      })
    );
    await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const dialog = page.getByRole("dialog", { name: "Nova experiência" });
    await dialog.getByLabel("Nome do lugar ou experiência (opcional)").fill("Lugar Sem Foto");
    await dialog.getByRole("button", { name: "Buscar imagem" }).click();
    await expect(dialog.getByText("Nenhuma imagem encontrada")).toBeVisible();
    await dialog.getByLabel("Foto (opcional) — link da imagem").fill("https://example.com/manual.jpg");
    await expect(dialog.getByLabel("Foto (opcional) — link da imagem")).toHaveValue("https://example.com/manual.jpg");
  });
});
