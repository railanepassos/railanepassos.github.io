import { test, expect } from "@playwright/test";
import { SUPABASE, isMobile, openAuthedWith } from "./helpers/authed";

/** Phase 9: "Pedir ao Claude" (refinar from the detail), ready suggestions, review and apply. Fake data only. */

const ID = "00000000-0000-4000-8000-0000000000a1";
const REQ_ID = "00000000-0000-4000-8000-0000000000b1";
const ITEM = {
  id: ID,
  url: "https://example.com/lugar-pedido",
  label: "Lugar Pedido",
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
  people: [],
  plan_items: [],
};

test.describe("Links app: pedidos ao Claude", () => {
  test("refinar pelo detalhe, sugestão pronta, Revisar, Salvar e status aplicado", async ({ page }) => {
    const writes = await openAuthedWith(page, [ITEM]);
    let rows: Array<Record<string, unknown>> = [];
    const posted: Array<Record<string, unknown>> = [];
    const statusPatches: Array<Record<string, unknown>> = [];

    await page.route(`${SUPABASE}/rest/v1/links_ai_runs**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: 1, last_run_at: new Date().toISOString() }]) })
    );
    await page.route(`${SUPABASE}/rest/v1/links_ai_requests**`, async (route) => {
      const request = route.request();
      const method = request.method();
      if (method === "POST") {
        const body = request.postDataJSON() as Record<string, unknown>;
        posted.push(body);
        rows = [{ id: REQ_ID, status: "pendente", result: null, error: null, created_at: "2026-11-22T12:00:00Z", updated_at: "2026-11-22T12:00:00Z", processed_at: null, ...body }];
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(rows[0]) });
      } else if (method === "PATCH") {
        const body = request.postDataJSON() as Record<string, unknown>;
        statusPatches.push(body);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: REQ_ID, ...body }]) });
      } else if (method === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
      } else {
        await route.fulfill({ status: 204, body: "" });
      }
    });

    // Registered after openAuthedWith: the later route wins over its broad links** glob.
    // Open the detail and ask for a refinement.
    await page.locator(".feed-card").first().click();
    const detail = page.getByRole("dialog").filter({ hasText: "Lugar Pedido" }).first();
    await detail.getByRole("button", { name: "Pedir ao Claude" }).click();
    const ask = page.getByRole("dialog", { name: "Pedir ao Claude" });
    await expect(ask).toBeVisible();
    await ask.getByLabel("Dossiê").check();
    await ask.getByRole("button", { name: "Enviar pedido" }).click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toMatchObject({ kind: "refinar" });
    expect(posted[0].payload).toEqual({ link_ids: [ID], options: ["dossie"] });

    // The processor answers: the request is ready with an update draft.
    rows = [
      {
        ...rows[0],
        status: "pronto",
        processed_at: "2026-11-22T13:00:00Z",
        result: { v: 1, kind: "atualizacao", id: ID, fields: { city: "Cidade Sugerida", dossier: "Dossiê sugerido" } },
      },
    ];
    await page.reload();
    await expect(page.locator(".feed-card").first()).toBeVisible();
    if (isMobile(page)) await expect(page.getByRole("button", { name: /Sugestões prontas \(1\)/ })).toBeVisible();
    const chip = page.getByRole("button", { name: /Sugestões prontas \(1\)/ }).first();
    await expect(chip).toBeVisible();
    await chip.click();

    const requests = page.getByRole("dialog", { name: /Pedidos/ });
    await expect(requests).toBeVisible();
    await requests.getByRole("button", { name: "Revisar" }).click();

    const form = page.getByRole("dialog", { name: "Editar experiência" });
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Cidade (opcional)")).toHaveValue("Cidade Sugerida");
    await expect(form.getByLabel("Dossiê (opcional)")).toHaveValue("Dossiê sugerido");
    expect(writes.patched).toBeNull();

    await form.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => writes.patched).not.toBeNull();
    expect(writes.patched).toMatchObject({ city: "Cidade Sugerida", dossier: "Dossiê sugerido" });
    await expect.poll(() => statusPatches.length).toBeGreaterThan(0);
    expect(statusPatches[0]).toEqual({ status: "aplicado" });
  });
});
