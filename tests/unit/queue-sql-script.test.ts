// @ts-expect-error node:child_process is available at runtime via vitest/node environment
import { spawnSync } from "node:child_process";
// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { mkdtempSync, writeFileSync } from "node:fs";
// @ts-expect-error node:os is available at runtime via vitest/node environment
import { tmpdir } from "node:os";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const path = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const ROOT = path("../..");
const SCRIPT = path("../../scripts/queue-sql.mjs");
const ID = "123e4567-e89b-42d3-a456-426614174000";
const dir: string = mkdtempSync(tmpdir() + "/queue-sql-");
let n = 0;

function file(content: string): string {
  const p = `${dir}/f${n++}.json`;
  writeFileSync(p, content);
  return p;
}

function run(args: string[]) {
  const res = spawnSync(
    // @ts-expect-error process is available at runtime
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", SCRIPT, ...args],
    { encoding: "utf8", cwd: ROOT },
  );
  return { code: res.status as number | null, out: String(res.stdout).trim(), err: String(res.stderr).trim() };
}

const draft = (label: string) => ({ v: 1, kind: "novo", fields: { url: "https://example.com/x", label, tags: ["a"] } });
const EVIL = "x'); $json$::jsonb, status='pronto' where true; delete from public.links; --";

describe("scripts/queue-sql.mjs check", () => {
  it("accepts a valid payload", () => {
    const r = run(["check", "agenda", file(JSON.stringify({ range_start: "2026-12-01", range_end: "2026-12-10" }))]);
    expect(r.code).toBe(0);
  });
  it("rejects an invalid payload with a reason", () => {
    const r = run(["check", "instagram", file(JSON.stringify({ post_urls: ["https://evil.test/x"], from_dms: false }))]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("Instagram");
  });
  it("rejects an unknown kind and broken JSON", () => {
    expect(run(["check", "hack", file("{}")]).code).toBe(1);
    expect(run(["check", "agenda", file("{oops")]).code).toBe(1);
  });
});

describe("scripts/queue-sql.mjs complete", () => {
  it("emits a guarded update with a standard literal", () => {
    const r = run(["complete", ID, file(JSON.stringify(draft("Café")))]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("set standard_conforming_strings = on;");
    expect(r.out).toContain(`where id='${ID}'::uuid and status='processando' returning id;`);
    expect(r.out).toContain("status='pronto'");
    expect(r.out).not.toContain("$json$");
    expect(r.out).not.toMatch(/\bE'/);
  });

  it("keeps hostile text inside the literal: quotes doubled, no breakout", () => {
    const r = run(["complete", ID, file(JSON.stringify(draft(EVIL)))]);
    expect(r.code).toBe(0);
    const m = /result='(.*)'::jsonb, error=null/s.exec(r.out);
    expect(m).not.toBeNull();
    const body = m![1];
    // after removing escaped quote pairs, no lone quote may remain inside the literal
    expect(body.replace(/''/g, "")).not.toContain("'");
    // and the literal decodes back to the original JSON
    expect(JSON.parse(body.replace(/''/g, "'")).fields.label).toBe(EVIL);
    // only the generated statements remain outside the literal
    const outside = r.out.replace(/result='.*'::jsonb/s, "result=LIT");
    expect(outside).not.toContain("delete from");
    expect(outside.split(";").filter((s: string) => s.trim() !== "")).toHaveLength(2);
  });

  it("rejects a bad uuid, invalid result and broken JSON", () => {
    expect(run(["complete", "1'; drop table x; --", file(JSON.stringify(draft("a")))]).code).toBe(1);
    expect(run(["complete", ID, file(JSON.stringify({ v: 1, kind: "novo" }))]).code).toBe(1);
    expect(run(["complete", ID, file("nope")]).code).toBe(1);
  });

  it("rejects a result above 70000 bytes with the guidance message", () => {
    const big = { v: 1, drafts: Array.from({ length: 10 }, (_, i) => ({
      v: 1,
      kind: "atualizacao",
      id: `123e4567-e89b-42d3-a456-42661417400${i}`,
      fields: { dossier: "a".repeat(5000), itinerary: "b".repeat(5000) },
    })) };
    const r = run(["complete", ID, file(JSON.stringify(big))]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("Resposta grande demais");
  });
});

describe("scripts/queue-sql.mjs fail", () => {
  it("escapes the reason and guards the state", () => {
    const r = run(["fail", ID, EVIL]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("status='erro'");
    expect(r.out).toContain(`left('x''); $json$::jsonb, status=''pronto'' where true; delete from public.links; --',300)`);
    expect(r.out).toContain("and status='processando' returning id;");
  });
  it("rejects a bad uuid", () => {
    expect(run(["fail", "nope", "motivo"]).code).toBe(1);
  });
});
