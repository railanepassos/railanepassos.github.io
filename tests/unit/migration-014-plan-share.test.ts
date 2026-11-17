// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Applies every migration to an in-memory Postgres (pglite) and checks the
 * plan share link of migration 014: the token column, the editor functions
 * (security invoker, RLS decides) and the public read function (security
 * definer). Supabase's roles are stubbed and given the table grants Supabase
 * gives by default, so RLS (not missing grants) is what keeps anon out.
 * Fake data only.
 */

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
let db: PGlite;
let seq = 0;

const ITEMS = [
  { text: "Comprar ingressos", list: "checklist", who: "Alana", done: true },
  { text: "Biscoitos", list: "compras", done: false },
];

async function insertLink(over: Record<string, unknown> = {}): Promise<string> {
  seq += 1;
  const row = {
    url: `https://example.com/s${seq}`,
    label: `Lugar ${seq}`,
    sort_order: 2000 + seq,
    note: "nota privada",
    dossier: "dossie privado",
    impressions: "impressao privada",
    rating: 4,
    city: "Cidade Teste",
    address: "Rua Teste, 1",
    itinerary: "Chegar cedo",
    people: ["Alana", "Bia Teste"],
    plan_items: ITEMS,
    scheduled_start: "2026-12-05T09:00:00-03:00",
    scheduled_end: "2026-12-05T17:30:00-03:00",
    ...over,
  };
  const result = await db.query<{ id: string }>(
    `insert into public.links (url, label, sort_order, note, dossier, impressions, rating, city,
       address, itinerary, people, plan_items, scheduled_start, scheduled_end)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14) returning id`,
    [
      row.url,
      row.label,
      row.sort_order,
      row.note,
      row.dossier,
      row.impressions,
      row.rating,
      row.city,
      row.address,
      row.itinerary,
      row.people,
      JSON.stringify(row.plan_items),
      row.scheduled_start,
      row.scheduled_end,
    ]
  );
  return result.rows[0]!.id;
}

