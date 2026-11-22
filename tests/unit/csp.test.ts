// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const html: string = readFileSync(
  fileURLToPath(new URL("../../p/a8f3k2/index.html", import.meta.url)),
  "utf8"
);
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
const directive = (name: string): string[] =>
  (csp.split(";").map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name) ?? []).slice(1);

describe("CSP of the private links app", () => {
  it("connect-src allows only self, Supabase and pt.wikipedia.org (Buscar imagem)", () => {
    expect(directive("connect-src")).toEqual(["'self'", "https://*.supabase.co", "https://pt.wikipedia.org"]);
  });
  it("scripts and styles stay locked to self", () => {
    expect(directive("script-src")).toEqual(["'self'"]);
    expect(directive("style-src")).toEqual(["'self'"]);
  });
  it("img-src still covers upload.wikimedia.org through https:", () => {
    expect(directive("img-src")).toContain("https:");
  });
});
