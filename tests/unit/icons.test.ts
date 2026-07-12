import { describe, expect, it } from "vitest";
import { inferIconPreset, resolveIconSrc } from "../../src/links/icons";

describe("inferIconPreset", () => {
  it("detects Instagram hosts", () => {
    expect(inferIconPreset("https://www.instagram.com/p/abc/")).toBe("instagram");
    expect(inferIconPreset("https://instagr.am/p/abc")).toBe("instagram");
  });

  it("detects GitHub hosts", () => {
    expect(inferIconPreset("https://github.com/org/repo")).toBe("github");
  });

  it("detects LinkedIn hosts", () => {
    expect(inferIconPreset("https://www.linkedin.com/in/someone")).toBe("linkedin");
    expect(inferIconPreset("https://lnkd.in/abc")).toBe("linkedin");
  });

  it("detects YouTube hosts", () => {
    expect(inferIconPreset("https://www.youtube.com/watch?v=1")).toBe("youtube");
    expect(inferIconPreset("https://youtu.be/1")).toBe("youtube");
  });

  it("detects Google hosts", () => {
    expect(inferIconPreset("https://maps.google.com/?q=paris")).toBe("google");
    expect(inferIconPreset("https://www.google.com/maps")).toBe("google");
  });

  it("falls back to external-link for unknown hosts", () => {
    expect(inferIconPreset("https://example.com/place")).toBe("external-link");
  });

  it("is case-insensitive and tolerates invalid URLs via regex", () => {
    expect(inferIconPreset("HTTPS://GitHub.COM/x")).toBe("github");
  });
});

describe("resolveIconSrc", () => {
  it("prefers icon_url over preset", () => {
    expect(
      resolveIconSrc({
        icon_url: "https://cdn.example.com/i.svg",
        icon_preset: "github",
      })
    ).toBe("https://cdn.example.com/i.svg");
  });

  it("uses preset path when no icon_url", () => {
    expect(resolveIconSrc({ icon_preset: "instagram" })).toBe(
      "/assets/icons/instagram.svg"
    );
  });

  it("infers from url when preset and icon_url are missing", () => {
    expect(resolveIconSrc({ url: "https://github.com/a/b" })).toBe(
      "/assets/icons/github.svg"
    );
  });

  it("falls back to external-link", () => {
    expect(resolveIconSrc({})).toBe("/assets/icons/external-link.svg");
  });

  it("maps google preset to google icon path", () => {
    expect(resolveIconSrc({ icon_preset: "google" })).toBe(
      "/assets/icons/google.svg"
    );
  });
});