async function asRole<T>(role: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function enable(id: string): Promise<string> {
  return asRole("authenticated", async () => {
    const r = await db.query<{ t: string }>("select public.links_plan_share_enable($1) as t", [id]);
    return r.rows[0]!.t;
  });
}

async function getShared(
  role: string,
  token: string | null
): Promise<Record<string, unknown> | null> {
  return asRole(role, async () => {
    const r = await db.query<{ p: Record<string, unknown> | null }>(
      "select public.links_shared_plan_get($1) as p",
      [token]
    );
    return r.rows[0]!.p;
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
  `);
  const files = readdirSync(MIGRATIONS)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();
  for (const file of files) await db.exec(readFileSync(MIGRATIONS + file, "utf8"));
  // Supabase default privileges: every API role can touch public tables; RLS decides.
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on public.links to anon, authenticated;
  `);
});

afterAll(async () => {
  await db.close();
});

describe("migration 014: plan share token", () => {
  it("is applied by 014_links_plan_share.sql", () => {
    expect(readdirSync(MIGRATIONS)).toContain("014_links_plan_share.sql");
  });

  it("generates a 64-char lowercase hex token on enable", async () => {
    const token = await enable(await insertLink());
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives every link its own token", async () => {
    const tokens = new Set([
      await enable(await insertLink()),
      await enable(await insertLink()),
      await enable(await insertLink()),
    ]);
    expect(tokens.size).toBe(3);
  });

  it("enable on an enabled link rotates the token and kills the old one", async () => {
    const id = await insertLink();
    const first = await enable(id);
    const second = await enable(id);
    expect(second).not.toBe(first);
    expect(await getShared("anon", first)).toBeNull();
    expect(await getShared("anon", second)).not.toBeNull();
  });

  it("disable nulls the token and the public read stops working", async () => {
    const id = await insertLink();
    const token = await enable(id);
    await asRole("authenticated", () =>
      db.query("select public.links_plan_share_disable($1)", [id])
    );
    const row = await db.query<{ plan_share_token: string | null }>(
      "select plan_share_token from public.links where id = $1",
      [id]
    );
    expect(row.rows[0]!.plan_share_token).toBeNull();
    expect(await getShared("anon", token)).toBeNull();
  });

  it("rejects a malformed or duplicated token at the table", async () => {
    const a = await insertLink();
    const b = await insertLink();
    const upd = (id: string, t: string): Promise<unknown> =>
      db.query("update public.links set plan_share_token = $2 where id = $1", [id, t]);
    await expect(upd(a, "short")).rejects.toThrow(/plan_share_token/);
    await expect(upd(a, "g".repeat(40))).rejects.toThrow(/plan_share_token/);
    await expect(upd(a, "A".repeat(40))).rejects.toThrow(/plan_share_token/);
    await expect(upd(a, "a".repeat(65))).rejects.toThrow(/plan_share_token/);
    await upd(a, "a".repeat(32));
    await expect(upd(b, "a".repeat(32))).rejects.toThrow(/duplicate|unique/);
  });

  it("allows several links without a token", async () => {
    await insertLink();
    await insertLink();
  });
});

describe("links_shared_plan_get", () => {
  it("returns only the allowed fields, to anon", async () => {
    const token = await enable(await insertLink({ label: "Lugar Publico" }));
    const plan = await getShared("anon", token);
    expect(plan).not.toBeNull();
    expect(Object.keys(plan!).sort()).toEqual(
      [
        "address",
        "city",
        "itinerary",
        "label",
        "people",
        "plan_items",
        "scheduled_end",
        "scheduled_start",
      ].sort()
    );
    expect(plan!.label).toBe("Lugar Publico");
    expect(plan!.city).toBe("Cidade Teste");
    expect(plan!.people).toEqual(["Alana", "Bia Teste"]);
    expect(plan!.plan_items).toEqual(ITEMS);
    const text = JSON.stringify(plan);
    for (const secret of [
      "nota privada",
      "dossie privado",
      "impressao privada",
      token,
      "example.com",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("also works for authenticated", async () => {
    const token = await enable(await insertLink());
    expect(await getShared("authenticated", token)).not.toBeNull();
  });

  it.each([
    ["null", null],
    ["unknown", "f".repeat(64)],
    ["empty", ""],
    ["wrong format", "not-hex!"],
    ["uppercase", "A".repeat(64)],
    ["sql-ish", "' or 1=1 --"],
    ["too short", "abc"],
  ])("returns null for a %s token", async (_n, token) => {
    await enable(await insertLink());
    expect(await getShared("anon", token)).toBeNull();
  });

  it("never matches links without a token when given null", async () => {
    await insertLink();
    expect(await getShared("anon", null)).toBeNull();
  });
});

describe("access control", () => {
  it("anon cannot select from links, even with a share link on", async () => {
    await enable(await insertLink());
    const rows = await asRole("anon", () => db.query("select id from public.links"));
    expect(rows.rows).toHaveLength(0);
  });

  it("anon cannot read the token column", async () => {
    await enable(await insertLink());
    const rows = await asRole("anon", () =>
      db.query("select plan_share_token from public.links where plan_share_token is not null")
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("anon cannot update links directly", async () => {
    const id = await insertLink();
    const r = await asRole("anon", () =>
      db.query("update public.links set plan_share_token = $2 where id = $1 returning id", [
        id,
        "b".repeat(40),
      ])
    );
    expect(r.rows).toHaveLength(0);
  });

  it("anon cannot execute enable/disable but can execute the public read", async () => {
    const can = async (fn: string, role: string): Promise<boolean> =>
      (
        await db.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [
          role,
          fn,
        ])
      ).rows[0]!.ok;
    expect(await can("public.links_plan_share_enable(uuid)", "anon")).toBe(false);
    expect(await can("public.links_plan_share_disable(uuid)", "anon")).toBe(false);
    expect(await can("public.links_plan_share_enable(uuid)", "authenticated")).toBe(true);
    expect(await can("public.links_plan_share_disable(uuid)", "authenticated")).toBe(true);
    expect(await can("public.links_shared_plan_get(text)", "anon")).toBe(true);
    expect(await can("public.links_shared_plan_get(text)", "authenticated")).toBe(true);
  });

  it("anon calling enable is denied", async () => {
    const id = await insertLink();
    await expect(
      asRole("anon", () => db.query("select public.links_plan_share_enable($1)", [id]))
    ).rejects.toThrow(/permission denied/);
  });

  it("enable/disable are security invoker; the public read is definer with an empty search_path", async () => {
    const r = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
      `select proname, prosecdef, proconfig from pg_proc
        where proname in ('links_plan_share_enable','links_plan_share_disable','links_shared_plan_get')`
    );
    const by = Object.fromEntries(r.rows.map((x) => [x.proname, x]));
    expect(by.links_plan_share_enable!.prosecdef).toBe(false);
    expect(by.links_plan_share_disable!.prosecdef).toBe(false);
    expect(by.links_shared_plan_get!.prosecdef).toBe(true);
    expect(by.links_shared_plan_get!.proconfig).toContain('search_path=""');
  });

  it("table policies are unchanged: no policy for anon, select is authenticated-only", async () => {
    const r = await db.query<{ policyname: string; cmd: string; roles: string }>(
      "select policyname, cmd, roles::text as roles from pg_policies where tablename = 'links' order by policyname"
    );
    expect(r.rows.map((x) => `${x.policyname}:${x.cmd}:${x.roles}`)).toEqual([
      "links_delete_auth:DELETE:{authenticated}",
      "links_insert_auth:INSERT:{authenticated}",
      "links_select_auth:SELECT:{authenticated}",
      "links_update_auth:UPDATE:{authenticated}",
    ]);
  });
});
