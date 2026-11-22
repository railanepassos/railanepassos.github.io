/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScheduleSheet, createViewModal } from "../../src/links/admin-ui";
import { renderAgendaToolbar } from "../../src/links/agenda-toolbar";
import { createCalendarFeedSheet } from "../../src/links/calendar-feed-sheet";
import type { LinkRow } from "../../src/links/links-repo";

const TOKEN = "abcDEF012-_".repeat(4).slice(0, 43);
const TOKEN2 = "ZYXwvu987-_".repeat(4).slice(0, 43);
const SUPABASE = "https://proj.supabase.co";
const GOOGLE = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Museu";

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "link-1",
    url: "https://example.com",
    label: "Museu",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
    sort_order: 0,
    scheduled_start: "2026-12-20T09:00:00-03:00",
    scheduled_end: "2026-12-20T17:00:00-03:00",
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    ...partial,
  };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("detail: Adicionar ao Google Agenda", () => {
  function open(link: LinkRow) {
    const modal = createViewModal({
      onEdit: vi.fn(),
      onSchedule: vi.fn(),
      onMarkDone: vi.fn(),
      onDelete: vi.fn(),
    });
    document.body.appendChild(modal.element);
    modal.open(link);
    return modal.element.querySelector<HTMLAnchorElement>("[data-action='google-calendar']")!;
  }

  it("links to the Google template in a new tab, without opener or referrer", () => {
    const a = open(row());
    expect(a.hidden).toBe(false);
    expect(a.closest("[hidden]")).toBeNull();
    const href = new URL(a.href);
    expect(href.origin + href.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(href.searchParams.get("text")).toBe("Museu");
    expect(href.searchParams.get("dates")).toBe("20261220T120000Z/20261220T200000Z");
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
    expect(a.rel).toContain("noreferrer");
    expect(a.textContent).toContain("Adicionar ao Google Agenda");
  });

  it("is hidden when the place has no schedule", () => {
    const a = open(row({ scheduled_start: null, scheduled_end: null }));
    expect(a.closest("[hidden]")).not.toBeNull();
  });
});

describe("schedule sheet: Adicionar ao Google Agenda", () => {
  function sheet(hasSchedule: boolean, href: string | null) {
    const s = createScheduleSheet();
    document.body.appendChild(s.element);
    s.open({
      initial: { date: "2026-12-20", startTime: "09:00", endTime: "17:00" },
      hasSchedule,
      onSave: vi.fn(),
      getGoogleCalendarUrl: () => href,
    });
    const a = s.element.querySelector<HTMLAnchorElement>("[data-action='google-calendar']")!;
    return { s, a };
  }

  it("shows the link next to Baixar ICS when scheduled", () => {
    const { a, s } = sheet(true, GOOGLE);
    expect(a.hidden).toBe(false);
    expect(a.href).toBe(GOOGLE);
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
    expect(a.rel).toContain("noreferrer");
    expect(a.parentElement).toBe(s.element.querySelector("[data-action='download-ics']")!.parentElement);
  });

  it("is hidden without a schedule or without a url, and appears after setHasSchedule", () => {
    expect(sheet(false, GOOGLE).a.hidden).toBe(true);
    expect(sheet(true, null).a.hidden).toBe(true);
    const { s, a } = sheet(false, GOOGLE);
    s.setHasSchedule(true);
    expect(a.hidden).toBe(false);
  });
});

describe("agenda toolbar", () => {
  it("has the export and Google buttons wired", () => {
    const h = { onExport: vi.fn(), onGoogle: vi.fn() };
    const bar = renderAgendaToolbar({ count: 2 }, h);
    const exp = bar.querySelector<HTMLButtonElement>("[data-action='export-ics']")!;
    expect(exp.textContent).toContain("Exportar agenda (.ics)");
    exp.click();
    bar.querySelector<HTMLButtonElement>("[data-action='calendar-feed']")!.click();
    expect(h.onExport).toHaveBeenCalledTimes(1);
    expect(h.onGoogle).toHaveBeenCalledTimes(1);
    expect(bar.querySelector("[data-action='calendar-feed']")!.textContent).toContain("Agenda no Google");
  });

  it("disables export when nothing is scheduled (the Google sheet stays reachable)", () => {
    const h = { onExport: vi.fn(), onGoogle: vi.fn() };
    const bar = renderAgendaToolbar({ count: 0 }, h);
    const exp = bar.querySelector<HTMLButtonElement>("[data-action='export-ics']")!;
    expect(exp.disabled).toBe(true);
    exp.click();
    expect(h.onExport).not.toHaveBeenCalled();
    expect(bar.querySelector<HTMLButtonElement>("[data-action='calendar-feed']")!.disabled).toBe(false);
  });
});

describe("calendar feed sheet", () => {
  function setup(initial: { enabled: boolean; token: string | null }, over: Record<string, unknown> = {}) {
    const deps = {
      supabaseUrl: SUPABASE,
      load: vi.fn().mockResolvedValue(initial),
      enable: vi.fn().mockResolvedValue(TOKEN2),
      disable: vi.fn().mockResolvedValue(undefined),
      ...over,
    };
    const sheet = createCalendarFeedSheet(deps);
    document.body.appendChild(sheet.element);
    const act = (name: string) => sheet.element.querySelector<HTMLElement>(`[data-action='${name}']`)!;
    const input = () => sheet.element.querySelector<HTMLInputElement>("input")!;
    const status = () => sheet.element.querySelector("[role='status']")!.textContent;
    return { sheet, deps, act, input, status };
  }

  const FEED = (t: string) => `${SUPABASE}/functions/v1/links-calendar?t=${t}`;

  it("is closed until opened, titled and loads the state on open", async () => {
    const { sheet, deps } = setup({ enabled: false, token: null });
    expect(sheet.element.hidden).toBe(true);
    sheet.open();
    expect(sheet.element.hidden).toBe(false);
    expect(sheet.element.textContent).toContain("Agenda no Google");
    await flush();
    expect(deps.load).toHaveBeenCalledTimes(1);
  });

  it("off: only Ligar shows", async () => {
    const { sheet, act, input } = setup({ enabled: false, token: null });
    sheet.open();
    await flush();
    expect(act("feed-enable").hidden).toBe(false);
    for (const a of ["feed-copy", "feed-open-google", "feed-rotate", "feed-disable"]) {
      expect(act(a).hidden).toBe(true);
    }
    expect(input().hidden).toBe(true);
  });

  it("on: shows the url and Copiar, Abrir no Google Agenda, Trocar link, Desligar", async () => {
    const { sheet, act, input } = setup({ enabled: true, token: TOKEN });
    sheet.open();
    await flush();
    expect(act("feed-enable").hidden).toBe(true);
    expect(input().value).toBe(FEED(TOKEN));
    expect(input().readOnly).toBe(true);
    const open = act("feed-open-google") as HTMLAnchorElement;
    expect(open.hidden).toBe(false);
    expect(open.href).toBe(
      "https://calendar.google.com/calendar/r?cid=" +
        encodeURIComponent(`webcal://proj.supabase.co/functions/v1/links-calendar?t=${TOKEN}`)
    );
    expect(open.target).toBe("_blank");
    expect(open.rel).toContain("noopener");
    expect(open.rel).toContain("noreferrer");
    for (const a of ["feed-copy", "feed-rotate", "feed-disable"]) expect(act(a).hidden).toBe(false);
  });

  it("Ligar generates the feed and shows the new url", async () => {
    const { sheet, act, input, deps, status } = setup({ enabled: false, token: null });
    sheet.open();
    await flush();
    act("feed-enable").click();
    await flush();
    expect(deps.enable).toHaveBeenCalledTimes(1);
    expect(input().value).toBe(FEED(TOKEN2));
    expect(act("feed-enable").hidden).toBe(true);
    expect(status()).toBe("Agenda ligada");
  });

  it("Copiar writes the https url to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { sheet, act, status } = setup({ enabled: true, token: TOKEN });
    sheet.open();
    await flush();
    act("feed-copy").click();
    await flush();
    expect(writeText).toHaveBeenCalledWith(FEED(TOKEN));
    expect(status()).toBe("Link copiado");
  });

  it("Copiar falls back to a hint when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const { sheet, act, status } = setup({ enabled: true, token: TOKEN });
    sheet.open();
    await flush();
    act("feed-copy").click();
    await flush();
    expect(status()).toBe("Selecione o link e copie");
  });

  it("Trocar link asks first, then rotates", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { sheet, act, input, deps } = setup({ enabled: true, token: TOKEN });
    sheet.open();
    await flush();
    confirm.mockReturnValueOnce(false);
    act("feed-rotate").click();
    await flush();
    expect(deps.enable).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    act("feed-rotate").click();
    await flush();
    expect(deps.enable).toHaveBeenCalledTimes(1);
    expect(input().value).toBe(FEED(TOKEN2));
  });

  it("Desligar asks first, then turns it off", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { sheet, act, input, deps, status } = setup({ enabled: true, token: TOKEN });
    sheet.open();
    await flush();
    confirm.mockReturnValueOnce(false);
    act("feed-disable").click();
    await flush();
    expect(deps.disable).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    act("feed-disable").click();
    await flush();
    expect(deps.disable).toHaveBeenCalledTimes(1);
    expect(input().hidden).toBe(true);
    expect(act("feed-enable").hidden).toBe(false);
    expect(status()).toBe("Agenda desligada");
  });

  it("shows an error and keeps the state when a call fails", async () => {
    const { sheet, act, status, input } = setup(
      { enabled: true, token: TOKEN },
      { enable: vi.fn().mockRejectedValue(new Error("boom")) }
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    sheet.open();
    await flush();
    act("feed-rotate").click();
    await flush();
    expect(status()).toBe("Não foi possível gerar o link. Tente de novo.");
    expect(input().value).toBe(FEED(TOKEN));
  });

  it("shows an error when loading fails, and Fechar hides the sheet", async () => {
    const { sheet, status } = setup(
      { enabled: false, token: null },
      { load: vi.fn().mockRejectedValue(new Error("boom")) }
    );
    sheet.open();
    await flush();
    expect(status()).toBe("Não foi possível carregar. Tente de novo.");
    sheet.close();
    expect(sheet.element.hidden).toBe(true);
  });
});
