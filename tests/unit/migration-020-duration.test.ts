// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DURATIONS } from "../../src/links/duration";

/**
 * Migration 020: public.links.duration (Duração of an item). The check is a
 * table constraint, so we insert as the owner. Fake data only.
 */

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
let db: PGlite;
let seq = 0;

async function insert(duration?: string | null) {
  seq += 1;
  const url = `https://example.com/d${seq}`;
  if (duration === undefined) {
    return db.query(
      "insert into public.links (url, label, sort_order) values ($1,$2,$3) returning duration",
      [url, `Lugar ${seq}`, 9000 + seq]
    );
  }
  return db.query(
    "insert into public.links (url, label, sort_order, duration) values ($1,$2,$3,$4) returning duration",
    [url, `Lugar ${seq}`, 9000 + seq, duration]
  );
}

const REJECT = /links_duration_valid/;

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

describe("migration 020: duration", () => {
  it("exists", () => {
    expect(readdirSync(MIGRATIONS)).toContain("020_links_duration.sql");
  });

  it("is null by default", async () => {
    expect((await insert(undefined)).rows[0]).toEqual({ duration: null });
  });

  it("accepts null and every app value", async () => {
    expect((await insert(null)).rows[0]).toEqual({ duration: null });
    for (const value of DURATIONS) {
      expect((await insert(value)).rows[0]).toEqual({ duration: value });
    }
  });

  it("rejects anything else", async () => {
    for (const bad of ["", "Rápido", "rapido ", "meio_periodo", "dia", "1h"]) {
      await expect(insert(bad)).rejects.toThrow(REJECT);
    }
  });

  it("enforces the check on update too", async () => {
    const r = await db.query<{ id: string }>(
      "insert into public.links (url,label,sort_order) values ('https://example.com/du1','U',9900) returning id"
    );
    const id = r.rows[0]!.id;
    await expect(db.query("update public.links set duration = 'longo' where id = $1", [id])).rejects.toThrow(
      REJECT
    );
    await db.query("update public.links set duration = 'dia-inteiro' where id = $1", [id]);
    await db.query("update public.links set duration = null where id = $1", [id]);
  });

  it("can be re-applied (idempotent)", async () => {
    const sql: string = readFileSync(MIGRATIONS + "020_links_duration.sql", "utf8");
    await db.exec(sql);
    await expect(insert("x")).rejects.toThrow(REJECT);
  });
});
