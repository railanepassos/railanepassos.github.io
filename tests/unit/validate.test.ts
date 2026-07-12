import { describe, expect, it } from "vitest";
import { isHttpsUrl, deriveLabelFromUrl } from "../../src/links/validate";

describe("isHttpsUrl", () => {
  it("accepts https URLs", () => {
    expect(isHttpsUrl("https://example.com")).toBe(true);
  });

  it("rejects http and garbage", () => {
    expect(isHttpsUrl("http://example.com")).toBe(false);
    expect(isHttpsUrl("not-a-url")).toBe(false);
    expect(isHttpsUrl("")).toBe(false);
  });
});

describe("deriveLabelFromUrl", () => {
  it("strips a leading www. from the hostname", () => {
    expect(deriveLabelFromUrl("https://www.example.com/path?x=1")).toBe("example.com");
  });

  it("returns the hostname as-is when there is no www.", () => {
    expect(deriveLabelFromUrl("https://instagram.com/p/xyz")).toBe("instagram.com");
  });

  it("returns an empty string for an unparsable url", () => {
    expect(deriveLabelFromUrl("not-a-url")).toBe("");
  });
});
