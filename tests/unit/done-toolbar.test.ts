// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderDoneToolbar } from "../../src/links/done-toolbar";

function handlers() {
  return { onRanking: vi.fn(), onWantAgain: vi.fn(), onMinRating: vi.fn() };
}

describe("renderDoneToolbar", () => {
  it("renders pressed state and the current minimum", () => {
    const bar = renderDoneToolbar({ ranking: true, wantAgain: false, minRating: 4 }, handlers());
    const [ranking, , voltaria] = [...bar.children] as HTMLElement[];
    expect(ranking!.getAttribute("aria-pressed")).toBe("true");
    expect(voltaria!.getAttribute("aria-pressed")).toBe("false");
    expect((bar.querySelector("select") as HTMLSelectElement).value).toBe("4");
  });

  it("emits the toggled values", () => {
    const h = handlers();
    const bar = renderDoneToolbar({ ranking: false, wantAgain: false }, h);
    const buttons = bar.querySelectorAll("button");
    buttons[0]!.click();
    buttons[1]!.click();
    expect(h.onRanking).toHaveBeenCalledWith(true);
    expect(h.onWantAgain).toHaveBeenCalledWith(true);
    const select = bar.querySelector("select") as HTMLSelectElement;
    select.value = "3";
    select.dispatchEvent(new Event("change"));
    expect(h.onMinRating).toHaveBeenCalledWith(3);
    select.value = "";
    select.dispatchEvent(new Event("change"));
    expect(h.onMinRating).toHaveBeenCalledWith(null);
  });
});
