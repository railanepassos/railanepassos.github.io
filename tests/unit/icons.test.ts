import { describe, expect, it } from "vitest";
import { resolveIconSrc } from "../../src/links/icons";

describe("resolveIconSrc", () => {
  it("prefers icon_url over preset", () => {
    expect(
      resolveIconSrc({ icon_url: "https://cdn.example.com/i.svg", icon_preset: "github" })
    ).toBe("https://cdn.example.com/i.svg");
  });

  it("uses preset path when no icon_url", () => {
    expect(resolveIconSrc({ icon_preset: "instagram" })).toBe("/assets/icons/instagram.svg");
  });

  it("falls back to external-link", () => {
    expect(resolveIconSrc({})).toBe("/assets/icons/external-link.svg");
  });
});
