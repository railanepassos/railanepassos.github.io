// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  renderMemoriesSwitch,
  renderMemoriesTimeline,
  truncateImpressions,
} from "../../src/links/memories-ui";
import type { LinkRow } from "../../src/links/links-repo";

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "id",
    url: "https://example.com",
    label: "Museu do Mar",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
    sort_order: 0,
    scheduled_start: null,
    scheduled_end: null,
    status: "done",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: "2026-11-10T15:00:00Z",
    ...partial,
  };
}

describe("truncateImpressions", () => {
  it("keeps short text and collapses whitespace", () => {
    expect(truncateImpressions("  boa\n\n tarde ")).toBe("boa tarde");
  });
  it("cuts long text at a word boundary with an ellipsis", () => {
    const out = truncateImpressions("palavra ".repeat(40), 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });
});

describe("renderMemoriesTimeline", () => {
  it("shows the empty state when there are no dated done items", () => {
    const el = renderMemoriesTimeline([row({ completed_at: null })], { onView: vi.fn() });
    expect(el.textContent).toContain("Nenhuma memória ainda");
    expect(el.querySelector(".links-memory")).toBeNull();
  });

  it("renders year, month, name, rating, impressions and the video action as text", () => {
    const onView = vi.fn();
    const link = row({
      rating: 4,
      impressions: "<b>Lindo</b> passeio",
      memory_url: "https://youtu.be/dQw4w9WgXcQ",
    });
    const el = renderMemoriesTimeline([link], { onView });
    expect(el.querySelector(".links-memories__year-title")?.textContent).toBe("2026");
    expect(el.querySelector(".links-memories__month-title")?.textContent).toBe("Novembro");
    expect(el.querySelector(".links-memory__impressions")?.textContent).toBe(
      "<b>Lindo</b> passeio"
    );
    expect(el.querySelector(".links-memory__impressions b")).toBeNull();
    expect(el.querySelector(".links-memory__rating")?.textContent).toContain("4/5");
    const action = el.querySelector<HTMLAnchorElement>("[data-action=open-memory]");
    expect(action?.textContent).toContain("Assistir");
    expect(action?.target).toBe("_blank");
    el.querySelector<HTMLButtonElement>(".links-memory__open")!.click();
    expect(onView).toHaveBeenCalledWith(link);
  });

  it("shows Ver álbum for non-video links", () => {
    const el = renderMemoriesTimeline([row({ memory_url: "https://photos.app.goo.gl/x" })], {
      onView: vi.fn(),
    });
    expect(el.querySelector("[data-action=open-memory]")?.textContent).toContain("Ver álbum");
  });
});

describe("anniversary highlight", () => {
  const now = new Date("2026-11-17T12:00:00");

  it("lists Há 1 ano / Há N anos with name and date, and opens the detail", () => {
    const one = row({ id: "a", label: "Forte <i>X</i>", completed_at: "2025-11-15T15:00:00" });
    const three = row({ id: "b", label: "Praia", completed_at: "2023-11-19T15:00:00" });
    const onView = vi.fn();
    const el = renderMemoriesTimeline([one, three], { onView }, now);
    const items = el.querySelectorAll(".links-anniversary__item");
    expect(items).toHaveLength(2);
    expect(items[0]!.querySelector(".links-anniversary__years")?.textContent).toBe("Há 1 ano");
    expect(items[1]!.querySelector(".links-anniversary__years")?.textContent).toBe("Há 3 anos");
    expect(items[0]!.querySelector(".links-anniversary__name")?.textContent).toBe("Forte <i>X</i>");
    expect(items[0]!.querySelector("i")).toBeNull();
    expect(items[0]!.querySelector(".links-anniversary__date")?.textContent).toContain("2025");
    items[1]!.querySelector<HTMLButtonElement>(".links-anniversary__open")!.click();
    expect(onView).toHaveBeenCalledWith(three);
    expect(el.firstElementChild?.classList.contains("links-anniversary")).toBe(true);
  });

  it("is hidden when nothing is near today", () => {
    const el = renderMemoriesTimeline(
      [row({ completed_at: "2025-03-10T15:00:00" })],
      { onView: vi.fn() },
      now
    );
    expect(el.querySelector(".links-anniversary")).toBeNull();
  });
});

describe("renderMemoriesSwitch", () => {
  it("marks the active view and calls the handlers", () => {
    const onList = vi.fn();
    const onMemories = vi.fn();
    const el = renderMemoriesSwitch("memories", { onList, onMemories });
    expect(el.querySelector("[data-view=memories]")?.getAttribute("aria-pressed")).toBe("true");
    el.querySelector<HTMLButtonElement>("[data-view=done]")!.click();
    expect(onList).toHaveBeenCalled();
  });
});

describe("anniversary highlight source", () => {
  it("uses the full list, not the filtered timeline", () => {
    const now = new Date("2026-11-10T12:00:00-03:00");
    const old = row({ id: "old", label: "Passeio antigo", completed_at: "2024-11-10T15:00:00-03:00" });
    const shown = row({ id: "new", label: "Outro", completed_at: "2026-05-01T15:00:00-03:00" });
    const el = renderMemoriesTimeline([shown], { onView: vi.fn() }, now, [old, shown]);
    expect(el.querySelector(".links-anniversary")?.textContent).toContain("Passeio antigo");
    expect(el.querySelector(".links-memories")?.textContent ?? el.textContent).toContain("Outro");
    expect(el.querySelectorAll(".links-memory")).toHaveLength(1);
  });
});
