import { test, expect, type Locator, type Page } from "@playwright/test";
import { LINK_ROWS } from "../fixtures/links-rows";
import { isMobile, openAuthedWith } from "./helpers/authed";

/** Phase 4: "Plano do passeio" sheet (participants, checklist, shopping list). Fake data only. */

const PLACE = {
  id: "00000000-0000-4000-8000-0000000000e1",
  url: "https://example.com/lugar-do-plano",
  label: "Lugar Do Plano",
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

const PLANNED = {
  ...PLACE,
  id: "00000000-0000-4000-8000-0000000000e2",
  url: "https://example.com/lugar-planejado",
  label: "Lugar Planejado",
  sort_order: 11,
  people: ["Alana", "Bia Teste"],
  plan_items: [
    { text: "Comprar ingressos", list: "checklist", who: "Alana", done: true },
    { text: "Protetor solar", list: "checklist", done: false },
    { text: "Biscoitos", list: "compras", who: "Bia Teste", done: false },
  ],
};

async function openDetail(page: Page, label: string): Promise<Locator> {
  await page.locator(".feed-card", { hasText: label }).locator(".feed-card__open").click();
  const detail = page.locator(".links-detail");
  await expect(detail).toBeVisible();
  return detail;
}

async function openSheet(page: Page, label: string): Promise<Locator> {
  const detail = await openDetail(page, label);
  await detail.getByRole("button", { name: "Editar plano" }).click();
  const sheet = page.getByRole("dialog", { name: "Plano do passeio" });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function controlFontSizes(root: Locator): Promise<Array<{ id: string; size: number }>> {
  return root.evaluate((el) =>
    Array.from(el.querySelectorAll<HTMLElement>("input, textarea, select"))
      .filter((c) => {
        const box = c.getBoundingClientRect();
        const type = (c as HTMLInputElement).type;
        return (
          box.width > 0 &&
          box.height > 0 &&
          getComputedStyle(c).visibility !== "hidden" &&
          type !== "checkbox" &&
          type !== "radio" &&
          type !== "hidden"
        );
      })
      .map((c) => ({
        id: c.id || c.className || c.tagName,
        size: parseFloat(getComputedStyle(c).fontSize),
      }))
  );
}

test.describe("Plano do passeio", () => {
  test("saves participants and both lists in one PATCH, Enter adds the next item", async ({ page }) => {
    const writes = await openAuthedWith(page, [PLACE, ...LINK_ROWS]);
    const sheet = await openSheet(page, "Lugar Do Plano");
    await expect(sheet).toContainText("Lugar Do Plano");

    await sheet.getByLabel("Participantes").fill("Alana");
    await sheet.getByLabel("Participantes").press("Enter");
    await sheet.getByLabel("Participantes").fill("Bia Teste");

    await sheet.getByRole("button", { name: "Adicionar item ao checklist" }).click();
    await page.keyboard.type("Comprar ingressos");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Protetor solar");
    await sheet.getByRole("button", { name: "Adicionar item a lanches e compras" }).click();
    await page.keyboard.type("Biscoitos");
    // Enter must add the next row, never submit the sheet.
    await page.keyboard.press("Enter");
    await expect(sheet).toBeVisible();
    expect(writes.patched).toBeNull();

    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet).toBeHidden();

    expect(writes.allPatched).toHaveLength(1);
    expect(writes.allPatched[0]).toEqual({
      people: ["Alana", "Bia Teste"],
      plan_items: [
        { text: "Comprar ingressos", list: "checklist", done: false },
        { text: "Protetor solar", list: "checklist", done: false },
        { text: "Biscoitos", list: "compras", done: false },
      ],
    });

    // The detail comes back with the plan, read-only.
    const detail = page.locator(".links-detail");
    await expect(detail).toBeVisible();
    await expect(detail.locator("[data-plan-list='checklist']")).toContainText("0 de 2");
    await expect(detail.locator("[data-plan-list='compras']")).toContainText("0 de 1");
  });

  test("keeps who and done of existing items when editing", async ({ page }) => {
    const writes = await openAuthedWith(page, [PLANNED, ...LINK_ROWS]);
    const sheet = await openSheet(page, "Lugar Planejado");
    await sheet.getByRole("button", { name: "Adicionar item ao checklist" }).click();
    await page.keyboard.type("Garrafa de água");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet).toBeHidden();

    expect(writes.allPatched[0]).toEqual({
      people: ["Alana", "Bia Teste"],
      plan_items: [
        { text: "Comprar ingressos", list: "checklist", who: "Alana", done: true },
        { text: "Protetor solar", list: "checklist", done: false },
        { text: "Garrafa de água", list: "checklist", done: false },
        { text: "Biscoitos", list: "compras", who: "Bia Teste", done: false },
      ],
    });
  });

  test("reorders and removes items", async ({ page }) => {
    const writes = await openAuthedWith(page, [PLANNED, ...LINK_ROWS]);
    const sheet = await openSheet(page, "Lugar Planejado");
    await sheet.getByRole("button", { name: "Descer item 1" }).click();
    await sheet.getByRole("button", { name: "Remover item 3" }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet).toBeHidden();
    expect(writes.allPatched[0]!.plan_items).toEqual([
      { text: "Protetor solar", list: "checklist", done: false },
      { text: "Comprar ingressos", list: "checklist", who: "Alana", done: true },
    ]);
  });

  test("Cancelar saves nothing and clearing every item stores null", async ({ page }) => {
    const writes = await openAuthedWith(page, [PLANNED, ...LINK_ROWS]);
    let sheet = await openSheet(page, "Lugar Planejado");
    await sheet.getByRole("button", { name: "Cancelar" }).click();
    await expect(sheet).toBeHidden();
    expect(writes.allPatched).toHaveLength(0);

    await page.locator(".links-detail").getByRole("button", { name: "Editar plano" }).click();
    sheet = page.getByRole("dialog", { name: "Plano do passeio" });
    for (let i = 0; i < 3; i++) {
      await sheet.getByRole("button", { name: "Remover item 1" }).first().click();
    }
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet).toBeHidden();
    expect(writes.allPatched[0]).toMatchObject({ plan_items: null });
  });

  test("detail shows the plan only when filled", async ({ page }) => {
    await openAuthedWith(page, [PLACE, PLANNED, ...LINK_ROWS]);
    let detail = await openDetail(page, "Lugar Do Plano");
    await expect(detail.locator("[data-field='plan']")).toBeHidden();
    await detail.getByRole("button", { name: "Voltar" }).click();

    detail = await openDetail(page, "Lugar Planejado");
    const plan = detail.locator("[data-field='plan']");
    await expect(plan).toBeVisible();
    await expect(plan.locator("[data-plan-list='checklist']")).toContainText("1 de 2");
    await expect(plan.locator("[data-plan-list='checklist']")).toContainText("Comprar ingressos");
    await expect(plan.locator("[data-plan-list='compras']")).toContainText("Biscoitos");
  });

  test("marking the place done does not touch the plan", async ({ page }) => {
    const writes = await openAuthedWith(page, [PLANNED, ...LINK_ROWS]);
    await page
      .locator(".feed-card", { hasText: "Lugar Planejado" })
      .getByRole("button", { name: "Marcar Lugar Planejado como feito" })
      .click();
    await expect.poll(() => writes.allPatched.length).toBeGreaterThan(0);
    expect(writes.allPatched[0]).toMatchObject({ status: "done" });
    expect(writes.allPatched[0]).not.toHaveProperty("plan_items");
    expect(writes.allPatched[0]).not.toHaveProperty("people");
  });

  test("free-text search matches plan item text", async ({ page }) => {
    await openAuthedWith(page, [PLACE, PLANNED, ...LINK_ROWS]);
    const input = page.getByRole("searchbox", { name: "Buscar experiências" });
    if (isMobile(page) && !(await input.isVisible())) {
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
    }
    await input.fill("protetor solar");
    await expect(page.locator(".feed-card")).toHaveCount(1);
    await expect(page.locator(".feed-card")).toContainText("Lugar Planejado");
  });

  test("suggests lessons from done places and a tap adds a saved checklist item", async ({ page }) => {
    const done = (id: string, label: string, lessons: string[], status = "done") => ({
      ...PLACE,
      id,
      url: `https://example.com/${id}`,
      label,
      status,
      completed_at: status === "done" ? "2026-10-30T12:00:00Z" : null,
      lessons,
    });
    const rows = [
      PLACE,
      done("00000000-0000-4000-8000-0000000000f1", "Feito Um", ["Levar lanche", "Chegar cedo"]),
      done("00000000-0000-4000-8000-0000000000f2", "Feito Dois", ["CHEGAR CEDO", "Levar água"]),
      done("00000000-0000-4000-8000-0000000000f3", "Desejo", ["Só desejo"], "wishlist"),
      ...LINK_ROWS,
    ];
    const writes = await openAuthedWith(page, rows);
    const sheet = await openSheet(page, "Lugar Do Plano");
    const chips = sheet.locator("[data-lesson-suggestion]");
    await expect(chips).toHaveText(["Chegar cedo", "Levar lanche", "Levar água"]);

    await chips.first().click();
    await expect(chips).toHaveText(["Levar lanche", "Levar água"]);
    await expect(sheet.locator("[data-plan-list='checklist'] .links-plan__text").first()).toHaveValue(
      "Chegar cedo"
    );
    const box = await chips.first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet).toBeHidden();
    expect(writes.allPatched[0]).toEqual({
      people: null,
      plan_items: [{ text: "Chegar cedo", list: "checklist", done: false }],
    });
  });

  test("hides the suggestions section when there are no lessons", async ({ page }) => {
    await openAuthedWith(page, [PLACE, ...LINK_ROWS]);
    const sheet = await openSheet(page, "Lugar Do Plano");
    await expect(sheet.locator("[data-lesson-suggestions]")).toBeHidden();
  });

  test("opens at the top and every control is at least 16px", async ({ page }) => {
    await openAuthedWith(page, [PLANNED, ...LINK_ROWS]);
    const sheet = await openSheet(page, "Lugar Planejado");
    const tops = await sheet.evaluate((el) => ({
      dialog: el.scrollTop,
      form: el.querySelector("form")!.scrollTop,
    }));
    expect(tops).toEqual({ dialog: 0, form: 0 });
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(["INPUT", "TEXTAREA", "SELECT"]).not.toContain(focusedTag);

    await sheet.getByRole("button", { name: "Adicionar item a lanches e compras" }).click();
    const sizes = await controlFontSizes(sheet);
    expect(sizes.length).toBeGreaterThanOrEqual(5);
    for (const c of sizes) expect(c.size, c.id).toBeGreaterThanOrEqual(16);
  });
});
