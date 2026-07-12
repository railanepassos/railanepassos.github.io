import { describe, expect, it } from "vitest";
import { pickSharedUrl } from "../../src/links/share-target";

describe("pickSharedUrl", () => {
  it("uses the url param directly when it's a valid https URL", () => {
    const params = new URLSearchParams({ url: "https://example.com/post" });
    expect(pickSharedUrl(params)).toBe("https://example.com/post");
  });

  it("extracts a URL embedded in text when url is absent", () => {
    const params = new URLSearchParams({
      text: "Olha isso: https://instagram.com/p/abc123 incrível!",
    });
    expect(pickSharedUrl(params)).toBe("https://instagram.com/p/abc123");
  });

  it("falls back to title when text has no URL", () => {
    const params = new URLSearchParams({
      title: "Confira https://maps.example.com/place",
      text: "sem link aqui",
    });
    expect(pickSharedUrl(params)).toBe("https://maps.example.com/place");
  });

  it("returns null when nothing has a usable https URL", () => {
    const params = new URLSearchParams({
      text: "sem nenhum link",
      title: "também sem link",
    });
    expect(pickSharedUrl(params)).toBeNull();
  });

  it("ignores a non-https url param and still checks text", () => {
    const params = new URLSearchParams({
      url: "http://insecure.example.com",
      text: "mas tem https://secure.example.com aqui",
    });
    expect(pickSharedUrl(params)).toBe("https://secure.example.com");
  });
});
