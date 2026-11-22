// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 022: the Google Agenda subscription feed token (Phase 10). One row
 * in public.links_calendar_feed; only editors reach it, through three SECURITY
 * DEFINER rpcs. Roles and auth.uid() are stubbed like migration-017's test.
 * Fake data only.
 */

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const EDITOR = "00000000-0000-0000-0000-0000000000e1";
const STRANGER = "00000000-0000-0000-0000-0000000000a2";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
let db: PGlite;

async function as<T>(role: string, uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function denied(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
}

const enable = () =>
  as("authenticated", EDITOR, async () => {
    const r = await db.query<{ t: string }>("select public.links_calendar_feed_enable() as t");
    return r.rows[0]!.t;
  });

const get = () =>
  as("authenticated", EDITOR, async () => {
    const r = await db.query<{ g: { enabled: boolean; token: string | null } }>(
      "select public.links_calendar_feed_get() as g"
    );
    return r.rows[0]!.g;
  });

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
    insert into auth.users (id) values ('${EDITOR}'), ('${STRANGER}');
    insert into public.links_editors (user_id) values ('${EDITOR}');
  `);
});

afterAll(async () => {
  await db.close();
});

describe("migration 022: calendar feed", () => {
  it("exists", () => {
    expect(readdirSync(MIGRATIONS)).toContain("022_links_calendar_feed.sql");
  });

  it("starts off, with no token", async () => {
    expect(await get()).toEqual({ enabled: false, token: null });
  });

  it("enable returns a 43-character base64url token and turns the feed on", async () => {
    const token = await enable();
    expect(token).toMatch(TOKEN_RE);
    expect(await get()).toEqual({ enabled: true, token });
  });

  it("enable again rotates the token (the old one is gone)", async () => {
    const first = await enable();
    const second = await enable();
    expect(second).toMatch(TOKEN_RE);
    expect(second).not.toBe(first);
    expect((await get()).token).toBe(second);
    const rows = await db.query("select 1 from public.links_calendar_feed");
    expect(rows.rows).toHaveLength(1);
  });

  it("disable turns it off and clears the token", async () => {
    await enable();
    const ok = await as("authenticated", EDITOR, async () => {
      const r = await db.query<{ d: boolean }>("select public.links_calendar_feed_disable() as d");
      return r.rows[0]!.d;
    });
    expect(ok).toBe(true);
    expect(await get()).toEqual({ enabled: false, token: null });
  });

  it("rejects a non-editor on every rpc and leaves the state alone", async () => {
    const token = await enable();
    await as("authenticated", STRANGER, async () => {
      for (const fn of ["enable", "disable", "get"]) {
        expect(await denied(db.query(`select public.links_calendar_feed_${fn}()`))).toBe(true);
      }
    });
    expect(await get()).toEqual({ enabled: true, token });
  });

  it("gives anon no rpc and no table access", async () => {
    await as("anon", null, async () => {
      for (const fn of ["enable", "disable", "get"]) {
        expect(await denied(db.query(`select public.links_calendar_feed_${fn}()`))).toBe(true);
      }
      expect(await denied(db.query("select token from public.links_calendar_feed"))).toBe(true);
    });
  });

  it("does not let a signed-in user read the token straight from the table", async () => {
    await enable();
    await as("authenticated", EDITOR, async () => {
      expect(await denied(db.query("select token from public.links_calendar_feed"))).toBe(true);
    });
  });

  it("never lets the table hold more than one row, or an enabled feed without a token", async () => {
    expect(
      await denied(db.query("insert into public.links_calendar_feed (id, enabled) values (2, false)"))
    ).toBe(true);
    expect(
      await denied(db.query("update public.links_calendar_feed set token = null, enabled = true"))
    ).toBe(true);
    expect(
      await denied(db.query("update public.links_calendar_feed set token = 'curto' where enabled"))
    ).toBe(true);
  });
});
