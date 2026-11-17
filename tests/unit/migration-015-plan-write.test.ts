// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 015: links_shared_plan_set_done, the only public write door of the
 * shared plan. Same pglite setup as migration 014. Fake data only.
 */

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
let db: PGlite;
let seq = 0;

const ITEMS = [
  { text: "Comprar ingressos", list: "checklist", who: "Alana", done: true },
  { text: "Biscoitos", list: "compras", done: false },
  { text: "Água", list: "compras", done: false },
];

async function insertShared(): Promise<{ id: string; token: string }> {
  seq += 1;
  const token = String(seq).padStart(2, "0") + "ab".repeat(31);
  const r = await db.query<{ id: string }>(
    `insert into public.links (url, label, sort_order, note, dossier, rating, city, address,
       itinerary, people, plan_items, plan_share_token)
     values ($1,$2,$3,'nota privada','dossie privado',4,'Cidade','Rua 1','Chegar cedo',
       array['Alana','Bia'],$4::jsonb,$5) returning id`,
    [`https://example.com/w${seq}`, `Lugar ${seq}`, 3000 + seq, JSON.stringify(ITEMS), token]
  );
  return { id: r.rows[0]!.id, token };
}

async function asRole<T>(role: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

function setDone(
  role: string,
  token: string | null,
  idx: number | null,
  text: string | null,
  done: boolean | null
): Promise<Record<string, unknown>> {
  return asRole(role, async () => {
    const r = await db.query<{ p: Record<string, unknown> }>(
      "select public.links_shared_plan_set_done($1, $2, $3, $4) as p",
      [token, idx, text, done]
    );
    return r.rows[0]!.p;
  });
}

async function row(id: string): Promise<Record<string, unknown>> {
  return (await db.query<Record<string, unknown>>("select * from public.links where id = $1", [id]))
    .rows[0]!;
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
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on public.links to anon, authenticated;
  `);
});

afterAll(async () => {
  await db.close();
});

describe("links_shared_plan_set_done", () => {
  it("is applied by 015_links_shared_plan_write.sql", () => {
    expect(readdirSync(MIGRATIONS)).toContain("015_links_shared_plan_write.sql");
  });

  it("ticks one item as anon and returns the updated plan in the get shape", async () => {
    const { id, token } = await insertShared();
    const plan = await setDone("anon", token, 1, "Biscoitos", true);
    expect((plan.plan_items as unknown[])[1]).toEqual({
      text: "Biscoitos",
      list: "compras",
      done: true,
    });
    const viaGet = await asRole("anon", () =>
      db.query<{ p: unknown }>("select public.links_shared_plan_get($1) as p", [token])
    );
    expect(plan).toEqual(viaGet.rows[0]!.p);
    expect(Object.keys(plan).sort()).toEqual([
      "address",
      "city",
      "itinerary",
      "label",
      "people",
      "plan_items",
      "scheduled_end",
      "scheduled_start",
    ]);
    expect((await row(id)).plan_items).toEqual([
      ITEMS[0],
      { text: "Biscoitos", list: "compras", done: true },
      ITEMS[2],
    ]);
  });

  it("can untick, and changes nothing but done (every other column and field)", async () => {
    const { id, token } = await insertShared();
    const before = await row(id);
    await setDone("anon", token, 0, "Comprar ingressos", false);
    const after = await row(id);
    const { plan_items: bi, updated_at: _bu, ...restBefore } = before;
    const { plan_items: ai, updated_at: _au, ...restAfter } = after;
    expect(restAfter).toEqual(restBefore);
    expect(bi).toEqual(ITEMS);
    expect(ai).toEqual([{ ...ITEMS[0], done: false }, ITEMS[1], ITEMS[2]]);
  });

  it("is idempotent when the value already matches", async () => {
    const { token } = await insertShared();
    const plan = await setDone("anon", token, 0, "Comprar ingressos", true);
    expect((plan.plan_items as Array<{ done: boolean }>)[0]!.done).toBe(true);
  });

  it("also works for authenticated", async () => {
    const { token } = await insertShared();
    await setDone("authenticated", token, 2, "Água", true);
  });

  it("rejects a text mismatch as conflict and writes nothing", async () => {
    const { id, token } = await insertShared();
    await expect(setDone("anon", token, 1, "Outro", true)).rejects.toThrow(/conflict/);
    expect((await row(id)).plan_items).toEqual(ITEMS);
  });

  it.each([-1, 3, 99])("rejects idx %i as conflict", async (idx) => {
    const { id, token } = await insertShared();
    await expect(setDone("anon", token, idx, "Biscoitos", true)).rejects.toThrow(/conflict/);
    expect((await row(id)).plan_items).toEqual(ITEMS);
  });

  it("rejects a null idx or null expected_text as conflict", async () => {
    const { token } = await insertShared();
    await expect(setDone("anon", token, null, "Biscoitos", true)).rejects.toThrow(/conflict/);
    await expect(setDone("anon", token, 1, null, true)).rejects.toThrow(/conflict/);
  });

  it("rejects a null done as invalid", async () => {
    const { id, token } = await insertShared();
    await expect(setDone("anon", token, 1, "Biscoitos", null)).rejects.toThrow(/invalid/);
    expect((await row(id)).plan_items).toEqual(ITEMS);
  });

  it("rejects a link without plan items as conflict", async () => {
    const { id, token } = await insertShared();
    await db.query("update public.links set plan_items = null where id = $1", [id]);
    await expect(setDone("anon", token, 0, "x", true)).rejects.toThrow(/conflict/);
  });

  it.each([
    ["null", null],
    ["unknown", "f".repeat(64)],
    ["empty", ""],
    ["malformed", "not-hex!"],
    ["uppercase", "A".repeat(64)],
    ["sql-ish", "' or 1=1 --"],
  ])("rejects a %s token as inactive", async (_n, token) => {
    const { id } = await insertShared();
    await expect(setDone("anon", token, 1, "Biscoitos", true)).rejects.toThrow(/inactive/);
    expect((await row(id)).plan_items).toEqual(ITEMS);
  });

  it("a disabled token is inactive, and token errors win over other errors", async () => {
    const { id, token } = await insertShared();
    await db.query("update public.links set plan_share_token = null where id = $1", [id]);
    await expect(setDone("anon", token, 1, "Biscoitos", true)).rejects.toThrow(/inactive/);
    await expect(setDone("anon", token, 99, "x", null)).rejects.toThrow(/inactive/);
  });

  it("keeps the plan_items constraint satisfied after a write", async () => {
    const { id, token } = await insertShared();
    await setDone("anon", token, 2, "Água", true);
    const ok = await db.query<{ ok: boolean }>(
      "select public.links_plan_items_valid(plan_items) as ok from public.links where id = $1",
      [id]
    );
    expect(ok.rows[0]!.ok).toBe(true);
  });

  it("anon still cannot update or read the table directly", async () => {
    const { id } = await insertShared();
    const upd = await asRole("anon", () =>
      db.query("update public.links set plan_items = '[]'::jsonb where id = $1 returning id", [id])
    );
    expect(upd.rows).toHaveLength(0);
    const sel = await asRole("anon", () => db.query("select id from public.links"));
    expect(sel.rows).toHaveLength(0);
    expect((await row(id)).plan_items).toEqual(ITEMS);
  });

  it("is security definer with an empty search_path, executable by anon and authenticated only", async () => {
    const r = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
      "select prosecdef, proconfig from pg_proc where proname = 'links_shared_plan_set_done'"
    );
    expect(r.rows[0]!.prosecdef).toBe(true);
    expect(r.rows[0]!.proconfig).toContain('search_path=""');
    const can = async (role: string): Promise<boolean> =>
      (
        await db.query<{ ok: boolean }>(
          "select has_function_privilege($1, 'public.links_shared_plan_set_done(text,int,text,boolean)', 'execute') as ok",
          [role]
        )
      ).rows[0]!.ok;
    expect(await can("anon")).toBe(true);
    expect(await can("authenticated")).toBe(true);
    expect(await can("public")).toBe(false);
  });

  it("table policies are still unchanged", async () => {
    const r = await db.query<{ policyname: string }>(
      "select policyname from pg_policies where tablename = 'links' order by policyname"
    );
    expect(r.rows.map((x) => x.policyname)).toEqual([
      "links_delete_auth",
      "links_insert_auth",
      "links_select_auth",
      "links_update_auth",
    ]);
  });
});
