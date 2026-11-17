/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { countLabel, createDrawFilterSheet } from "../../src/links/draw-sheet";

type P = {
  label: string;
  cost_text?: string | null;
  city?: string | null;
  tags?: string[] | null;
  duration?: string | null;
};

const POOL: P[] = [
  { label: "a", cost_text: "R$ 10", city: "Recife", tags: ["praia"], duration: "rapido" },
  { label: "b", cost_text: "R$ 90", city: "Olinda", tags: ["praia", "familia"], duration: "dia-inteiro" },
  { label: "c", cost_text: null, city: "São Paulo", tags: [], duration: null },
];

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

function setup(pool: P[] = POOL) {
  const onDraw = vi.fn();
  const sheet = createDrawFilterSheet<P>({ getPool: () => pool, onDraw });
  document.body.append(sheet.element);
  sheet.open();
  const q = <T extends HTMLElement>(s: string) => sheet.element.querySelector<T>(s)!;
  const buttons = () => [...sheet.element.querySelectorAll<HTMLButtonElement>("button")];
  const byText = (t: string) => buttons().find((b) => b.textContent === t)!;
  return { sheet, onDraw, q, byText };
}

describe("countLabel", () => {
  it("pluralizes", () => {
    expect(countLabel(0)).toBe("0 lugares no sorteio");
    expect(countLabel(1)).toBe("1 lugar no sorteio");
    expect(countLabel(5)).toBe("5 lugares no sorteio");
  });
});

describe("draw filter sheet", () => {
  it("starts with the whole pool and Limpar disabled", () => {
    const { q, byText } = setup();
    expect(q("[role=status]").textContent).toBe("3 lugares no sorteio");
    expect(byText("Limpar filtros").disabled).toBe(true);
  });

  it("updates the live count as filters change and clears them", () => {
    const { q, byText, sheet } = setup();
    const cost = q<HTMLInputElement>("#links-draw-cost");
    cost.value = "20";
    cost.dispatchEvent(new Event("input"));
    expect(q("[role=status]").textContent).toBe("2 lugares no sorteio");

    byText("#praia").click();
    expect(q("[role=status]").textContent).toBe("1 lugar no sorteio");
    expect(sheet.getFilters().tags).toEqual(["praia"]);

    byText("Limpar filtros").click();
    expect(q("[role=status]").textContent).toBe("3 lugares no sorteio");
    expect(sheet.getFilters().costMax).toBeNull();
  });

  it("disables Sortear at zero and does not draw", () => {
    const { q, byText, onDraw } = setup();
    const city = q<HTMLSelectElement>("#links-draw-city");
    city.value = "Olinda";
    city.dispatchEvent(new Event("change"));
    const cost = q<HTMLInputElement>("#links-draw-cost");
    cost.value = "5";
    cost.dispatchEvent(new Event("input"));
    expect(q("[role=status]").textContent).toBe("0 lugares no sorteio");
    expect(byText("Sortear").disabled).toBe(true);
    byText("Sortear").click();
    expect(onDraw).not.toHaveBeenCalled();
  });

  it("keeps filters after closing and reopening, and draws on Sortear", () => {
    const { q, byText, sheet, onDraw } = setup();
    const duration = q<HTMLSelectElement>("#links-draw-duration");
    duration.value = "rapido";
    duration.dispatchEvent(new Event("change"));
    sheet.close();
    expect(sheet.element.hidden).toBe(true);
    sheet.open();
    expect(q<HTMLSelectElement>("#links-draw-duration").value).toBe("rapido");
    expect(q("[role=status]").textContent).toBe("2 lugares no sorteio");
    byText("Sortear").click();
    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(sheet.element.hidden).toBe(true);
  });
});
