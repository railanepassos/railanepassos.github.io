import { describe, expect, it } from "vitest";
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  inferCategory,
  resolveCategory,
} from "../../src/links/category";

describe("inferCategory", () => {
  it("detects museu from title", () => {
    expect(
      inferCategory({
        label: "Museu do Mar",
        description: "teste",
        url: "https://www.instagram.com/museudomar.aleixobelov/",
      })
    ).toBe("museu");
  });

  it("detects evento from show/festival", () => {
    expect(inferCategory({ label: "Show no parque", description: null })).toBe(
      "evento"
    );
    expect(inferCategory({ label: "Festival de inverno", description: "" })).toBe(
      "evento"
    );
  });

  it("detects restaurante", () => {
    expect(
      inferCategory({ label: "Almoço", description: "restaurante à beira-mar" })
    ).toBe("restaurante");
  });

  it("detects barzinho / bar", () => {
    expect(
      inferCategory({ label: "O Cravinho", description: "barzinho no centro" })
    ).toBe("bar");
    expect(inferCategory({ label: "Boteco da esquina", description: null })).toBe(
      "bar"
    );
  });

  it("detects cafeteria", () => {
    expect(inferCategory({ label: "Cafélier", description: null })).toBe(
      "cafeteria"
    );
    expect(
      inferCategory({ label: "Brunch", description: "cafeteria aconchegante" })
    ).toBe("cafeteria");
  });

  it("does not treat barco as bar", () => {
    expect(
      inferCategory({ label: "Passeio de barco", description: "Larissa" })
    ).toBe("passeio");
  });

  it("detects trilha from note", () => {
    expect(
      inferCategory({
        label: "Chapada",
        description: "trilha leve de manhã",
        url: "https://example.com/x",
      })
    ).toBe("trilha");
  });

  it("detects praca ignoring accents", () => {
    expect(inferCategory({ label: "Praça da Sé", description: null })).toBe(
      "praca"
    );
  });

  it("detects parque", () => {
    expect(
      inferCategory({ label: "Parque da Cidade", description: null })
    ).toBe("parque");
  });

  it("detects praia", () => {
    expect(inferCategory({ label: "Praia do Francês", description: null })).toBe(
      "praia"
    );
  });

  it("detects passeio", () => {
    expect(
      inferCategory({ label: "Passeio de barco", description: "Larissa" })
    ).toBe("passeio");
  });

  it("falls back to outro when nothing matches", () => {
    expect(
      inferCategory({
        label: "Algo aleatório",
        description: "sem pistas",
        url: "https://example.com/x",
      })
    ).toBe("outro");
  });

  it("prefers museu over later generic words", () => {
    expect(
      inferCategory({
        label: "Museu",
        description: "passeio legal",
      })
    ).toBe("museu");
  });
});

describe("resolveCategory", () => {
  it("uses stored category when present", () => {
    expect(
      resolveCategory({
        label: "X",
        category: "praia",
        description: "museu escondido",
      })
    ).toBe("praia");
  });

  it("infers when category is null", () => {
    expect(
      resolveCategory({ label: "Museu X", category: null, description: null })
    ).toBe("museu");
  });
});

describe("categoryLabel", () => {
  it("returns Portuguese labels for known categories", () => {
    expect(categoryLabel("museu")).toBe("Museu");
    expect(categoryLabel("ponto-turistico")).toBe("Ponto turístico");
  });

  it("lists closed option set", () => {
    expect(CATEGORY_OPTIONS).toContain("museu");
    expect(CATEGORY_OPTIONS).toContain("outro");
  });
});
