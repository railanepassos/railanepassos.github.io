import { describe, expect, it } from "vitest";
import {
  httpsUrlError,
  isHttpsUrl,
  isOptionalHttpsUrl,
  deriveLabelFromUrl,
  normalizeUrlInput,
} from "../../src/links/validate";

describe("normalizeUrlInput", () => {
  it("returns empty for blank input", () => {
    expect(normalizeUrlInput("")).toBe("");
    expect(normalizeUrlInput("   ")).toBe("");
  });

  it("prefixes https when there is no scheme, without adding www", () => {
    expect(normalizeUrlInput("google.com")).toBe("https://google.com");
    expect(normalizeUrlInput("www.x.com")).toBe("https://www.x.com");
    expect(normalizeUrlInput("  example.com/teste?a=1 ")).toBe("https://example.com/teste?a=1");
  });

  it("upgrades http and protocol-relative URLs to https", () => {
    expect(normalizeUrlInput("http://site.com")).toBe("https://site.com");
    expect(normalizeUrlInput("HTTP://site.com/a")).toBe("https://site.com/a");
    expect(normalizeUrlInput("//x.com")).toBe("https://x.com");
  });

  it("keeps https URLs as they are", () => {
    expect(normalizeUrlInput("https://example.com/p")).toBe("https://example.com/p");
  });

  it("leaves unfixable input untouched so validation still fails", () => {
    expect(normalizeUrlInput("not a url")).toBe("not a url");
    expect(normalizeUrlInput("exemplo com.br")).toBe("exemplo com.br");
    expect(normalizeUrlInput("localhost")).toBe("localhost");
    expect(normalizeUrlInput("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(normalizeUrlInput("ftp://x.com")).toBe("ftp://x.com");
    expect(normalizeUrlInput("https://nodot")).toBe("https://nodot");
    expect(normalizeUrlInput("http://nodot")).toBe("http://nodot");
  });

  it("always yields a valid https URL for fixable input", () => {
    for (const raw of ["google.com", "http://a.com", "//b.com/x", "c.org/y"]) {
      expect(isHttpsUrl(normalizeUrlInput(raw))).toBe(true);
    }
  });
});

describe("isOptionalHttpsUrl", () => {
  it("accepts empty values and https URLs", () => {
    expect(isOptionalHttpsUrl(null)).toBe(true);
    expect(isOptionalHttpsUrl(undefined)).toBe(true);
    expect(isOptionalHttpsUrl("")).toBe(true);
    expect(isOptionalHttpsUrl("https://example.com/p")).toBe(true);
  });

  it("rejects non-https values", () => {
    expect(isOptionalHttpsUrl("http://example.com")).toBe(false);
    expect(isOptionalHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isOptionalHttpsUrl("not a url")).toBe(false);
  });
});

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

describe("httpsUrlError", () => {
  it("accepts values that normalize to https", () => {
    expect(httpsUrlError("google.com", "Link do post")).toBeNull();
    expect(httpsUrlError("http://example.com", "Link do post")).toBeNull();
  });

  it("returns null for empty and https values", () => {
    expect(httpsUrlError("", "Link do post")).toBeNull();
    expect(httpsUrlError("https://example.com/p/1", "Link do post")).toBeNull();
  });

  it("names the field when the value is not https", () => {
    expect(httpsUrlError("ftp://example.com", "Link do post")).toBe(
      "Link do post inválido."
    );
    expect(httpsUrlError("javascript:alert(1)", "Link do post")).not.toBeNull();
    expect(httpsUrlError("not a url", "Foto")).toBe("Foto inválido.");
  });
});
