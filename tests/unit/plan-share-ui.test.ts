/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewModal } from "../../src/links/admin-ui";
import type { LinkRow } from "../../src/links/links-repo";

const TOKEN = "0123456789abcdef".repeat(4);
const TOKEN2 = "fedcba9876543210".repeat(4);

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
    scheduled_start: null,
    scheduled_end: null,
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    people: ["Alana"],
    plan_items: [{ text: "Ingressos", list: "checklist", done: false }],
    ...partial,
  };
}

function setup(over: Record<string, unknown> = {}) {
  const callbacks = {
    onEdit: vi.fn(),
    onSchedule: vi.fn(),
    onMarkDone: vi.fn(),
    onDelete: vi.fn(),
    onEditPlan: vi.fn(),
    onPlanShareEnable: vi.fn().mockResolvedValue(TOKEN),
    onPlanShareDisable: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  const modal = createViewModal(callbacks);
  document.body.appendChild(modal.element);
  const q = <T extends HTMLElement>(sel: string): T =>
    modal.element.querySelector<T>(`[data-field='plan-link'] ${sel}`)!;
  const act = (name: string): HTMLButtonElement => q<HTMLButtonElement>(`[data-action='${name}']`);
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  return { callbacks, modal, q, act, flush };
}

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

describe("detail: Link do plano", () => {
  it("is off by default: only Gerar link shows", () => {
    const { modal, act, q } = setup();
    modal.open(row());
    expect(q("[data-plan-link-title]").textContent).toBe("Link do plano");
    expect(act("plan-link-enable").hidden).toBe(false);
    expect(act("plan-link-copy").hidden).toBe(true);
    expect(act("plan-link-rotate").hidden).toBe(true);
    expect(act("plan-link-disable").hidden).toBe(true);
    expect(q<HTMLInputElement>("input").hidden).toBe(true);
  });

  it("shows the url (token in the fragment) and the three actions when on", () => {
    const { modal, act, q } = setup();
    modal.open(row({ plan_share_token: TOKEN }));
    expect(act("plan-link-enable").hidden).toBe(true);
    for (const a of ["plan-link-copy", "plan-link-rotate", "plan-link-disable"]) {
      expect(act(a).hidden).toBe(false);
    }
    expect(q<HTMLInputElement>("input").value).toBe(
      `${location.origin}/p/a8f3k2/#plano=${TOKEN}`
    );
    expect(q<HTMLInputElement>("input").readOnly).toBe(true);
  });

  it("is hidden when there is nothing to share and no link is on", () => {
    const { modal } = setup();
    modal.open(row({ people: null, plan_items: null }));
    expect(modal.element.querySelector<HTMLElement>("[data-field='plan-link']")!.hidden).toBe(true);
  });

  it("stays visible for an enabled link even if the plan was emptied (so it can be turned off)", () => {
    const { modal } = setup();
    modal.open(row({ people: null, plan_items: null, plan_share_token: TOKEN }));
    expect(modal.element.querySelector<HTMLElement>("[data-field='plan-link']")!.hidden).toBe(false);
  });

  it("is hidden when the host gives no share callbacks", () => {
    const { modal } = setup({ onPlanShareEnable: undefined, onPlanShareDisable: undefined });
    modal.open(row());
    expect(modal.element.querySelector<HTMLElement>("[data-field='plan-link']")!.hidden).toBe(true);
  });

  it("Gerar link calls the host and shows the generated url", async () => {
    const { modal, act, q, callbacks, flush } = setup();
    modal.open(row());
    act("plan-link-enable").click();
    await flush();
    expect(callbacks.onPlanShareEnable).toHaveBeenCalledWith(expect.objectContaining({ id: "link-1" }));
    expect(q<HTMLInputElement>("input").value).toContain(`#plano=${TOKEN}`);
    expect(act("plan-link-enable").hidden).toBe(true);
    expect(act("plan-link-copy").hidden).toBe(false);
  });

  it("Copiar writes the url to the clipboard and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { modal, act, q, flush } = setup();
    modal.open(row({ plan_share_token: TOKEN }));
    act("plan-link-copy").click();
    await flush();
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/p/a8f3k2/#plano=${TOKEN}`);
    expect(q("[role='status']").textContent).toBe("Link copiado");
  });

  it("Copiar falls back to selecting the text when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const { modal, act, q, flush } = setup();
    modal.open(row({ plan_share_token: TOKEN }));
    const input = q<HTMLInputElement>("input");
    const select = vi.spyOn(input, "select");
    act("plan-link-copy").click();
    await flush();
    expect(select).toHaveBeenCalled();
    expect(q("[role='status']").textContent).toBe("Selecione o link e copie");
  });

  it("Trocar link asks for confirmation and rotates", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { modal, act, q, callbacks, flush } = setup({
      onPlanShareEnable: vi.fn().mockResolvedValue(TOKEN2),
    });
    modal.open(row({ plan_share_token: TOKEN }));
    act("plan-link-rotate").click();
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(callbacks.onPlanShareEnable).toHaveBeenCalledTimes(1);
    expect(q<HTMLInputElement>("input").value).toContain(TOKEN2);
  });

  it("Trocar link does nothing when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { modal, act, callbacks, flush } = setup();
    modal.open(row({ plan_share_token: TOKEN }));
    act("plan-link-rotate").click();
    await flush();
    expect(callbacks.onPlanShareEnable).not.toHaveBeenCalled();
  });

  it("Desligar asks for confirmation, calls the host and switches the block off", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { modal, act, callbacks, flush } = setup();
    modal.open(row({ plan_share_token: TOKEN }));
    act("plan-link-disable").click();
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(callbacks.onPlanShareDisable).toHaveBeenCalledWith(expect.objectContaining({ id: "link-1" }));
    expect(act("plan-link-enable").hidden).toBe(false);
    expect(act("plan-link-copy").hidden).toBe(true);
  });

  it("Desligar does nothing when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { modal, act, callbacks, flush } = setup();
    modal.open(row({ plan_share_token: TOKEN }));
    act("plan-link-disable").click();
    await flush();
    expect(callbacks.onPlanShareDisable).not.toHaveBeenCalled();
    expect(act("plan-link-copy").hidden).toBe(false);
  });

  it("shows an error and keeps the state when the host rejects", async () => {
    const { modal, act, q, flush } = setup({
      onPlanShareEnable: vi.fn().mockRejectedValue(new Error("boom")),
    });
    modal.open(row());
    act("plan-link-enable").click();
    await flush();
    expect(q("[role='status']").textContent).toBe("Não foi possível gerar o link. Tente de novo.");
    expect(act("plan-link-enable").hidden).toBe(false);
  });

  it("controls are at least 44px tall and 16px (set by class, checked in e2e)", () => {
    const { modal, act } = setup();
    modal.open(row());
    expect(act("plan-link-enable").classList.contains("links-detail__share-btn")).toBe(true);
  });
});
