// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifestPath = fileURLToPath(
  new URL("../../p/a8f3k2/manifest.json", import.meta.url)
);
const indexHtmlPath = fileURLToPath(
  new URL("../../p/a8f3k2/index.html", import.meta.url)
);

describe("links admin PWA manifest", () => {
  it("declares a GET share_target scoped to the admin page", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.start_url).toBe("/p/a8f3k2/");
    expect(manifest.scope).toBe("/p/a8f3k2/");
    expect(manifest.share_target).toEqual({
      action: "/p/a8f3k2/",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    });
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("is linked from the admin page head", () => {
    const html = readFileSync(indexHtmlPath, "utf8");
    expect(html).toContain(
      '<link rel="manifest" href="/p/a8f3k2/manifest.json">'
    );
  });
});
