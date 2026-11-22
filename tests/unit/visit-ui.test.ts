/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVisitMode } from "../../src/links/visit-ui";
import type { LinkRow } from "../../src/links/links-repo";
import type { PlanItem } from "../../src/links/plan";
import { StaleLinkError } from "../../src/links/links-repo";

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "link-1",
    url: "https://example.com",
    label: "Museu do Amanhã",
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
    ...partial,
  };
}

const PLAN: PlanItem[] = [
  { text: "Ingressos", list: "checklist", who: "Ana", done: true },
  { text: "Água", list: "checklist", done: false },
  { text: "Lanche", list: "compras", done: false },
];

function setup(link: LinkRow = row(), over: Record<string, unknown> = {}) {
  const wake = { request: vi.fn().mockResolvedValue(undefined), release: vi.fn().mockResolvedValue(undefined) };
  const cb = {
    onSavePlanItems: vi.fn().mockResolvedValue(undefined),
    onMarkDone: vi.fn(),
    onClose: vi.fn(),
    wakeLock: wake,
    ...over,
  };
  const visit = createVisitMode(cb);
  document.body.appendChild(visit.element);
  visit.open(link);
  const tabs = () => Array.from(visit.element.querySelectorAll<HTMLElement>('[role="tab"]'));
  const tab = (name: string) => tabs().find((t) => t.textContent?.trim() === name)!;
  const button = (name: string) =>
    Array.from(visit.element.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.trim() === name || b.getAttribute("aria-label") === name
    )!;
  return { visit, cb, wake, tabs, tab, button };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createVisitMode", () => {
  it("opens on Roteiro with place name, dialog role and a tablist", () => {
    const { visit, tab } = setup();
    expect(visit.element.hidden).toBe(false);
    expect(visit.currentId()).toBe("link-1");
    expect(visit.element.querySelector("[role='dialog']")).not.toBeNull();
    expect(visit.element.querySelector("[role='tablist']")).not.toBeNull();
    expect(visit.element.textContent).toContain("Museu do Amanhã");
    expect(tab("Roteiro").getAttribute("aria-selected")).toBe("true");
  });

  it("shows only tabs that have content", () => {
    const bare = setup();
    expect(bare.tabs().map((t) => t.textContent?.trim())).toEqual(["Roteiro"]);
    const full = setup(
      row({
        plan_items: PLAN,
        dossier: "Uma história",
        pose_refs: [{ note: "Na escada" }],
      })
    );
    expect(full.tabs().map((t) => t.textContent?.trim())).toEqual([
      "Roteiro",
      "Checklist",
      "História",
      "Poses",
    ]);
  });

  it("Roteiro shows time, itinerary, address with map link and cost; empty itinerary placeholder", () => {
    const { visit } = setup(
      row({
        scheduled_start: "2026-12-05T13:00:00.000Z",
        scheduled_end: "2026-12-05T15:00:00.000Z",
        itinerary: "Chegar cedo\nIr direto ao 2º andar",
        address: "Praça Mauá, 1",
        city: "Rio de Janeiro",
        cost_text: "R$ 30",
      })
    );
    const text = visit.element.textContent ?? "";
    expect(text).toContain("Chegar cedo");
    expect(text).toContain("Praça Mauá, 1");
    expect(text).toContain("R$ 30");
    const map = visit.element.querySelector<HTMLAnchorElement>("a[data-action='open-map']")!;
    expect(map.textContent).toContain("Abrir no mapa");
    expect(map.href).toContain("http");
    expect(visit.element.querySelector("[data-field='time']")).not.toBeNull();

    const empty = setup(row());
    expect(empty.visit.element.textContent).toContain("Sem roteiro ainda");
  });

  it("moves between tabs with arrow keys, Home and End", () => {
    const { tabs, tab, visit } = setup(row({ plan_items: PLAN, dossier: "x" }));
    const press = (el: HTMLElement, key: string) =>
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    press(tab("Roteiro"), "ArrowRight");
    expect(tab("Checklist").getAttribute("aria-selected")).toBe("true");
    expect(tab("Roteiro").getAttribute("aria-selected")).toBe("false");
    press(tab("Checklist"), "ArrowRight");
    expect(tab("História").getAttribute("aria-selected")).toBe("true");
    press(tab("História"), "ArrowRight");
    expect(tab("Roteiro").getAttribute("aria-selected")).toBe("true");
    press(tab("Roteiro"), "ArrowLeft");
    expect(tab("História").getAttribute("aria-selected")).toBe("true");
    press(tab("História"), "Home");
    expect(tab("Roteiro").getAttribute("aria-selected")).toBe("true");
    press(tab("Roteiro"), "End");
    expect(tab("História").getAttribute("aria-selected")).toBe("true");
    expect(tabs().filter((t) => t.tabIndex === 0)).toHaveLength(1);
    expect(visit.element.querySelector("[role='tabpanel']")).not.toBeNull();
  });

  it("Checklist shows both lists with who and N de M progress", () => {
    const { tab, visit } = setup(row({ plan_items: PLAN }));
    tab("Checklist").click();
    const text = visit.element.textContent ?? "";
    expect(text).toContain("Checklist · 1 de 2");
    expect(text).toContain("Lanches e compras · 0 de 1");
    expect(text).toContain("Ana");
    expect(visit.element.querySelectorAll("input[type='checkbox']")).toHaveLength(3);
  });

  it("ticking saves the whole plan; the progress updates at once", async () => {
    const { tab, visit, cb } = setup(row({ plan_items: PLAN }));
    tab("Checklist").click();
    const boxes = visit.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    boxes[1]!.checked = true;
    boxes[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(visit.element.textContent).toContain("Checklist · 2 de 2");
    await flush();
    expect(cb.onSavePlanItems).toHaveBeenCalledTimes(1);
    const [, items] = cb.onSavePlanItems.mock.calls[0]!;
    expect(items.map((i: PlanItem) => i.done)).toEqual([true, true, false]);
  });

  it("rolls the tick back and says so when the save is rejected", async () => {
    const { tab, visit } = setup(row({ plan_items: PLAN }), {
      onSavePlanItems: vi.fn().mockRejectedValue(new Error("boom")),
    });
    tab("Checklist").click();
    const boxes = visit.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    boxes[1]!.checked = true;
    boxes[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    const after = visit.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(after[1]!.checked).toBe(false);
    expect(visit.element.textContent).toContain("Checklist · 1 de 2");
    const err = visit.element.querySelector<HTMLElement>("[role='alert']")!;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toMatch(/não foi possível/i);
  });

  it("serializes saves: the second starts after the first settles", async () => {
    let release!: () => void;
    const first = new Promise<void>((r) => (release = r));
    const save = vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined);
    const { tab, visit } = setup(row({ plan_items: PLAN }), { onSavePlanItems: save });
    tab("Checklist").click();
    const tick = (i: number) => {
      const b = visit.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[i]!;
      b.checked = !b.checked;
      b.dispatchEvent(new Event("change", { bubbles: true }));
    };
    tick(1);
    tick(2);
    await flush();
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![1].map((i: PlanItem) => i.done)).toEqual([true, true, true]);
  });

  const tickBox = (visit: { element: HTMLElement }, i: number) => {
    const b = visit.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[i]!;
    b.focus();
    b.checked = !b.checked;
    b.dispatchEvent(new Event("change", { bubbles: true }));
  };

  it("Marcar como feito waits for pending tick saves before calling onMarkDone", async () => {
    let release!: () => void;
    const first = new Promise<void>((r) => (release = r));
    const save = vi.fn().mockReturnValueOnce(first);
    const { tab, visit, button, cb } = setup(row({ plan_items: PLAN }), { onSavePlanItems: save });
    tab("Checklist").click();
    tickBox(visit, 1);
    button("Terminar visita").click();
    button("Marcar como feito").click();
    await flush();
    expect(visit.element.hidden).toBe(true);
    expect(cb.onMarkDone).not.toHaveBeenCalled();
    release();
    await flush();
    expect(cb.onMarkDone).toHaveBeenCalledTimes(1);
  });

  it("keeps focus on the same checkbox after a tick and Escape still closes", async () => {
    const { tab, visit } = setup(row({ plan_items: PLAN }));
    tab("Checklist").click();
    tickBox(visit, 1);
    const boxes = visit.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(document.activeElement).toBe(boxes[1]);
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(visit.element.hidden).toBe(true);
    await flush();
  });

  it("Escape closes even when focus fell to the body", () => {
    const { visit } = setup();
    (document.activeElement as HTMLElement).blur();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(visit.element.hidden).toBe(true);
  });

  it("traps Tab inside the dialog", () => {
    const { visit } = setup();
    const focusables = Array.from(
      visit.element.querySelectorAll<HTMLElement>("button:not([hidden]), [tabindex='0']")
    ).filter((e) => !e.closest("[hidden]"));
    const last = focusables[focusables.length - 1]!;
    last.focus();
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    last.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(visit.element.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    focusables[0]!.dispatchEvent(back);
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the opener on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { visit, button } = setup();
    expect(document.activeElement).not.toBe(opener);
    button("Fechar modo visita").click();
    expect(visit.element.hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it("on a stale save re-renders from the fresh link and shows the notice", async () => {
    const fresh = row({
      plan_items: [{ text: "Novo item", list: "checklist", done: false }],
    });
    const { tab, visit } = setup(row({ plan_items: PLAN }), {
      onSavePlanItems: vi.fn().mockRejectedValue(new StaleLinkError(fresh)),
    });
    tab("Checklist").click();
    tickBox(visit, 1);
    await flush();
    expect(visit.element.textContent).toContain("Novo item");
    expect(visit.element.textContent).not.toContain("Água");
    const err = visit.element.querySelector<HTMLElement>("[role='alert']")!;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toMatch(/mudou|atualiz|outro/i);
  });

  it("História renders the dossier as text, never HTML, keeping line breaks", () => {
    const { tab, visit } = setup(row({ dossier: "linha 1\n<img src=x onerror=alert(1)>" }));
    tab("História").click();
    const body = visit.element.querySelector<HTMLElement>("[data-field='dossier']")!;
    expect(body.textContent).toBe("linha 1\n<img src=x onerror=alert(1)>");
    expect(visit.element.querySelector("img")).toBeNull();
  });

  it("Poses lists references and notes", () => {
    const { tab, visit } = setup(
      row({ pose_refs: [{ url: "https://example.com/p", note: "Na escada" }, { note: "De costas" }] })
    );
    tab("Poses").click();
    expect(visit.element.textContent).toContain("Na escada");
    expect(visit.element.textContent).toContain("De costas");
    expect(visit.element.querySelector("a[href='https://example.com/p']")).not.toBeNull();
  });

  it("Terminar visita asks first; Marcar como feito closes and then calls onMarkDone", () => {
    const order: string[] = [];
    const { visit, button, cb } = setup(row(), {
      onMarkDone: vi.fn(() => order.push(`done:${visit.element.hidden}`)),
      onClose: vi.fn(() => order.push("close")),
    });
    const confirm = () => visit.element.querySelector<HTMLElement>("[data-field='finish-confirm']")!;
    expect(confirm().hidden).toBe(true);
    button("Terminar visita").click();
    expect(confirm().hidden).toBe(false);
    expect(confirm().textContent).toContain("Marcar como feito?");
    expect(cb.onMarkDone).not.toHaveBeenCalled();
    button("Marcar como feito").click();
    expect(visit.element.hidden).toBe(true);
    expect(visit.currentId()).toBeNull();
    expect(order).toEqual(["close", "done:true"]);
  });

  it("Agora não closes and calls nothing else", () => {
    const { visit, button, cb } = setup();
    button("Terminar visita").click();
    button("Agora não").click();
    expect(visit.element.hidden).toBe(true);
    expect(cb.onMarkDone).not.toHaveBeenCalled();
    expect(cb.onSavePlanItems).not.toHaveBeenCalled();
    expect(cb.onClose).toHaveBeenCalledTimes(1);
  });

  it("the close button and Escape close the mode", () => {
    const a = setup();
    a.button("Fechar modo visita").click();
    expect(a.visit.element.hidden).toBe(true);
    const b = setup();
    b.visit.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(b.visit.element.hidden).toBe(true);
  });

  it("requests the wake lock on open and releases it on close", () => {
    const { visit, wake } = setup();
    expect(wake.request).toHaveBeenCalledTimes(1);
    expect(wake.release).not.toHaveBeenCalled();
    visit.close();
    expect(wake.release).toHaveBeenCalledTimes(1);
  });

  it("refresh re-renders the same place and ignores another one", () => {
    const { visit } = setup(row({ itinerary: "Antigo" }));
    visit.refresh(row({ id: "other", itinerary: "Outro" }));
    expect(visit.element.textContent).toContain("Antigo");
    visit.refresh(row({ itinerary: "Novo" }));
    expect(visit.element.textContent).toContain("Novo");
  });

  it("refresh drops a tab that lost its content", () => {
    const { visit, tab, tabs } = setup(row({ dossier: "x" }));
    tab("História").click();
    visit.refresh(row({ dossier: null }));
    expect(tabs().map((t) => t.textContent?.trim())).toEqual(["Roteiro"]);
    expect(tab("Roteiro").getAttribute("aria-selected")).toBe("true");
  });
});
