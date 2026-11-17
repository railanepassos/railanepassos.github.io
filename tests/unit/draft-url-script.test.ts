// @ts-expect-error node:child_process is available at runtime via vitest/node environment
import { spawnSync } from "node:child_process";
// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDraft } from "../../src/links/draft";

const path = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const ROOT = path("../..");
const SCRIPT = path("../../scripts/draft-url.mjs");
const EXAMPLES = path("../../.claude/skills/bucket-list/examples");
const BASE = "https://railanepassos.tec.br/p/a8f3k2/";

function run(args: string[], input?: string) {
  const res = spawnSync(
    // @ts-expect-error process is available at runtime
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", SCRIPT, ...args],
    { input, encoding: "utf8", cwd: ROOT },
  );
  return { code: res.status as number | null, out: String(res.stdout).trim(), err: String(res.stderr) };
}

const VALID = {
  v: 1,
  kind: "novo",
  fields: { url: "https://example.com/lugar", label: "Café do Açaí ☕", tags: ["café", "centro"] },
};

describe("scripts/draft-url.mjs", () => {
  it("prints a URL whose fragment decodes through parseDraft to the same draft", () => {
    const { code, out } = run([], JSON.stringify(VALID));
    expect(code).toBe(0);
    expect(out.startsWith(BASE + "#rascunho=")).toBe(true);
    const parsed = parseDraft(out.slice(BASE.length));
    expect(parsed).toEqual({ ok: true, draft: VALID });
  });

  it("reads a file argument", () => {
    const { code, out } = run([`${EXAMPLES}/novo.json`]);
    expect(code).toBe(0);
    expect(out.startsWith(BASE + "#rascunho=")).toBe(true);
  });

  it.each([
    ["broken JSON", "{nope"],
    ["unknown key", JSON.stringify({ ...VALID, extra: 1 })],
    ["http url", JSON.stringify({ ...VALID, fields: { url: "http://example.com" } })],
    ["unknown category", JSON.stringify({ ...VALID, fields: { url: "https://a.com", category: "x" } })],
    ["oversize", JSON.stringify({ ...VALID, fields: { url: "https://a.com", dossier: "x".repeat(6000) } })],
  ])("exits non-zero with a message for %s", (_name, input) => {
    const { code, out, err } = run([], input);
    expect(code).not.toBe(0);
    expect(out).toBe("");
    expect(err).not.toBe("");
  });

  it("accepts fields.categories and rejects it together with category", () => {
    const ok = run([], JSON.stringify({ ...VALID, fields: { url: "https://a.com", categories: ["museu", "parque"] } }));
    expect(ok.code).toBe(0);
    const both = run(
      [],
      JSON.stringify({ ...VALID, fields: { url: "https://a.com", category: "museu", categories: ["parque"] } }),
    );
    expect(both.code).not.toBe(0);
    expect(both.err).toContain("categories");
  });

  it("accepts fields.sources and rejects a non-https source", () => {
    const f = (sources: unknown) => JSON.stringify({ ...VALID, fields: { url: "https://a.com", sources } });
    expect(run([], f([{ title: "Guia", url: "https://example.com/guia" }])).code).toBe(0);
    const bad = run([], f([{ title: "Guia", url: "http://example.com/guia" }]));
    expect(bad.code).not.toBe(0);
    expect(bad.err).toContain("sources");
  });

  it("accepts fields.duration and rejects an unknown value", () => {
    const f = (duration: unknown) => JSON.stringify({ ...VALID, fields: { url: "https://a.com", duration } });
    expect(run([], f("meio-periodo")).code).toBe(0);
    const bad = run([], f("Meio período"));
    expect(bad.code).not.toBe(0);
    expect(bad.err).toContain("duration");
  });

  it("exits non-zero when the file does not exist", () => {
    expect(run(["/nonexistent/draft.json"]).code).not.toBe(0);
  });
});

describe("bucket-list skill examples", () => {
  it.each(["novo.json", "atualizacao.json"])("%s is accepted by the script", (name) => {
    const file = `${EXAMPLES}/${name}`;
    const { code, out } = run([file]);
    expect(code).toBe(0);
    const parsed = parseDraft(out.slice(BASE.length));
    expect(parsed).toEqual({ ok: true, draft: JSON.parse(readFileSync(file, "utf8")) });
  });
});
