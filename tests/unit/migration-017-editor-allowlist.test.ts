// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 017: only users listed in public.links_editors may touch
 * public.links, even though Supabase signup may be open. Roles and auth.uid()
 * are stubbed (uid read from the request.jwt.claim.sub setting, as Supabase
 * does). Table grants mimic Supabase defaults so RLS is what is under test.
 * Fake data only.
 */

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const EDITOR = "00000000-0000-0000-0000-0000000000e1";
const STRANGER = "00000000-0000-0000-0000-0000000000a2";
let db: PGlite;
let seq = 0;

async function as<T>(role: string, uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function seedLink(): Promise<string> {
  seq += 1;
  const r = await db.query<{ id: string }>(
    "insert into public.links (url, label, sort_order) values ($1, $2, $3) returning id",
    [`https://example.com/e${seq}`, `Lugar ${seq}`, 5000 + seq]
  );
  return r.rows[0]!.id;
}

async function denied(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
}

async function tokenOf(id: string): Promise<string | null> {
  const r = await db.query<{ t: string | null }>(
    "select plan_share_token as t from public.links where id = $1",
    [id]
  );
  return r.rows[0]!.t;
}

async function enableAsEditor(id: string): Promise<string> {
  return as("authenticated", EDITOR, async () => {
    const r = await db.query<{ t: string }>("select public.links_plan_share_enable($1) as t", [id]);
    return r.rows[0]!.t;
  });
}

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
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on public.links to anon, authenticated;
    insert into auth.users (id) values ('${EDITOR}'), ('${STRANGER}');
    insert into public.links_editors (user_id) values ('${EDITOR}');
  `);
});

afterAll(async () => {
  await db.close();
});

describe("migration 017: links editor allowlist", () => {
  it("exists", () => {
    expect(readdirSync(MIGRATIONS)).toContain("017_links_editor_allowlist.sql");
  });

  it("lets an editor select, insert, update and delete links", async () => {
    const id = await seedLink();
    await as("authenticated", EDITOR, async () => {
      const sel = await db.query("select id from public.links where id = $1", [id]);
      expect(sel.rows).toHaveLength(1);
      await db.query("insert into public.links (url, label, sort_order) values ($1,$2,$3)", [
        "https://example.com/ins",
        "Inserido",
        9001,
      ]);
      const upd = await db.query(
        "update public.links set label = 'Novo' where id = $1 returning id",
        [id]
      );
      expect(upd.rows).toHaveLength(1);
      const del = await db.query("delete from public.links where id = $1 returning id", [id]);
      expect(del.rows).toHaveLength(1);
    });
  });

  it("hides every row from a non-editor authenticated user", async () => {
    await seedLink();
    await as("authenticated", STRANGER, async () => {
      const sel = await db.query("select id from public.links");
      expect(sel.rows).toHaveLength(0);
    });
  });

  it("blocks insert by a non-editor", async () => {
    await as("authenticated", STRANGER, async () => {
      expect(
        await denied(
          db.query("insert into public.links (url, label, sort_order) values ($1,$2,$3)", [
            "https://example.com/x",
            "X",
            9002,
          ])
        )
      ).toBe(true);
    });
  });

  it("blocks update and delete by a non-editor (0 rows touched)", async () => {
    const id = await seedLink();
    await as("authenticated", STRANGER, async () => {
      const upd = await db.query(
        "update public.links set label = 'Hack' where id = $1 returning id",
        [id]
      );
      expect(upd.rows).toHaveLength(0);
      const del = await db.query("delete from public.links where id = $1 returning id", [id]);
      expect(del.rows).toHaveLength(0);
    });
    const still = await db.query<{ label: string }>("select label from public.links where id = $1", [
      id,
    ]);
    expect(still.rows[0]!.label).not.toBe("Hack");
  });

  it("denies a non-editor from enabling the plan share", async () => {
    const id = await seedLink();
    await as("authenticated", STRANGER, async () => {
      expect(await denied(db.query("select public.links_plan_share_enable($1)", [id]))).toBe(true);
    });
    expect(await tokenOf(id)).toBeNull();
  });

  it("denies a non-editor from disabling an existing share", async () => {
    const id = await seedLink();
    const token = await enableAsEditor(id);
    await as("authenticated", STRANGER, async () => {
      await db.query("select public.links_plan_share_disable($1)", [id]);
    });
    expect(await tokenOf(id)).toBe(token);
  });

  it("lets an editor enable and disable the plan share", async () => {
    const id = await seedLink();
    const token = await enableAsEditor(id);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    await as("authenticated", EDITOR, async () => {
      await db.query("select public.links_plan_share_disable($1)", [id]);
    });
    expect(await tokenOf(id)).toBeNull();
  });

  it("still gives anon no access to links", async () => {
    await seedLink();
    await as("anon", null, async () => {
      const sel = await db.query("select id from public.links");
      expect(sel.rows).toHaveLength(0);
    });
  });

  it("keeps the public token functions working for anon", async () => {
    const id = await seedLink();
    await db.query("update public.links set plan_items = $2::jsonb where id = $1", [
      id,
      JSON.stringify([{ text: "Biscoitos", list: "compras", done: false }]),
    ]);
    const token = await enableAsEditor(id);
    await as("anon", null, async () => {
      const got = await db.query<{ p: unknown }>("select public.links_shared_plan_get($1) as p", [
        token,
      ]);
      expect(got.rows[0]!.p).not.toBeNull();
      await db.query("select public.links_shared_plan_set_done($1, 0, 'Biscoitos', true)", [token]);
    });
    const row = await db.query<{ plan_items: Array<{ done: boolean }> }>(
      "select plan_items from public.links where id = $1",
      [id]
    );
    expect(row.rows[0]!.plan_items[0]!.done).toBe(true);
  });

  it("makes links_editors unreadable and unwritable for anon and authenticated", async () => {
    for (const [role, uid] of [
      ["anon", null],
      ["authenticated", EDITOR],
    ] as const) {
      await as(role, uid, async () => {
        expect(await denied(db.query("select * from public.links_editors"))).toBe(true);
        expect(
          await denied(db.query("insert into public.links_editors (user_id) values ($1)", [STRANGER]))
        ).toBe(true);
        expect(await denied(db.query("update public.links_editors set created_at = now()"))).toBe(
          true
        );
        expect(await denied(db.query("delete from public.links_editors"))).toBe(true);
      });
    }
  });

  it("has RLS enabled and no policy on links_editors", async () => {
    const rls = await db.query<{ r: boolean }>(
      "select relrowsecurity as r from pg_class where oid = 'public.links_editors'::regclass"
    );
    expect(rls.rows[0]!.r).toBe(true);
    const pol = await db.query("select 1 from pg_policies where tablename = 'links_editors'");
    expect(pol.rows).toHaveLength(0);
  });

  it("restricts links_is_editor to authenticated, security definer, empty search_path", async () => {
    const can = async (role: string) =>
      (
        await db.query<{ ok: boolean }>(
          "select has_function_privilege($1, 'public.links_is_editor()', 'execute') as ok",
          [role]
        )
      ).rows[0]!.ok;
    expect(await can("anon")).toBe(false);
    expect(await can("authenticated")).toBe(true);
    const def = await db.query<{ definer: boolean; cfg: string[] | null }>(
      "select prosecdef as definer, proconfig as cfg from pg_proc where proname = 'links_is_editor'"
    );
    expect(def.rows[0]!.definer).toBe(true);
    expect((def.rows[0]!.cfg ?? []).join(",")).toContain("search_path");
  });

  it("gates all four authenticated policies on links_is_editor()", async () => {
    const r = await db.query<{ n: string; roles: string; q: string | null; c: string | null }>(
      `select policyname as n, roles::text as roles, qual as q, with_check as c
         from pg_policies where tablename = 'links' order by policyname`
    );
    expect(r.rows.map((x) => x.n)).toEqual([
      "links_delete_auth",
      "links_insert_auth",
      "links_select_auth",
      "links_update_auth",
    ]);
    for (const row of r.rows) {
      expect(row.roles).toBe("{authenticated}");
      expect(`${row.q ?? ""}${row.c ?? ""}`).toContain("links_is_editor()");
    }
  });
});
