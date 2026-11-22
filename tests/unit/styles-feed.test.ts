// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// `.links-feed` is the card grid. A sheet that reused the class (Phase 10) put
// a later `display: flex; flex-direction: column` rule over the desktop grid
// and turned the feed into one huge card per row.
describe("styles.css: .links-feed belongs to the card grid only", () => {
  const css = readFileSync(fileURLToPath(new URL("../../styles.css", import.meta.url)), "utf8");

  it("has exactly the mobile rule and the desktop grid rule", () => {
    const rules = css.match(/^\s*\.links-feed\s*\{[^}]*\}/gm) ?? [];
    expect(rules).toHaveLength(2);
    expect(rules[1]).toMatch(/display:\s*grid/);
  });
});
