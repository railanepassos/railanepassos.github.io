import { describe, expect, it } from "vitest";
import { buildMapUrl } from "../../src/links/map-url";

describe("buildMapUrl", () => {
  it("builds a Google Maps search URL from address and city", () => {
    expect(buildMapUrl("Rua Exemplo, 100", "Cidade Modelo")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Rua%20Exemplo%2C%20100%2C%20Cidade%20Modelo"
    );
  });

  it("uses only the city when there is no address", () => {
    expect(buildMapUrl(null, "Cidade Modelo")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Cidade%20Modelo"
    );
  });

  it("uses only the address when there is no city", () => {
    expect(buildMapUrl("Av. Exemplo 5", "")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Av.%20Exemplo%205"
    );
  });

  it("returns null when both are empty or blank", () => {
    expect(buildMapUrl(null, null)).toBeNull();
    expect(buildMapUrl("  ", "")).toBeNull();
  });

  it("encodes characters that would break out of the query", () => {
    expect(buildMapUrl("A&B #1", "X=Y")).toBe(
      "https://www.google.com/maps/search/?api=1&query=A%26B%20%231%2C%20X%3DY"
    );
  });
});
