// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 023: retention for the Claude request queue as a function, so the
 * scheduled processor runs `select public.links_ai_requests_purge()` instead of
 * a raw DELETE (which the Supabase MCP asks a human to confirm). Only the
 * processor role (postgres) may call it. Fake data only.
 */

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const EDITOR = "00000000-0000-0000-0000-0000000000e1";
let db: PGlite;

async function denied(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
}

async function seed(status: string, age: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.links_ai_requests (kind, payload, status)
     values ('agenda', '{}', $1) returning id`,
    [status]
  );
  const id = r.rows[0]!.id;
  // The touch trigger stamps updated_at on update; backdate it with the trigger off.
  await db.exec(`alter table public.links_ai_requests disable trigger links_ai_requests_touch`);
  await db.query(
    `update public.links_ai_requests set updated_at = now() - $1::interval where id = $2`,
    [age, id]
  );
  await db.exec(`alter table public.links_ai_requests enable trigger links_ai_requests_touch`);
  return id;
}

async function exists(id: string): Promise<boolean> {
  const r = await db.query("select 1 from public.links_ai_requests where id = $1", [id]);
  return r.rows.length === 1;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const files = readdirSync(MIGRATIONS)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();
  for (const file of files) await db.exec(readFileSync(MIGRATIONS + file, "utf8"));
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    insert into auth.users (id) values ('${EDITOR}');
    insert into public.links_editors (user_id) values ('${EDITOR}');
  `);
});

afterAll(async () => {
  await db.close();
});

describe("links_ai_requests_purge", () => {
  it("deletes only aplicado/descartado older than 90 days and returns the count", async () => {
    const oldApplied = await seed("aplicado", "91 days");
    const oldDiscarded = await seed("descartado", "100 days");
    const recentApplied = await seed("aplicado", "10 days");
    const oldReady = await seed("pronto", "200 days");
    const oldError = await seed("erro", "200 days");

    const r = await db.query<{ n: number }>("select public.links_ai_requests_purge() as n");
    expect(r.rows[0]!.n).toBe(2);
    expect(await exists(oldApplied)).toBe(false);
    expect(await exists(oldDiscarded)).toBe(false);
    expect(await exists(recentApplied)).toBe(true);
    expect(await exists(oldReady)).toBe(true);
    expect(await exists(oldError)).toBe(true);
  });

  it("cannot be called by anon or authenticated (even an editor)", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [EDITOR]);
      await db.exec(`set role ${role}`);
      try {
        expect(await denied(db.query("select public.links_ai_requests_purge()"))).toBe(true);
      } finally {
        await db.exec("reset role");
      }
    }
  });
});
