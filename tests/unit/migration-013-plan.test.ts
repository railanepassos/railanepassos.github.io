// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Applies every migration to an in-memory Postgres (pglite) and checks the
 * plan_items constraint of migration 013. Fake data only. Supabase's roles and
 * auth.users are stubbed: just enough for the migrations to run.
 */

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
let db: PGlite;
let seq = 0;

async function insert(planItems: unknown): Promise<void> {
  seq += 1;
  await db.query(
    "insert into public.links (url, label, sort_order, plan_items) values ($1, $2, $3, $4::jsonb)",
    [
      `https://example.com/p${seq}`,
      `Lugar ${seq}`,
      1000 + seq,
      planItems === null ? null : JSON.stringify(planItems),
    ]
  );
}

const item = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  text: "Comprar ingressos",
  list: "checklist",
  done: false,
  ...over,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
  `);
  const files = readdirSync(MIGRATIONS)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();
  for (const file of files) await db.exec(readFileSync(MIGRATIONS + file, "utf8"));
});

afterAll(async () => {
  await db.close();
});

describe("migration 013: plan_items", () => {
  it("is applied by 013_links_phase4_plan.sql", () => {
    expect(readdirSync(MIGRATIONS)).toContain("013_links_phase4_plan.sql");
  });

  it("accepts null, an empty array and valid items", async () => {
    await insert(null);
    await insert([]);
    await insert([
      item(),
      item({ list: "compras", who: "Alana", done: true }),
      item({ text: "x".repeat(200), who: "y".repeat(80) }),
    ]);
  });

  it("accepts exactly 60 items", async () => {
    await insert(Array.from({ length: 60 }, () => item()));
  });

  it.each([
    ["61 items", Array.from({ length: 61 }, () => item())],
    ["not an array", { text: "a" }],
    ["an item that is not an object", ["texto"]],
    ["missing text", [{ list: "checklist", done: false }]],
    ["empty text", [item({ text: "" })]],
    ["text over 200", [item({ text: "x".repeat(201) })]],
    ["text that is not a string", [item({ text: 5 })]],
    ["unknown list", [item({ list: "outra" })]],
    ["missing list", [{ text: "a", done: false }]],
    ["who over 80", [item({ who: "y".repeat(81) })]],
    ["who that is not a string", [item({ who: 3 })]],
    ["missing done", [{ text: "a", list: "checklist" }]],
    ["done that is not a boolean", [item({ done: "sim" })]],
  ])("rejects %s", async (_name, value) => {
    await expect(insert(value)).rejects.toThrow(/links_plan_items_valid/);
  });

  it("revokes execute on the helper from anon", async () => {
    const result = await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.links_plan_items_valid(jsonb)', 'execute') as ok"
    );
    expect(result.rows[0]!.ok).toBe(false);
    const authed = await db.query<{ ok: boolean }>(
      "select has_function_privilege('authenticated', 'public.links_plan_items_valid(jsonb)', 'execute') as ok"
    );
    expect(authed.rows[0]!.ok).toBe(true);
  });
});
