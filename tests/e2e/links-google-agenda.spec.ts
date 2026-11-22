import { test, expect, type Page } from "@playwright/test";
import { SUPABASE, isMobile, openAuthedWith } from "./helpers/authed";

/** Phase 10: Adicionar ao Google Agenda + the "Agenda no Google" feed sheet. Fake data only. */

const TOKEN = "abcDEF012-_".repeat(4).slice(0, 43);
const TOKEN2 = "ZYXwvu987-_".repeat(4).slice(0, 43);
const RPC = `${SUPABASE}/rest/v1/rpc/`;

const ROW = {
  id: "00000000-0000-4000-8000-0000000000b1",
  url: "https://example.com/lugar-agenda",
  label: "Lugar Agendado",
  description: "Passeio de teste",
  icon_preset: null,
  icon_url: null,
  category: "museu",
  sort_order: 10,
  scheduled_start: "2026-12-20T09:00:00-03:00",
  scheduled_end: "2026-12-20T17:00:00-03:00",
  status: "wishlist",
  priority: 0,
  want_again: false,
  image_url: null,
  note: null,
  completed_at: null,
  created_at: "2026-11-10T12:00:00Z",
  address: "Rua Fictícia, 10",
  city: "Cidade Teste",
};

type Call = { name: string; body: Record<string, unknown> };

async function mockFeedRpc(page: Page, initial: { enabled: boolean; token: string | null }) {
  const calls: Call[] = [];
  let state = { ...initial };
  await page.route(`${RPC}*`, async (route) => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split("/").pop()!;
    calls.push({ name, body: request.postDataJSON() ?? {} });
    let answer: unknown = null;
    if (name === "links_calendar_feed_get") answer = state;
    if (name === "links_calendar_feed_enable") {
      state = { enabled: true, token: calls.filter((c) => c.name === name).length === 1 ? TOKEN : TOKEN2 };
      answer = state.token;
    }
    if (name === "links_calendar_feed_disable") {
      state = { enabled: false, token: null };
      answer = true;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
  });
  return calls;
}

async function openAgendaTab(page: Page): Promise<void> {
  const nav = isMobile(page) ? page.locator("#links-tabbar") : page.locator("#links-sidenav");
  await nav.locator('[data-section="agenda"]').click();
  await expect(page.locator(".links-agendabar")).toBeVisible();
}

test.describe("Adicionar ao Google Agenda", () => {
  test("detail link opens the Google template in a new tab", async ({ page }) => {
    await openAuthedWith(page, [ROW]);
    await page.locator(".feed-card", { hasText: "Lugar Agendado" }).locator(".feed-card__open").click();
    const link = page.locator(".links-detail").getByRole("link", { name: "Adicionar ao Google Agenda" });
    await expect(link).toBeVisible();
    const href = new URL((await link.getAttribute("href"))!);
    expect(href.origin + href.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(href.searchParams.get("action")).toBe("TEMPLATE");
    expect(href.searchParams.get("text")).toBe("Lugar Agendado");
    expect(href.searchParams.get("dates")).toBe("20261220T120000Z/20261220T200000Z");
    expect(href.searchParams.get("location")).toBe("Rua Fictícia, 10, Cidade Teste");
    expect(href.searchParams.get("details")).toBe("Passeio de teste\nhttps://example.com/lugar-agenda");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("rel", /noreferrer/);
  });
});

test.describe("Agenda no Google (feed)", () => {
  test("exports the agenda as an .ics download", async ({ page }) => {
    await openAuthedWith(page, [ROW]);
    await openAgendaTab(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar agenda (.ics)" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("agenda-experiencias.ics");
  });

  test("turns on, copies, opens in Google Agenda, rotates and turns off", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    const calls = await mockFeedRpc(page, { enabled: false, token: null });
    await openAuthedWith(page, [ROW]);
    await openAgendaTab(page);
    await page.getByRole("button", { name: "Agenda no Google" }).click();
    const sheet = page.getByRole("dialog", { name: "Agenda no Google" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Ligar", exact: true })).toBeVisible();
    expect(calls.map((c) => c.name)).toEqual(["links_calendar_feed_get"]);

    await sheet.getByRole("button", { name: "Ligar", exact: true }).click();
    const url = `${SUPABASE}/functions/v1/links-calendar?t=${TOKEN}`;
    await expect(sheet.getByRole("textbox", { name: "Link da agenda" })).toHaveValue(url);
    expect(calls.map((c) => c.name)).toEqual(["links_calendar_feed_get", "links_calendar_feed_enable"]);

    await sheet.getByRole("button", { name: "Copiar link" }).click();
    await expect(sheet.getByRole("status")).toHaveText(/Link copiado|Selecione o link e copie/);
    const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    if (copied !== "") expect(copied).toBe(url);

    const google = sheet.getByRole("link", { name: "Abrir no Google Agenda" });
    await expect(google).toHaveAttribute(
      "href",
      "https://calendar.google.com/calendar/r?cid=" +
        encodeURIComponent(`webcal://${new URL(SUPABASE).host}/functions/v1/links-calendar?t=${TOKEN}`)
    );
    await expect(google).toHaveAttribute("target", "_blank");
    await expect(google).toHaveAttribute("rel", /noopener/);

    page.once("dialog", (d) => void d.accept());
    await sheet.getByRole("button", { name: "Trocar link" }).click();
    await expect(sheet.getByRole("textbox", { name: "Link da agenda" })).toHaveValue(
      `${SUPABASE}/functions/v1/links-calendar?t=${TOKEN2}`
    );

    page.once("dialog", (d) => void d.accept());
    await sheet.getByRole("button", { name: "Desligar" }).click();
    await expect(sheet.getByRole("button", { name: "Ligar", exact: true })).toBeVisible();
    await expect(sheet.getByRole("textbox", { name: "Link da agenda" })).toBeHidden();
    expect(calls.map((c) => c.name)).toEqual([
      "links_calendar_feed_get",
      "links_calendar_feed_enable",
      "links_calendar_feed_enable",
      "links_calendar_feed_disable",
    ]);
  });

  test("shows the link of an already-enabled feed on open", async ({ page }) => {
    await mockFeedRpc(page, { enabled: true, token: TOKEN });
    await openAuthedWith(page, [ROW]);
    await openAgendaTab(page);
    await page.getByRole("button", { name: "Agenda no Google" }).click();
    const sheet = page.getByRole("dialog", { name: "Agenda no Google" });
    await expect(sheet.getByRole("textbox", { name: "Link da agenda" })).toHaveValue(
      `${SUPABASE}/functions/v1/links-calendar?t=${TOKEN}`
    );
    await expect(sheet.getByRole("button", { name: "Ligar", exact: true })).toBeHidden();
  });
});
