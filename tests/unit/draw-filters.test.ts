import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAW_FILTERS,
  applyDrawFilters,
  drawCities,
  hasActiveDrawFilters,
  type DrawFilters,
} from "../../src/links/draw-filters";

type L = {
  label: string;
  cost_text?: string | null;
  city?: string | null;
  tags?: string[] | null;
  duration?: string | null;
};

const f = (patch: Partial<DrawFilters>): DrawFilters => ({ ...EMPTY_DRAW_FILTERS, ...patch });
const names = (links: L[]) => links.map((l) => l.label);

describe("applyDrawFilters", () => {
  const links: L[] = [
    { label: "barato", cost_text: "R$ 20" },
    { label: "caro", cost_text: "R$ 200,50" },
    { label: "milhar", cost_text: "R$ 1.200" },
    { label: "gratis", cost_text: "Grátis" },
    { label: "entrada", cost_text: "Entrada franca" },
    { label: "gratuito", cost_text: "gratuito" },
    { label: "gratuita", cost_text: "Visita GRATUITA" },
    { label: "sem-custo", cost_text: null },
    { label: "vazio", cost_text: "  " },
    { label: "a-combinar", cost_text: "a combinar" },
  ];

  it("keeps everything with no filter", () => {
    expect(applyDrawFilters(links, EMPTY_DRAW_FILTERS)).toHaveLength(links.length);
  });

  it("cost max is inclusive, understands pt-BR numbers, keeps free and unknown", () => {
    expect(names(applyDrawFilters(links, f({ costMax: 20 })))).toEqual([
      "barato",
      "gratis",
      "entrada",
      "gratuito",
      "gratuita",
      "sem-custo",
      "vazio",
      "a-combinar",
    ]);
    expect(names(applyDrawFilters(links, f({ costMax: 1200 })))).toContain("milhar");
    expect(names(applyDrawFilters(links, f({ costMax: 1199 })))).not.toContain("milhar");
  });

  it("cost 0 keeps only free words and unknown", () => {
    expect(names(applyDrawFilters(links, f({ costMax: 0 })))).toEqual([
      "gratis",
      "entrada",
      "gratuito",
      "gratuita",
      "sem-custo",
      "vazio",
      "a-combinar",
    ]);
  });

  it("city matches ignoring accents and case; items without city are out", () => {
    const cities: L[] = [
      { label: "a", city: "São Paulo" },
      { label: "b", city: "sao paulo" },
      { label: "c", city: "Salvador" },
      { label: "d", city: null },
    ];
    expect(names(applyDrawFilters(cities, f({ city: "SÃO PAULO" })))).toEqual(["a", "b"]);
  });

  it("tags: every tag must match (accent/case-insensitive)", () => {
    const tagged: L[] = [
      { label: "a", tags: ["praia", "Família"] },
      { label: "b", tags: ["praia"] },
      { label: "c", tags: null },
    ];
    expect(names(applyDrawFilters(tagged, f({ tags: ["praia"] })))).toEqual(["a", "b"]);
    expect(names(applyDrawFilters(tagged, f({ tags: ["praia", "familia"] })))).toEqual(["a"]);
  });

  it("duration fits in the chosen time; unknown is kept", () => {
    const timed: L[] = [
      { label: "rapido", duration: "rapido" },
      { label: "meio", duration: "meio-periodo" },
      { label: "dia", duration: "dia-inteiro" },
      { label: "sem", duration: null },
    ];
    expect(names(applyDrawFilters(timed, f({ duration: "rapido" })))).toEqual(["rapido", "sem"]);
    expect(names(applyDrawFilters(timed, f({ duration: "meio-periodo" })))).toEqual([
      "rapido",
      "meio",
      "sem",
    ]);
    expect(applyDrawFilters(timed, f({ duration: "dia-inteiro" }))).toHaveLength(4);
  });

  it("combines every filter (AND)", () => {
    const mix: L[] = [
      { label: "ok", cost_text: "R$ 10", city: "Recife", tags: ["praia"], duration: "rapido" },
      { label: "caro", cost_text: "R$ 99", city: "Recife", tags: ["praia"], duration: "rapido" },
      { label: "outra", cost_text: "R$ 10", city: "Olinda", tags: ["praia"], duration: "rapido" },
      { label: "sem-tag", cost_text: "R$ 10", city: "Recife", tags: [], duration: "rapido" },
      { label: "longo", cost_text: "R$ 10", city: "Recife", tags: ["praia"], duration: "dia-inteiro" },
    ];
    const filters = f({ costMax: 50, city: "recife", tags: ["praia"], duration: "meio-periodo" });
    expect(names(applyDrawFilters(mix, filters))).toEqual(["ok"]);
  });
});

describe("drawCities", () => {
  it("lists known cities once (by folded key), sorted, first display form wins", () => {
    const cities = drawCities([
      { city: "São Paulo" },
      { city: "sao paulo" },
      { city: "Belém" },
      { city: null },
      { city: " " },
    ]);
    expect(cities).toEqual(["Belém", "São Paulo"]);
  });
});

describe("hasActiveDrawFilters", () => {
  it("is false for the empty filters and true when any is set", () => {
    expect(hasActiveDrawFilters(EMPTY_DRAW_FILTERS)).toBe(false);
    expect(hasActiveDrawFilters(f({ costMax: 0 }))).toBe(true);
    expect(hasActiveDrawFilters(f({ city: "x" }))).toBe(true);
    expect(hasActiveDrawFilters(f({ tags: ["a"] }))).toBe(true);
    expect(hasActiveDrawFilters(f({ duration: "rapido" }))).toBe(true);
  });
});
