import { describe, expect, it } from "vitest";
import { composeEditorEmail, EDITOR_EMAIL_DOMAIN } from "../../src/links/editor-email";

describe("composeEditorEmail", () => {
  it("appends @wte.com to a local-part", () => {
    expect(composeEditorEmail("Hailane")).toBe(`Hailane@${EDITOR_EMAIL_DOMAIN}`);
  });

  it("trims whitespace before appending", () => {
    expect(composeEditorEmail("  editor  ")).toBe(`editor@${EDITOR_EMAIL_DOMAIN}`);
  });

  it("returns empty string for blank input", () => {
    expect(composeEditorEmail("")).toBe("");
    expect(composeEditorEmail("   ")).toBe("");
  });

  it("ignores any typed domain and always uses @wte.com", () => {
    expect(composeEditorEmail("Hailane@wte.com")).toBe(`Hailane@${EDITOR_EMAIL_DOMAIN}`);
    expect(composeEditorEmail("Hailane@example.com")).toBe(`Hailane@${EDITOR_EMAIL_DOMAIN}`);
  });

  it("returns empty when only @domain is typed", () => {
    expect(composeEditorEmail("@wte.com")).toBe("");
  });
});
