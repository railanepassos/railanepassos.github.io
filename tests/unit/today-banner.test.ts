/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dismissKey, isDismissed, renderTodayBanner } from "../../src/links/today-banner";
import type { LinkRow } from "../../src/links/links-repo";

const NOW = new Date(2026, 10, 22, 9, 0, 0);

function row(id: string, label: string, hour: number, status = "wishlist"): LinkRow {
  return {
    id,
    label,
    status,
    scheduled_start: new Date(2026, 10, 22, hour, 0, 0).toISOString(),
  } as unknown as LinkRow;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("renderTodayBanner", () => {
  it("returns null when nothing is scheduled today", () => {
    const other = { ...row("a", "Outro", 10), scheduled_start: new Date(2026, 10, 23, 10).toISOString() } as LinkRow;
    expect(renderTodayBanner([other], NOW, { onOpen: vi.fn() })).toBeNull();
  });

  it("ignores done places", () => {
    expect(renderTodayBanner([row("a", "Feito", 10, "done")], NOW, { onOpen: vi.fn() })).toBeNull();
  });

  it("shows 'Hoje: <label>' for a single visit", () => {
    const banner = renderTodayBanner([row("a", "Museu Teste", 10)], NOW, { onOpen: vi.fn() })!;
    expect(banner.textContent).toContain("Hoje: Museu Teste");
    expect(banner.textContent).not.toContain("+");
  });

  it("uses the earliest visit and counts the others", () => {
    const onOpen = vi.fn();
    const banner = renderTodayBanner(
      [row("b", "Tarde", 16), row("a", "Cedo", 9), row("c", "Noite", 20)],
      NOW,
      { onOpen }
    )!;
    expect(banner.textContent).toContain("Hoje: Cedo");
    expect(banner.textContent).toContain("+2");
    banner.querySelector<HTMLButtonElement>(".links-today__open")!.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]![0].id).toBe("a");
  });

  it("renders user text as text, not HTML", () => {
    const banner = renderTodayBanner([row("a", "<img src=x onerror=alert(1)>", 10)], NOW, { onOpen: vi.fn() })!;
    expect(banner.querySelector("img")).toBeNull();
  });

  it("dismiss hides it for the day, calls onDismiss and is remembered", () => {
    const onDismiss = vi.fn();
    const links = [row("a", "Museu", 10)];
    const banner = renderTodayBanner(links, NOW, { onOpen: vi.fn(), onDismiss })!;
    const dismiss = banner.querySelector<HTMLButtonElement>(".links-today__dismiss")!;
    expect(dismiss.getAttribute("aria-label")).toBe("Dispensar");
    expect(dismiss.querySelector("svg")).not.toBeNull();
    dismiss.click();
    expect(onDismiss).toHaveBeenCalled();
    expect(sessionStorage.getItem(dismissKey(NOW))).toBe("1");
    expect(renderTodayBanner(links, NOW, { onOpen: vi.fn() })).toBeNull();
  });

  it("dismissal is per day", () => {
    sessionStorage.setItem(dismissKey(NOW), "1");
    const tomorrow = new Date(2026, 10, 23, 9);
    const link = { ...row("a", "Museu", 10), scheduled_start: new Date(2026, 10, 23, 10).toISOString() } as LinkRow;
    expect(renderTodayBanner([link], tomorrow, { onOpen: vi.fn() })).not.toBeNull();
  });

  it("survives sessionStorage throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isDismissed(NOW)).toBe(false);
    const banner = renderTodayBanner([row("a", "Museu", 10)], NOW, { onOpen: vi.fn() })!;
    expect(() => banner.querySelector<HTMLButtonElement>(".links-today__dismiss")!.click()).not.toThrow();
  });
});
