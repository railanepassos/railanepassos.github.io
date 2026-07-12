import { describe, expect, it } from "vitest";
import { isHttpsUrl } from "../../src/links/validate";

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
