// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 018: public.links.extra_categories (up to 3 extra categories next
 * to the main `category`). Roles and auth.uid() are stubbed like in the other
 * migration tests (migration 017 needs them); the checks are table
 * constraints, so we insert as the owner. Fake data only.
 */

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
let db: PGlite;
let seq = 0;

async function insert(category: string | null, extras: string[] | undefined) {
  seq += 1;
  const url = `https://example.com/c${seq}`;
  if (extras === undefined) {
    return db.query(
      "insert into public.links (url, label, sort_order, category) values ($1,$2,$3,$4) returning extra_categories",
      [url, `Lugar ${seq}`, 7000 + seq, category]
    );
  }
  return db.query(
    "insert into public.links (url, label, sort_order, category, extra_categories) values ($1,$2,$3,$4,$5) returning extra_categories",
    [url, `Lugar ${seq}`, 7000 + seq, category, extras]
  );
}

async function rejected(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
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
});

afterAll(async () => {
  await db.close();
});

describe("migration 018: extra categories", () => {
  it("exists", () => {
    expect(readdirSync(MIGRATIONS)).toContain("018_links_extra_categories.sql");
  });

  it("defaults to an empty array", async () => {
    const r = await insert("restaurante", undefined);
    expect(r.rows[0]).toEqual({ extra_categories: [] });
  });

  it("accepts 1 to 3 valid, distinct extras that differ from the main", async () => {
    expect((await insert("restaurante", ["praia"])).rows[0]).toEqual({ extra_categories: ["praia"] });
    expect((await insert("restaurante", ["praia", "passeio", "bar"])).rows[0]).toEqual({
      extra_categories: ["praia", "passeio", "bar"],
    });
  });

  it("accepts extras when the main category is null (inferred)", async () => {
    expect((await insert(null, ["praia"])).rows[0]).toEqual({ extra_categories: ["praia"] });
  });

  it("rejects an unknown value", async () => {
    expect(await rejected(insert("restaurante", ["churrascaria"]))).toBe(true);
  });

  it("rejects duplicates among the extras", async () => {
    expect(await rejected(insert("restaurante", ["praia", "praia"]))).toBe(true);
  });

  it("rejects an extra equal to the main category", async () => {
    expect(await rejected(insert("restaurante", ["restaurante"]))).toBe(true);
    expect(await rejected(insert("restaurante", ["praia", "restaurante"]))).toBe(true);
  });

  it("rejects more than 3 extras", async () => {
    expect(await rejected(insert("restaurante", ["praia", "passeio", "bar", "museu"]))).toBe(true);
  });

  it("rejects null elements and a null array", async () => {
    expect(
      await rejected(
        db.query(
          "insert into public.links (url,label,sort_order,extra_categories) values ('https://example.com/n1','N',7900,array[null]::text[])"
        )
      )
    ).toBe(true);
    expect(
      await rejected(
        db.query(
          "insert into public.links (url,label,sort_order,extra_categories) values ('https://example.com/n2','N',7901,null)"
        )
      )
    ).toBe(true);
  });

  it("enforces the checks on update too", async () => {
    const r = await db.query<{ id: string }>(
      "insert into public.links (url,label,sort_order,category) values ('https://example.com/u1','U',7902,'bar') returning id"
    );
    const id = r.rows[0]!.id;
    expect(
      await rejected(db.query("update public.links set extra_categories = array['bar'] where id = $1", [id]))
    ).toBe(true);
    await db.query("update public.links set extra_categories = array['praia'] where id = $1", [id]);
  });
});
