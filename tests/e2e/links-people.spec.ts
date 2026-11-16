import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAddForm, openAuthedWith } from "./helpers/authed";

/** Phase 2: people (@). Obviously fake names only (LGPD). */

function withPeople(id: string, label: string, people: string[], tags: string[] = []): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-0000000000${id}`,
    url: `https://example.com/${id}`,
    label,
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
    sort_order: 20,
    scheduled_start: null,
    scheduled_end: null,
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    people,
    tags,
    created_at: "2026-11-10T12:00:00Z",
  };
}

const ROWS = [
  withPeople("d1", "Lugar Com Pessoa Um", ["Maria Clara Teste", "Bia Ficticia"], ["praia"]),
  withPeople("d2", "Lugar Com Pessoa Dois", ["Bia Ficticia"], ["museu"]),
  ...LINK_ROWS,
];

test.describe("people", () => {
  test("tapping a person chip on a card filters the feed; the filter chip clears it", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    const total = await page.locator(".feed-card").count();

    await page
      .locator(".feed-card", { hasText: "Lugar Com Pessoa Um" })
      .getByRole("button", { name: "Filtrar por @Maria Clara Teste" })
      .click();
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card")).toContainText("Lugar Com Pessoa Um");
    await expect(page.locator(".links-tagfilter")).toBeVisible();

    await page.getByRole("button", { name: "Remover filtro @Maria Clara Teste" }).click();
    await expect(page.locator(".feed-card")).toHaveCount(total);
    await expect(page.locator(".links-tagfilter")).toHaveCount(0);
  });

  test("person and tag filters combine (AND) in the same strip", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await page
      .locator(".feed-card", { hasText: "Lugar Com Pessoa Dois" })
      .getByRole("button", { name: "Filtrar por @Bia Ficticia" })
      .click();
    await expect(page.locator(".feed-card")).toHaveCount(2);
    await page
      .locator(".feed-card", { hasText: "Lugar Com Pessoa Um" })
      .getByRole("button", { name: "Filtrar por #praia" })
      .click();
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".links-tagfilter__chip")).toHaveCount(2);
  });

  test("detail shows people and tapping one closes the detail and filters", async ({ page }) => {
    await openAuthedWith(page, ROWS);
    await page.locator(".feed-card", { hasText: "Lugar Com Pessoa Dois" }).locator(".feed-card__open").click();
    const detail = page.locator(".links-detail");
    await expect(detail.locator("[data-field='people']")).toBeVisible();
    await detail.getByRole("button", { name: "Filtrar por @Bia Ficticia" }).click();
    await expect(detail).toBeHidden();
    await expect(page.locator(".feed-card")).toHaveCount(2);
  });

  test("legacy items have no person chips", async ({ page }) => {
    await openAuthedWith(page, LINK_ROWS);
    await expect(page.locator(".feed-card__people")).toHaveCount(0);
  });

  test("form: autocomplete reuses a name, multi-word names stay one chip, and it saves", async ({ page }) => {
    const writes = await openAuthedWith(page, ROWS);
    await openAddForm(page);
    const dialog = page.getByRole("dialog", { name: "Nova experiência" });
    await dialog.getByLabel("Link do post ou lugar").fill("https://example.com/novo-lugar");
    await dialog.getByText("Mais detalhes").click();

    const people = dialog.getByLabel("Pessoas (opcional)");
    await people.fill("maria");
    await dialog.getByRole("button", { name: "@Maria Clara Teste", exact: true }).click();
    await people.fill("@ze teste");
    await people.press("Enter");
    await people.fill("MARIA CLARA TESTE");
    await people.press("Enter");
    await expect(dialog.locator(".chip-input__chip")).toHaveCount(2);

    await dialog.getByRole("button", { name: "Remover @ze teste" }).click();
    await people.fill("Outra Pessoa Ficticia");
    // pending text (not yet committed) must still be saved
    await dialog.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created?.people).toEqual(["Maria Clara Teste", "Outra Pessoa Ficticia"]);
  });
});
