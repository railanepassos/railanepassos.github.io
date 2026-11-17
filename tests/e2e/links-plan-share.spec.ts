import { test, expect, type Page } from "@playwright/test";
import { PROJECT_REF, SUPABASE, openAuthedWith } from "./helpers/authed";

/** Phase 4.1: plan share link (editor block + public read-only view). Fake data only. */

const TOKEN = "0123456789abcdef".repeat(4);
const TOKEN2 = "fedcba9876543210".repeat(4);
const PAGE = "/p/a8f3k2/";
const RPC = `${SUPABASE}/rest/v1/rpc/`;

const ROW = {
  id: "00000000-0000-4000-8000-0000000000a1",
  url: "https://example.com/lugar-share",
  label: "Lugar Share",
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
  note: "nota privada",
  completed_at: null,
  created_at: "2026-11-10T12:00:00Z",
  people: ["Alana", "Bia Teste"],
  plan_items: [{ text: "Comprar ingressos", list: "checklist", done: false }],
};

const SHARED = {
  label: "Lugar Compartilhado",
  scheduled_start: "2026-12-05T09:00:00-03:00",
  scheduled_end: "2026-12-05T17:30:00-03:00",
  city: "Cidade Teste",
  address: "Rua Fictícia, 10",
  itinerary: "Chegar cedo",
  people: ["Alana", "Bia Teste"],
  plan_items: [
    { text: "Comprar ingressos", list: "checklist", who: "Alana", done: true },
    { text: "Biscoitos", list: "compras", done: false },
  ],
};

type Call = { name: string; body: Record<string, unknown>; headers: Record<string, string> };

/** Captures every rpc call; `handlers` answers by function name. */
async function mockRpc(
  page: Page,
  handlers: Record<string, () => unknown>
): Promise<Call[]> {
  const calls: Call[] = [];
  await page.route(`${RPC}*`, async (route) => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split("/").pop()!;
    calls.push({ name, body: request.postDataJSON() ?? {}, headers: request.headers() });
    const answer = handlers[name]?.() ?? null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(answer),
    });
  });
  return calls;
}

async function openEditorDetail(page: Page): Promise<void> {
  await page.locator(".feed-card", { hasText: "Lugar Share" }).locator(".feed-card__open").click();
  await expect(page.locator(".links-detail")).toBeVisible();
}

const block = (page: Page) => page.locator("[data-field='plan-link']");

