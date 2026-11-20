import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAuthedWith } from "./helpers/authed";

/** Draft queue (#79): one #rascunho= link with several new items, opened one by one. Fake data only. */

function hashOf(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return "#rascunho=" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const QUEUE = {
  v: 1,
  kind: "fila",
  items: [
    { url: "https://example.com/fila-1", label: "Lugar Fila Um" },
    { url: "https://example.com/fila-2", label: "Lugar Fila Dois" },
    { url: "https://example.com/fila-3", label: "Lugar Fila Três" },
  ],
};

test.describe("Links app: draft queue (#rascunho= kind fila)", () => {
  test("Salvar opens the next item, Voltar skips it, the last one ends the queue", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS, { hash: hashOf(QUEUE) });

    const first = page.getByRole("dialog", { name: "Nova experiência (1 de 3)" });
    await expect(first).toBeVisible();
    await expect(first.getByLabel(/^Nome do lugar/)).toHaveValue("Lugar Fila Um");
    await first.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created?.label).toBe("Lugar Fila Um");

    const second = page.getByRole("dialog", { name: "Nova experiência (2 de 3)" });
    await expect(second).toBeVisible();
    await expect(second.getByLabel(/^Nome do lugar/)).toHaveValue("Lugar Fila Dois");
    await second.getByRole("button", { name: /Cancelar|Voltar|Fechar/ }).first().click();

    const third = page.getByRole("dialog", { name: "Nova experiência (3 de 3)" });
    await expect(third).toBeVisible();
    await expect(third.getByLabel(/^Nome do lugar/)).toHaveValue("Lugar Fila Três");
    await third.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created?.label).toBe("Lugar Fila Três");

    await expect(page.getByRole("dialog", { name: /Nova experiência/ })).toBeHidden();
    await page.waitForTimeout(200);
    await expect(page.getByRole("dialog", { name: /Nova experiência/ })).toBeHidden();
  });

  test("a duplicate item: Ver item existente shows the card, closing it opens the next item", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS, {
      hash: hashOf({
        ...QUEUE,
        items: [{ url: "https://example.com/museu-de-arte-moderna/?utm=x", label: "Repetido" }, QUEUE.items[1]],
      }),
    });
    const first = page.getByRole("dialog", { name: "Nova experiência (1 de 2)" });
    await expect(first.getByText(/já está na lista como "Museu de Arte Moderna"/)).toBeVisible();
    await first.getByRole("button", { name: "Ver item existente" }).click();
    const detail = page.locator(".links-detail");
    await expect(detail).toBeVisible();
    await expect(page.getByRole("dialog", { name: /Nova experiência/ })).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(detail).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Nova experiência (2 de 2)" })).toBeVisible();
    expect(writes.created).toBeNull();
  });
});
