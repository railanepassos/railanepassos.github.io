import { describe, expect, it } from "vitest";
import {
  categoryBackdropSrc,
  categoryCardClass,
} from "../../src/links/card-theme";

describe("categoryCardClass", () => {
  it("returns BEM modifier for category", () => {
    expect(categoryCardClass("trilha")).toBe("link-card--cat-trilha");
    expect(categoryCardClass("museu")).toBe("link-card--cat-museu");
  });
});

describe("categoryBackdropSrc", () => {
  it("prefers https image_url", () => {
    expect(
      categoryBackdropSrc("trilha", "https://cdn.example.com/photo.jpg")
    ).toBe("https://cdn.example.com/photo.jpg");
  });

  it("falls back to trilha stock art", () => {
    expect(categoryBackdropSrc("trilha", null)).toBe(
      "/assets/img/categories/trilha.jpg"
    );
  });

  it("falls back to museu stock art", () => {
    expect(categoryBackdropSrc("museu", null)).toBe(
      "/assets/img/categories/museu.jpg"
    );
  });

  it("falls back to praia stock art", () => {
    expect(categoryBackdropSrc("praia", null)).toBe(
      "/assets/img/categories/praia.jpg"
    );
  });

  it("falls back to restaurante stock art", () => {
    expect(categoryBackdropSrc("restaurante", null)).toBe(
      "/assets/img/categories/restaurante.jpg"
    );
  });

  it("falls back to bar stock art", () => {
    expect(categoryBackdropSrc("bar", null)).toBe(
      "/assets/img/categories/bar.jpg"
    );
  });

  it("falls back to cafeteria stock art", () => {
    expect(categoryBackdropSrc("cafeteria", null)).toBe(
      "/assets/img/categories/cafeteria.jpg"
    );
  });

  it("falls back to praca stock art", () => {
    expect(categoryBackdropSrc("praca", null)).toBe(
      "/assets/img/categories/praca.jpg"
    );
  });

  it("falls back to parque stock art", () => {
    expect(categoryBackdropSrc("parque", null)).toBe(
      "/assets/img/categories/parque.jpg"
    );
  });

  it("falls back to evento stock art", () => {
    expect(categoryBackdropSrc("evento", null)).toBe(
      "/assets/img/categories/evento.jpg"
    );
  });

  it("falls back to ponto-turistico / passeio stock art", () => {
    expect(categoryBackdropSrc("ponto-turistico", null)).toBe(
      "/assets/img/categories/ponto-turistico.jpg"
    );
    expect(categoryBackdropSrc("passeio", null)).toBe(
      "/assets/img/categories/ponto-turistico.jpg"
    );
  });

  it("falls back to outro stock art", () => {
    expect(categoryBackdropSrc("outro", null)).toBe(
      "/assets/img/categories/outro.jpg"
    );
  });
});
