// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Migration 016: links_shared_plan_set_who ("Eu levo"). Fake data only. */

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
  const token = String(seq).padStart(2, "0") + "cd".repeat(31);
  const r = await db.query<{ id: string }>(
    `insert into public.links (url, label, sort_order, note, dossier, rating, city, address,
       itinerary, people, plan_items, plan_share_token)
     values ($1,$2,$3,'nota privada','dossie privado',4,'Cidade','Rua 1','Chegar cedo',
       array['Alana','Bia Teste'],$4::jsonb,$5) returning id`,
    [`https://example.com/c${seq}`, `Lugar ${seq}`, 4000 + seq, JSON.stringify(ITEMS), token]
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

function setWho(
  role: string,
  token: string | null,
  idx: number | null,
  text: string | null,
  who: string | null
): Promise<Record<string, unknown>> {
  return asRole(role, async () => {
    const r = await db.query<{ p: Record<string, unknown> }>(
      "select public.links_shared_plan_set_who($1, $2, $3, $4) as p",
      [token, idx, text, who]
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
    insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1');
    insert into public.links_editors (user_id) values ('00000000-0000-0000-0000-0000000000e1');
    select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
  `);
});

afterAll(async () => {
  await db.close();
});

describe("links_shared_plan_set_who", () => {
  it("is applied by 016_links_shared_plan_claim.sql", () => {
    expect(readdirSync(MIGRATIONS)).toContain("016_links_shared_plan_claim.sql");
  });

  it("claims an item for a participant and returns the plan in the get shape", async () => {
    const { id, token } = await insertShared();
    const plan = await setWho("anon", token, 1, "Biscoitos", "Bia Teste");
    expect((plan.plan_items as unknown[])[1]).toEqual({
      text: "Biscoitos",
      list: "compras",
      done: false,
      who: "Bia Teste",
    });
    const viaGet = await asRole("anon", () =>
      db.query<{ p: unknown }>("select public.links_shared_plan_get($1) as p", [token])
    );
    expect(plan).toEqual(viaGet.rows[0]!.p);
    expect((await row(id)).plan_items).toEqual([
      ITEMS[0],
      { ...ITEMS[1], who: "Bia Teste" },
      ITEMS[2],
    ]);
  });

  it("changes nothing but that item's who", async () => {
    const { id, token } = await insertShared();
    const before = await row(id);
    await setWho("anon", token, 0, "Comprar ingressos", "Bia Teste");
    const after = await row(id);
    const { plan_items: bi, updated_at: _bu, ...restBefore } = before;
    const { plan_items: ai, updated_at: _au, ...restAfter } = after;
    expect(restAfter).toEqual(restBefore);
    expect(ai).toEqual([{ ...ITEMS[0], who: "Bia Teste" }, ITEMS[1], ITEMS[2]]);
    expect(bi).toEqual(ITEMS);
  });

  it("null releases the item and removes the key", async () => {
    const { id, token } = await insertShared();
    const plan = await setWho("anon", token, 0, "Comprar ingressos", null);
    expect((await row(id)).plan_items).toEqual([
      { text: "Comprar ingressos", list: "checklist", done: true },
      ITEMS[1],
      ITEMS[2],
    ]);
    expect((plan.plan_items as Array<Record<string, unknown>>)[0]).not.toHaveProperty("who");
  });

  it("releasing an unclaimed item is a no-op", async () => {
    const { id, token } = await insertShared();
    await setWho("anon", token, 1, "Biscoitos", null);
    expect((await row(id)).plan_items).toEqual(ITEMS);
  });

  it("trims the input before matching", async () => {
    const { id, token } = await insertShared();
    await setWho("anon", token, 1, "Biscoitos", "  Alana \n");
    expect(((await row(id)).plan_items as Array<{ who?: string }>)[1]!.who).toBe("Alana");
  });

  it.each([
    ["not a participant", "Carlos"],
    ["different case", "alana"],
    ["empty", ""],
    ["blank", "   "],
  ])("rejects who %s as invalid and writes nothing", async (_n, who) => {
    const { id, token } = await insertShared();
    await expect(setWho("anon", token, 1, "Biscoitos", who)).rejects.toThrow(/invalid/);
    expect((await row(id)).plan_items).toEqual(ITEMS);
  });

  it("rejects when the link has no participants", async () => {
    const { id, token } = await insertShared();
    await db.query("update public.links set people = null where id = $1", [id]);
    await expect(setWho("anon", token, 1, "Biscoitos", "Alana")).rejects.toThrow(/invalid/);
  });

  it("also works for authenticated", async () => {
    const { token } = await insertShared();
    await setWho("authenticated", token, 2, "Água", "Alana");
  });

  it("rejects a text mismatch as conflict", async () => {
    const { id, token } = await insertShared();
    await expect(setWho("anon", token, 1, "Outro", "Alana")).rejects.toThrow(/conflict/);
    expect((await row(id)).plan_items).toEqual(ITEMS);
  });

  it.each([-1, 3, 99])("rejects idx %i as conflict", async (idx) => {
    const { token } = await insertShared();
    await expect(setWho("anon", token, idx, "Biscoitos", "Alana")).rejects.toThrow(/conflict/);
  });

  it("rejects null idx or expected_text as conflict", async () => {
    const { token } = await insertShared();
    await expect(setWho("anon", token, null, "Biscoitos", "Alana")).rejects.toThrow(/conflict/);
    await expect(setWho("anon", token, 1, null, "Alana")).rejects.toThrow(/conflict/);
  });

  it.each([
    ["null", null],
    ["unknown", "f".repeat(64)],
    ["empty", ""],
    ["malformed", "not-hex!"],
    ["uppercase", "A".repeat(64)],
  ])("rejects a %s token as inactive", async (_n, token) => {
    const { id } = await insertShared();
    await expect(setWho("anon", token, 1, "Biscoitos", "Alana")).rejects.toThrow(/inactive/);
    expect((await row(id)).plan_items).toEqual(ITEMS);
  });

  it("token errors win over other errors", async () => {
    const { id, token } = await insertShared();
    await db.query("update public.links set plan_share_token = null where id = $1", [id]);
    await expect(setWho("anon", token, 99, "x", "Carlos")).rejects.toThrow(/inactive/);
  });

  it("is security definer, empty search_path, executable by anon and authenticated only", async () => {
    const r = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
      "select prosecdef, proconfig from pg_proc where proname = 'links_shared_plan_set_who'"
    );
    expect(r.rows[0]!.prosecdef).toBe(true);
    expect(r.rows[0]!.proconfig).toContain('search_path=""');
    const can = async (role: string): Promise<boolean> =>
      (
        await db.query<{ ok: boolean }>(
          "select has_function_privilege($1, 'public.links_shared_plan_set_who(text,int,text,text)', 'execute') as ok",
          [role]
        )
      ).rows[0]!.ok;
    expect(await can("anon")).toBe(true);
    expect(await can("authenticated")).toBe(true);
    expect(await can("public")).toBe(false);
  });

  it("anon still cannot touch the table, and policies are unchanged", async () => {
    const { id } = await insertShared();
    const sel = await asRole("anon", () => db.query("select id from public.links"));
    expect(sel.rows).toHaveLength(0);
    expect((await row(id)).plan_items).toEqual(ITEMS);
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