test.describe("editor: Link do plano", () => {
  test("generates, copies, rotates and turns off the link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    let next = TOKEN;
    const calls = await mockRpc(page, {
      links_plan_share_enable: () => next,
      links_plan_share_disable: () => null,
    });
    await openAuthedWith(page, [ROW]);
    await openEditorDetail(page);

    await expect(block(page).getByText("Link do plano", { exact: true })).toBeVisible();
    await expect(block(page).getByRole("button", { name: "Copiar" })).toBeHidden();

    await block(page).getByRole("button", { name: "Gerar link" }).click();
    const url = `${new URL(page.url()).origin}${PAGE}#plano=${TOKEN}`;
    await expect(block(page).locator("input")).toHaveValue(url);
    expect(calls.map((c) => c.name)).toEqual(["links_plan_share_enable"]);
    expect(calls[0]!.body).toEqual({ link_id: ROW.id });

    await block(page).getByRole("button", { name: "Copiar" }).click();
    await expect(block(page).getByRole("status")).toHaveText(/Link copiado|Selecione o link e copie/);
    const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    if (copied !== "") expect(copied).toBe(url);

    // Trocar: declined -> nothing; accepted -> new token.
    page.once("dialog", (d) => void d.dismiss());
    await block(page).getByRole("button", { name: "Trocar link" }).click();
    expect(calls).toHaveLength(1);
    next = TOKEN2;
    page.once("dialog", (d) => void d.accept());
    await block(page).getByRole("button", { name: "Trocar link" }).click();
    await expect(block(page).locator("input")).toHaveValue(url.replace(TOKEN, TOKEN2));
    expect(calls.map((c) => c.name)).toEqual(["links_plan_share_enable", "links_plan_share_enable"]);

    // Desligar: declined -> nothing; accepted -> rpc + back to Gerar link.
    page.once("dialog", (d) => void d.dismiss());
    await block(page).getByRole("button", { name: "Desligar" }).click();
    expect(calls).toHaveLength(2);
    page.once("dialog", (d) => void d.accept());
    await block(page).getByRole("button", { name: "Desligar" }).click();
    await expect(block(page).getByRole("button", { name: "Gerar link" })).toBeVisible();
    expect(calls.at(-1)).toMatchObject({
      name: "links_plan_share_disable",
      body: { link_id: ROW.id },
    });
  });

  test("shows an already enabled link and its controls meet size rules", async ({ page }) => {
    await mockRpc(page, {});
    await openAuthedWith(page, [{ ...ROW, plan_share_token: TOKEN }]);
    await openEditorDetail(page);
    await expect(block(page).locator("input")).toHaveValue(new RegExp(`#plano=${TOKEN}$`));
    for (const name of ["Copiar", "Trocar link", "Desligar"]) {
      const box = await block(page).getByRole("button", { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      const size = await block(page)
        .getByRole("button", { name })
        .evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
      expect(size).toBeGreaterThanOrEqual(16);
    }
    const input = block(page).locator("input");
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await input.evaluate((n) => parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
  });
});

test.describe("public plan (#plano=<token>)", () => {
  /** Records any call that would mean auth or the table was touched. */
  async function watchForbidden(page: Page): Promise<string[]> {
    const touched: string[] = [];
    await page.route(`${SUPABASE}/auth/v1/**`, async (route) => {
      touched.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.route(`${SUPABASE}/rest/v1/links**`, async (route) => {
      touched.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    return touched;
  }

  test("shows the plan without a session, without login and without auth calls", async ({ page }) => {
    const touched = await watchForbidden(page);
    const calls = await mockRpc(page, { links_shared_plan_get: () => SHARED });
    await page.goto(`${PAGE}#plano=${TOKEN}`);

    await expect(page.getByRole("heading", { name: "Lugar Compartilhado" })).toBeVisible();
    const main = page.locator("#shared-plan-root");
    for (const text of [
      "Cidade Teste · Rua Fictícia, 10",
      "Chegar cedo",
      "Alana, Bia Teste",
      "Checklist · 1 de 1",
      "Comprar ingressos",
      "Lanches e compras · 0 de 1",
      "Biscoitos",
    ]) {
      await expect(main).toContainText(text);
    }
    await expect(page.getByRole("button", { name: /entrar|login/i })).toHaveCount(0);
    await expect(page.locator("input:not([type=checkbox])")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Comprar ingressos" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Biscoitos" })).not.toBeChecked();
    await expect(page.locator("#links-tabbar")).toBeHidden();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("links_shared_plan_get");
    expect(calls[0]!.body).toEqual({ token: TOKEN });
    expect(calls[0]!.headers.authorization).toBeUndefined();
    expect(calls[0]!.headers.apikey).toBeTruthy();
    expect(touched).toEqual([]);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.filter((k) => k.startsWith("sb-"))).toEqual([]);
  });

  test("ignores a stored editor session: no auth call, no Authorization header", async ({ page }) => {
    await page.addInitScript(
      ([key]) => {
        localStorage.setItem(
          key!,
          JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: 9999999999 })
        );
        localStorage.setItem("links-remember-me", "1");
      },
      [`sb-${PROJECT_REF}-auth-token`]
    );
    const touched = await watchForbidden(page);
    const calls = await mockRpc(page, { links_shared_plan_get: () => SHARED });
    await page.goto(`${PAGE}#plano=${TOKEN}`);
    await expect(page.getByRole("heading", { name: "Lugar Compartilhado" })).toBeVisible();
    expect(touched).toEqual([]);
    expect(calls[0]!.headers.authorization).toBeUndefined();
    await expect(page.locator(".feed-card")).toHaveCount(0);
  });

  test("an inactive token shows the message and no login", async ({ page }) => {
    const touched = await watchForbidden(page);
    await mockRpc(page, { links_shared_plan_get: () => null });
    await page.goto(`${PAGE}#plano=${TOKEN}`);
    await expect(page.getByText("Este link não está mais ativo")).toBeVisible();
    await expect(page.getByRole("button", { name: /entrar|login/i })).toHaveCount(0);
    expect(touched).toEqual([]);
  });

  test("a malformed token shows the inactive message without calling the server", async ({ page }) => {
    const calls = await mockRpc(page, { links_shared_plan_get: () => SHARED });
    await page.goto(`${PAGE}#plano=nao-e-hex`);
    await expect(page.getByText("Este link não está mais ativo")).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  test("a server error is not shown as inactive", async ({ page }) => {
    await page.route(`${RPC}*`, (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto(`${PAGE}#plano=${TOKEN}`);
    await expect(page.getByRole("alert")).toHaveText(
      "Não foi possível carregar o plano. Tente de novo."
    );
  });

  test("text is at least 16px and the page does not leak the referrer", async ({ page }) => {
    await mockRpc(page, { links_shared_plan_get: () => SHARED });
    await page.goto(`${PAGE}#plano=${TOKEN}`);
    await expect(page.getByRole("heading", { name: "Lugar Compartilhado" })).toBeVisible();
    const sizes = await page
      .locator("#shared-plan-root li, #shared-plan-root .links-public-plan__meta")
      .evaluateAll((nodes) => nodes.map((n) => parseFloat(getComputedStyle(n).fontSize)));
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
    await expect(page.locator("meta[name='referrer']")).toHaveAttribute("content", "no-referrer");
    await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /noindex/);
  });
  test.describe("ticking items", () => {
    const AFTER = {
      ...SHARED,
      plan_items: [SHARED.plan_items[0]!, { ...SHARED.plan_items[1]!, done: true }],
    };

    test("ticks through the rpc with idx, expected_text and done", async ({ page }) => {
      const touched = await watchForbidden(page);
      const calls = await mockRpc(page, {
        links_shared_plan_get: () => SHARED,
        links_shared_plan_set_done: () => AFTER,
      });
      await page.goto(`${PAGE}#plano=${TOKEN}`);
      const box = page.getByRole("checkbox", { name: "Biscoitos" });
      await expect(box).toBeVisible();
      await box.check();
      await expect(page.locator("#shared-plan-root")).toContainText("Lanches e compras · 1 de 1");
      await expect(box).toBeChecked();

      const writes = calls.filter((c) => c.name === "links_shared_plan_set_done");
      expect(writes).toHaveLength(1);
      expect(writes[0]!.body).toEqual({
        token: TOKEN,
        idx: 1,
        expected_text: "Biscoitos",
        done: true,
      });
      expect(writes[0]!.headers.authorization).toBeUndefined();
      expect(touched).toEqual([]);
      expect(calls.filter((c) => c.name === "links_shared_plan_get")).toHaveLength(1);
    });

    test("unticking sends done false", async ({ page }) => {
      const calls = await mockRpc(page, {
        links_shared_plan_get: () => SHARED,
        links_shared_plan_set_done: () => ({
          ...SHARED,
          plan_items: [{ ...SHARED.plan_items[0]!, done: false }, SHARED.plan_items[1]!],
        }),
      });
      await page.goto(`${PAGE}#plano=${TOKEN}`);
      await page.getByRole("checkbox", { name: "Comprar ingressos" }).uncheck();
      await expect(page.locator("#shared-plan-root")).toContainText("Checklist · 0 de 1");
      const write = calls.find((c) => c.name === "links_shared_plan_set_done")!;
      expect(write.body).toEqual({
        token: TOKEN,
        idx: 0,
        expected_text: "Comprar ingressos",
        done: false,
      });
    });

    test("checkboxes and their rows are big enough to tap", async ({ page }) => {
      await mockRpc(page, { links_shared_plan_get: () => SHARED });
      await page.goto(`${PAGE}#plano=${TOKEN}`);
      const box = page.getByRole("checkbox", { name: "Biscoitos" });
      await expect(box).toBeVisible();
      const check = (await box.boundingBox())!;
      expect(check.width).toBeGreaterThanOrEqual(16);
      const row = (await page.locator(".links-public-plan__row").first().boundingBox())!;
      expect(row.height).toBeGreaterThanOrEqual(44);
    });

    test("on conflict shows the notice and reloads the plan", async ({ page }) => {
      const RELOADED = {
        ...SHARED,
        plan_items: [{ text: "Biscoitos integrais", list: "compras", done: false }],
      };
      let gets = 0;
      const calls: Call[] = [];
      await page.route(`${RPC}*`, async (route) => {
        const request = route.request();
        const name = new URL(request.url()).pathname.split("/").pop()!;
        calls.push({ name, body: request.postDataJSON() ?? {}, headers: request.headers() });
        if (name === "links_shared_plan_set_done") {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ code: "P0001", message: "conflict", details: null, hint: null }),
          });
          return;
        }
        gets += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(gets === 1 ? SHARED : RELOADED),
        });
      });
      await page.goto(`${PAGE}#plano=${TOKEN}`);
      await page.getByRole("checkbox", { name: "Biscoitos" }).click();
      await expect(page.getByText("O plano mudou, recarregamos para você")).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "Biscoitos integrais" })).not.toBeChecked();
      await expect(page.getByRole("checkbox", { name: "Comprar ingressos" })).toHaveCount(0);
      expect(calls.map((c) => c.name)).toEqual([
        "links_shared_plan_get",
        "links_shared_plan_set_done",
        "links_shared_plan_get",
      ]);
      for (const c of calls) expect(c.headers.authorization).toBeUndefined();
    });

    test("on inactive shows the inactive message", async ({ page }) => {
      await page.route(`${RPC}*`, async (route) => {
        const name = new URL(route.request().url()).pathname.split("/").pop()!;
        if (name === "links_shared_plan_set_done") {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ code: "P0001", message: "inactive" }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(SHARED),
        });
      });
      await page.goto(`${PAGE}#plano=${TOKEN}`);
      await page.getByRole("checkbox", { name: "Biscoitos" }).click();
      await expect(page.getByText("Este link não está mais ativo")).toBeVisible();
      await expect(page.getByRole("checkbox")).toHaveCount(0);
    });

    test("serializes rapid ticks: one call at a time, in order", async ({ page }) => {
      let active = 0;
      let maxActive = 0;
      const bodies: Array<Record<string, unknown>> = [];
      await page.route(`${RPC}*`, async (route) => {
        const name = new URL(route.request().url()).pathname.split("/").pop()!;
        if (name === "links_shared_plan_set_done") {
          active += 1;
          maxActive = Math.max(maxActive, active);
          bodies.push(route.request().postDataJSON());
          await new Promise((r) => setTimeout(r, 150));
          active -= 1;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            name === "links_shared_plan_set_done"
              ? {
                  ...SHARED,
                  plan_items: [SHARED.plan_items[0]!, { ...SHARED.plan_items[1]!, done: true }],
                }
              : SHARED
          ),
        });
      });
      await page.goto(`${PAGE}#plano=${TOKEN}`);
      const box = page.getByRole("checkbox", { name: "Biscoitos" });
      await expect(box).toBeVisible();
      await box.check();
      await box.uncheck();
      await box.check();
      await expect.poll(() => bodies.length).toBe(3);
      expect(bodies.map((b) => b.done)).toEqual([true, false, true]);
      expect(maxActive).toBe(1);
      await expect(box).toBeChecked();
    });
  });

  test.describe("claiming items (Eu levo)", () => {
    const CLAIMED = {
      ...SHARED,
      plan_items: [SHARED.plan_items[0]!, { ...SHARED.plan_items[1]!, who: "Bia Teste" }],
    };
    const RELEASED = {
      ...SHARED,
      plan_items: [{ text: "Comprar ingressos", list: "checklist", done: true }, SHARED.plan_items[1]!],
    };

    test("claims through the rpc and shows the owner after the response", async ({ page }) => {
      const touched = await watchForbidden(page);
      const calls = await mockRpc(page, {
        links_shared_plan_get: () => SHARED,
        links_shared_plan_set_who: () => CLAIMED,
      });
      await page.goto(`${PAGE}#plano=${TOKEN}`);
      const pick = page.getByRole("combobox", { name: "Eu levo: Biscoitos" });
      await expect(pick).toBeVisible();
      await expect(pick).toHaveValue("");
      await pick.selectOption("Bia Teste");
      await expect(page.locator(".links-detail__plan-who", { hasText: "Bia Teste" })).toBeVisible();
      await expect(pick).toHaveValue("Bia Teste");

      const writes = calls.filter((c) => c.name === "links_shared_plan_set_who");
      expect(writes).toHaveLength(1);
      expect(writes[0]!.body).toEqual({
        token: TOKEN,
        idx: 1,
        expected_text: "Biscoitos",
        who: "Bia Teste",
      });
      expect(writes[0]!.headers.authorization).toBeUndefined();
      expect(touched).toEqual([]);
    });

    test("releases with who null", async ({ page }) => {
      const calls = await mockRpc(page, {
        links_shared_plan_get: () => SHARED,
        links_shared_plan_set_who: () => RELEASED,
      });
      await page.goto(`${PAGE}#plano=${TOKEN}`);
      const pick = page.getByRole("combobox", { name: "Eu levo: Comprar ingressos" });
      await expect(pick).toHaveValue("Alana");
      await pick.selectOption({ label: "Ninguém" });
      await expect(page.locator(".links-detail__plan-who")).toHaveCount(0);
      await expect(pick).toHaveValue("");
      const write = calls.find((c) => c.name === "links_shared_plan_set_who")!;
      expect(write.body).toEqual({
        token: TOKEN,
        idx: 0,
        expected_text: "Comprar ingressos",
        who: null,
      });
    });

    test("on conflict shows the notice and reloads the plan", async ({ page }) => {
      let gets = 0;
      await page.route(`${RPC}*`, async (route) => {
        const name = new URL(route.request().url()).pathname.split("/").pop()!;
        if (name === "links_shared_plan_get") gets += 1;
        const conflict = name === "links_shared_plan_set_who";
        await route.fulfill({
          status: conflict ? 400 : 200,
          contentType: "application/json",
          body: JSON.stringify(conflict ? { message: "conflict" } : SHARED),
        });
      });
      await page.goto(`${PAGE}#plano=${TOKEN}`);
      await page.getByRole("combobox", { name: "Eu levo: Biscoitos" }).selectOption("Alana");
      await expect(page.getByRole("status")).toContainText("O plano mudou");
      await expect.poll(() => gets).toBe(2);
      await expect(page.getByRole("combobox", { name: "Eu levo: Biscoitos" })).toHaveValue("");
    });

    test("selects and rows are at least 16px text and 44px tall", async ({ page }) => {
      await mockRpc(page, { links_shared_plan_get: () => SHARED });
      await page.goto(`${PAGE}#plano=${TOKEN}`);
      const picks = page.locator(".links-public-plan__claim");
      await expect(picks).toHaveCount(2);
      for (const pick of await picks.all()) {
        const box = (await pick.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
        const size = await pick.evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
        expect(size).toBeGreaterThanOrEqual(16);
        const opt = await pick.locator("option").first().evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
        expect(opt).toBeGreaterThanOrEqual(16);
      }
    });
  });
});
