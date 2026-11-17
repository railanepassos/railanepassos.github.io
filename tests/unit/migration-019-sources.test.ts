// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_SOURCES, SOURCE_TITLE_MAX, SOURCE_URL_MAX } from "../../src/links/sources";

/**
 * Migration 019: public.links.sources (Fontes of an item). The check is a
 * table constraint, so we insert as the owner. Fake data only.
 */

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
let db: PGlite;
let seq = 0;

async function insert(sources: unknown) {
  seq += 1;
  const url = `https://example.com/s${seq}`;
  if (sources === undefined) {
    return db.query(
      "insert into public.links (url, label, sort_order) values ($1,$2,$3) returning sources",
      [url, `Lugar ${seq}`, 8000 + seq]
    );
  }
  return db.query(
    "insert into public.links (url, label, sort_order, sources) values ($1,$2,$3,$4::jsonb) returning sources",
    [url, `Lugar ${seq}`, 8000 + seq, JSON.stringify(sources)]
  );
}

const src = (over: Record<string, unknown> = {}) => ({
  title: "Guia da cidade",
  url: "https://example.com/guia",
  ...over,
});

const REJECT = /links_sources_valid/;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const files = readdirSync(MIGRATIONS)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();
  for (const file of files) await db.exec(readFileSync(MIGRATIONS + file, "utf8"));
});

afterAll(async () => {
  await db.close();
});

describe("migration 019: sources", () => {
  it("exists", () => {
    expect(readdirSync(MIGRATIONS)).toContain("019_links_sources.sql");
  });

  it("defaults to an empty array", async () => {
    expect((await insert(undefined)).rows[0]).toEqual({ sources: [] });
  });

  it("accepts valid sources, up to the limit", async () => {
    expect((await insert([src()])).rows[0]).toEqual({ sources: [src()] });
    const ten = Array.from({ length: MAX_SOURCES }, (_, i) => src({ url: `https://example.com/${i}` }));
    expect(((await insert(ten)).rows[0] as { sources: unknown[] }).sources).toHaveLength(MAX_SOURCES);
  });

  it("rejects more than the limit", async () => {
    const many = Array.from({ length: MAX_SOURCES + 1 }, (_, i) => src({ url: `https://example.com/${i}` }));
    await expect(insert(many)).rejects.toThrow(REJECT);
  });

  it("rejects a non-https url, an overlong url and a non-string url", async () => {
    await expect(insert([src({ url: "http://example.com/a" })])).rejects.toThrow(REJECT);
    await expect(insert([src({ url: "javascript:alert(1)" })])).rejects.toThrow(REJECT);
    const long = "https://example.com/" + "a".repeat(SOURCE_URL_MAX);
    await expect(insert([src({ url: long })])).rejects.toThrow(REJECT);
    await expect(insert([src({ url: 5 })])).rejects.toThrow(REJECT);
  });

  it("accepts a url at exactly the limit", async () => {
    const edge = "https://example.com/" + "a".repeat(SOURCE_URL_MAX - "https://example.com/".length);
    expect(edge.length).toBe(SOURCE_URL_MAX);
    await insert([src({ url: edge })]);
  });

  it("rejects unknown keys and missing keys", async () => {
    await expect(insert([src({ extra: "x" })])).rejects.toThrow(REJECT);
    await expect(insert([{ url: "https://example.com/a" }])).rejects.toThrow(REJECT);
    await expect(insert([{ title: "Só título" }])).rejects.toThrow(REJECT);
  });

  it("rejects an empty, blank or overlong title", async () => {
    await expect(insert([src({ title: "" })])).rejects.toThrow(REJECT);
    await expect(insert([src({ title: "   " })])).rejects.toThrow(REJECT);
    await expect(insert([src({ title: "t".repeat(SOURCE_TITLE_MAX + 1) })])).rejects.toThrow(REJECT);
    await insert([src({ title: "t".repeat(SOURCE_TITLE_MAX) })]);
  });

  it("rejects non-array values and non-object items", async () => {
    await expect(insert({ title: "x" })).rejects.toThrow(REJECT);
    await expect(insert("x")).rejects.toThrow(REJECT);
    await expect(insert(["https://example.com/a"])).rejects.toThrow(REJECT);
  });

  it("rejects null", async () => {
    await expect(
      db.query(
        "insert into public.links (url,label,sort_order,sources) values ('https://example.com/n','N',8900,null)"
      )
    ).rejects.toThrow();
  });

  it("enforces the check on update too", async () => {
    const r = await db.query<{ id: string }>(
      "insert into public.links (url,label,sort_order) values ('https://example.com/u1','U',8901) returning id"
    );
    const id = r.rows[0]!.id;
    await expect(
      db.query("update public.links set sources = $2::jsonb where id = $1", [
        id,
        JSON.stringify([src({ url: "http://x.com" })]),
      ])
    ).rejects.toThrow(REJECT);
    await db.query("update public.links set sources = $2::jsonb where id = $1", [id, JSON.stringify([src()])]);
  });

  it("keeps the validator off anon", async () => {
    const r = await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.links_sources_valid(jsonb)', 'execute') as ok"
    );
    expect(r.rows[0]!.ok).toBe(false);
  });
});
