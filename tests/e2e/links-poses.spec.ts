import { test, expect } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { openAddForm, openAuthedWith } from "./helpers/authed";

/** Phase 2: photo pose references (fake data only). */

const WITH_POSES = {
  id: "00000000-0000-4000-8000-0000000000c1",
  url: "https://example.com/lugar-com-poses",
  label: "Lugar Com Poses",
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
  pose_refs: [
    { url: "https://example.com/pose/1", note: "de costas" },
    { note: "sentada na escada" },
  ],
  created_at: "2026-11-10T12:00:00Z",
};

test.describe("pose references", () => {
  test("detail lists poses in order with new-tab links; hidden when empty", async ({ page }) => {
    await openAuthedWith(page, [WITH_POSES, ...LINK_ROWS]);

    await page.locator(".feed-card", { hasText: "Lugar Com Poses" }).locator(".feed-card__open").click();
    const detail = page.locator(".links-detail");
    const poses = detail.locator("[data-field='pose_refs'] li");
    await expect(poses).toHaveCount(2);
    await expect(poses.nth(0)).toContainText("de costas");
    await expect(poses.nth(1)).toContainText("sentada na escada");
    const link = poses.nth(0).getByRole("link");
    await expect(link).toHaveAttribute("href", "https://example.com/pose/1");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);

    await detail.getByRole("button", { name: /Voltar|Fechar/ }).first().click();
    await page.locator(".feed-card", { hasText: "Museu de Arte Moderna" }).locator(".feed-card__open").click();
    await expect(detail.locator("#links-view-title")).toHaveText("Museu de Arte Moderna");
    await expect(detail.locator("[data-field='pose_refs']")).toBeHidden();
  });

  test("form adds, reorders and removes poses, rejects http inline, then saves", async ({ page }) => {
    const writes = await openAuthedWith(page, LINK_ROWS);
    await openAddForm(page);
    const sheet = page.getByRole("dialog", { name: "Nova experiência" });
    await sheet.getByLabel("Link do post ou lugar").fill("https://example.com/novo-lugar");
    await sheet.locator("details.links-admin-form__more").getByText("Mais detalhes").click();

    const add = sheet.getByRole("button", { name: "Adicionar pose" });
    await add.click();
    await add.click();
    await add.click();
    await sheet.getByLabel("Pose 1: nota").fill("A");
    await sheet.getByLabel("Pose 2: nota").fill("B");
    await sheet.getByLabel("Pose 3: nota").fill("C");
    await sheet.getByRole("button", { name: "Descer pose 1" }).click();
    await sheet.getByRole("button", { name: "Remover pose 3" }).click();
    await expect(sheet.getByLabel("Pose 1: nota")).toHaveValue("B");
    await expect(sheet.getByLabel("Pose 2: nota")).toHaveValue("A");
    await expect(sheet.getByLabel("Pose 3: nota")).toHaveCount(0);

    const url = sheet.getByLabel("Pose 1: link");
    await url.fill("not a url");
    await expect(sheet.getByText("inválido")).toBeVisible();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await page.waitForTimeout(200);
    expect(writes.created).toBeNull();

    await url.fill("https://example.com/pose");
    await expect(sheet.getByText("inválido")).toBeHidden();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.created).not.toBeNull();
    expect(writes.created).toMatchObject({
      pose_refs: [{ url: "https://example.com/pose", note: "B" }, { note: "A" }],
    });
  });

  test("editing keeps stored poses and can clear them", async ({ page }) => {
    const writes = await openAuthedWith(page, [WITH_POSES, ...LINK_ROWS]);
    const card = page.locator(".feed-card", { hasText: "Lugar Com Poses" });
    await card.getByRole("button", { name: "Mais opções" }).click();
    await card.getByRole("menuitem", { name: "Editar" }).click();
    const sheet = page.getByRole("dialog", { name: "Editar experiência" });
    await expect(sheet.locator("details.links-admin-form__more")).toHaveAttribute("open", "");
    await expect(sheet.getByLabel("Pose 1: link")).toHaveValue("https://example.com/pose/1");
    await expect(sheet.getByLabel("Pose 2: nota")).toHaveValue("sentada na escada");
    await sheet.getByRole("button", { name: "Remover pose 2" }).click();
    await sheet.getByRole("button", { name: "Remover pose 1" }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ pose_refs: null });
  });
});
