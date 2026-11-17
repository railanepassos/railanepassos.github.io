import { test, expect, type Page } from "@playwright/test";
import { SUPABASE, openAuthedWith } from "./helpers/authed";

/**
 * Phase 4.1 review: editor writes of the plan never overwrite what participants
 * ticked through the link (optimistic concurrency on updated_at), and both the
 * editor detail and the public page refresh when the page is visible again.
 * Fake data only.
 */

const TOKEN = "0123456789abcdef".repeat(4);
const PAGE = "/p/a8f3k2/";
const RPC = `${SUPABASE}/rest/v1/rpc/`;
const NOTICE =
  "O plano mudou (alguém atualizou pelo link). Recarregamos para você — confira e tente de novo.";

const ROW = {
  id: "00000000-0000-4000-8000-0000000000b1",
  url: "https://example.com/lugar-concorrencia",
  label: "Lugar Concorrencia",
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
  updated_at: "2026-11-17T10:00:00.000001+00:00",
  people: ["Alana", "Bia Teste"],
  plan_share_token: TOKEN,
  plan_items: [
    { text: "Comprar ingressos", list: "checklist", done: false },
    { text: "Biscoitos", list: "compras", done: false },
  ],
};

async function openDetail(page: Page) {
  await page.locator(".feed-card", { hasText: "Lugar Concorrencia" }).locator(".feed-card__open").click();
  const detail = page.locator(".links-detail");
  await expect(detail).toBeVisible();
  return detail;
}

const visible = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

test.describe("editor vs participants", () => {
  test("a tick on a stale plan reloads, warns, and keeps the participant's tick", async ({ page }) => {
    const row = { ...ROW };
    const writes = await openAuthedWith(page, [row]);
    const detail = await openDetail(page);
    const server = writes.rows[0]!;

    // A participant ticks "Biscoitos" through the link after the editor loaded the plan.
    server.plan_items = [ROW.plan_items[0], { ...ROW.plan_items[1]!, done: true }];
    server.updated_at = "2026-11-17T10:05:00.000002+00:00";

    // click(), not check(): check() would re-click the box the reload just unticked.
    await detail.getByRole("checkbox", { name: /Comprar ingressos/ }).click();

    await expect(detail.locator(".links-detail__plan-error")).toHaveText(NOTICE);
    await expect(detail.getByRole("checkbox", { name: /Biscoitos/ })).toBeChecked();
    await expect(detail.getByRole("checkbox", { name: /Comprar ingressos/ })).not.toBeChecked();
    // The rejected write changed nothing on the server.
    expect(server.plan_items).toEqual([ROW.plan_items[0], { ...ROW.plan_items[1]!, done: true }]);

    // Trying again on the fresh plan works and keeps the participant's tick.
    await detail.getByRole("checkbox", { name: /Comprar ingressos/ }).click();
    await expect.poll(() => (server.plan_items as Array<{ done: boolean }>)[0]!.done).toBe(true);
    expect((server.plan_items as Array<{ done: boolean }>)[1]!.done).toBe(true);
  });

  test("quick successive ticks each use the latest updated_at (no false conflict)", async ({ page }) => {
    const writes = await openAuthedWith(page, [{ ...ROW }]);
    const detail = await openDetail(page);
    await detail.getByRole("checkbox", { name: /Comprar ingressos/ }).check();
    await detail.getByRole("checkbox", { name: /Biscoitos/ }).check();
    await expect.poll(() => writes.allPatched.length).toBe(2);
    await expect(detail.getByRole("checkbox", { name: /Biscoitos/ })).toBeChecked();
    await expect(detail.getByRole("checkbox", { name: /Comprar ingressos/ })).toBeChecked();
    await expect(detail.locator(".links-detail__plan-error")).toBeHidden();
    const items = writes.rows[0]!.plan_items as Array<{ done: boolean }>;
    expect(items.map((i) => i.done)).toEqual([true, true]);
  });

  test("the plan sheet save on a stale plan reopens with the fresh plan and the notice", async ({ page }) => {
    const writes = await openAuthedWith(page, [{ ...ROW }]);
    const detail = await openDetail(page);
    await detail.getByRole("button", { name: "Editar plano" }).click();
    const sheet = page.getByRole("dialog", { name: "Plano do passeio" });
    await expect(sheet).toBeVisible();

    const server = writes.rows[0]!;
    server.plan_items = [ROW.plan_items[0], { ...ROW.plan_items[1]!, done: true }];
    server.updated_at = "2026-11-17T10:05:00.000002+00:00";

    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet).toContainText(NOTICE);
    expect(server.plan_items).toEqual([ROW.plan_items[0], { ...ROW.plan_items[1]!, done: true }]);
  });

  test("the open detail refreshes when the page becomes visible again", async ({ page }) => {
    const writes = await openAuthedWith(page, [{ ...ROW }]);
    const detail = await openDetail(page);
    await expect(detail.getByRole("checkbox", { name: /Biscoitos/ })).not.toBeChecked();

    const server = writes.rows[0]!;
    server.plan_items = [ROW.plan_items[0], { ...ROW.plan_items[1]!, done: true }];
    server.updated_at = "2026-11-17T10:05:00.000002+00:00";
    await visible(page);

    await expect(detail.getByRole("checkbox", { name: /Biscoitos/ })).toBeChecked();
  });
});

test.describe("public plan refresh", () => {
  test("refetches the plan when the page becomes visible again", async ({ page }) => {
    const plan = (done: boolean) => ({
      label: "Lugar Compartilhado",
      scheduled_start: null,
      scheduled_end: null,
      city: null,
      address: null,
      itinerary: null,
      people: ["Alana"],
      plan_items: [{ text: "Biscoitos", list: "compras", done }],
    });
    let current = plan(false);
    let gets = 0;
    await page.route(`${RPC}*`, async (route) => {
      gets += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current) });
    });
    await page.goto(`${PAGE}#plano=${TOKEN}`);
    const box = page.getByRole("checkbox", { name: "Biscoitos" });
    await expect(box).not.toBeChecked();

    current = plan(true);
    await visible(page);
    await expect(box).toBeChecked();
    expect(gets).toBe(2);
  });
});
