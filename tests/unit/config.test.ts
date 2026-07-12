import { describe, expect, it } from "vitest";
import { getSupabaseConfig, isSupabaseConfigured } from "../../src/links/config";

describe("getSupabaseConfig", () => {
  it("returns object with url and anonKey keys", () => {
    const config = getSupabaseConfig();
    expect(config).toHaveProperty("url");
    expect(config).toHaveProperty("anonKey");
  });

  it("returns strings (possibly empty) for both fields", () => {
    const config = getSupabaseConfig();
    expect(typeof config.url).toBe("string");
    expect(typeof config.anonKey).toBe("string");
  });
});

describe("isSupabaseConfigured", () => {
  it("returns true when both fields are non-empty", () => {
    expect(
      isSupabaseConfigured({
        url: "https://abc.supabase.co",
        anonKey: "some-anon-key",
      })
    ).toBe(true);
  });

  it("returns false when url is empty", () => {
    expect(
      isSupabaseConfigured({ url: "", anonKey: "some-anon-key" })
    ).toBe(false);
  });

  it("returns false when anonKey is empty", () => {
    expect(
      isSupabaseConfigured({ url: "https://abc.supabase.co", anonKey: "" })
    ).toBe(false);
  });

  it("returns false when both fields are empty", () => {
    expect(isSupabaseConfigured({ url: "", anonKey: "" })).toBe(false);
  });
});
