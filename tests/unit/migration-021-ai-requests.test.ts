// @ts-expect-error node:fs is available at runtime via vitest/node environment
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node:url is available at runtime via vitest/node environment
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 021: the Claude request queue (Phase 9). Editors queue requests and
 * only change status afterwards; the processor (Supabase MCP, role postgres)
 * writes result/error. Roles and auth.uid() are stubbed like migration-022's
 * test. Fake data only.
 */

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const EDITOR = "00000000-0000-0000-0000-0000000000e1";
const STRANGER = "00000000-0000-0000-0000-0000000000a2";
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

const asEditor = <T>(fn: () => Promise<T>) => as("authenticated", EDITOR, fn);

/** Inserts as postgres (the processor) a row in the given status; returns its id. */
async function seed(status: string, extra = ""): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.links_ai_requests (kind, payload, status${extra ? ", " + extra.split("|")[0] : ""})
     values ('instagram', '{"post_urls":[],"from_dms":true}', '${status}'${extra ? ", " + extra.split("|")[1] : ""})
     returning id`
  );
  return r.rows[0]!.id;
}

async function statusOf(id: string): Promise<string> {
  const r = await db.query<{ status: string }>("select status from public.links_ai_requests where id = $1", [id]);
  return r.rows[0]!.status;
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
    insert into auth.users (id) values ('${EDITOR}'), ('${STRANGER}');
    insert into public.links_editors (user_id) values ('${EDITOR}');
  `);
});

afterAll(async () => {
  await db.close();
});

const INSERT = (cols = "kind, payload", vals = `'agenda', '{"range_start":"2026-12-01","range_end":"2026-12-31"}'`) =>
  `insert into public.links_ai_requests (${cols}) values (${vals})`;

describe("migration 021: links_ai_requests", () => {
  it("exists", () => {
    expect(readdirSync(MIGRATIONS)).toContain("021_links_ai_requests.sql");
  });

  it("closes the table to anon", async () => {
    await seed("pendente");
    await as("anon", null, async () => {
      expect(await denied(db.query("select id from public.links_ai_requests"))).toBe(true);
      expect(await denied(db.query(INSERT()))).toBe(true);
    });
  });

  it("closes the table to a signed-in non-editor (no rows, no insert)", async () => {
    await seed("pendente");
    await as("authenticated", STRANGER, async () => {
      const r = await db.query("select id from public.links_ai_requests");
      expect(r.rows).toHaveLength(0);
      expect(await denied(db.query(INSERT()))).toBe(true);
    });
  });

  it("lets an editor read and queue a pending request (created_by defaults to auth.uid())", async () => {
    await asEditor(async () => {
      await db.query(INSERT());
      const r = await db.query<{ status: string; created_by: string }>(
        "select status, created_by from public.links_ai_requests order by created_at desc limit 1"
      );
      expect(r.rows[0]!.status).toBe("pendente");
      expect(r.rows[0]!.created_by).toBe(EDITOR);
    });
  });

  it("refuses an editor insert that is not a plain pending request", async () => {
    await asEditor(async () => {
      expect(await denied(db.query(INSERT("kind, payload, status", `'agenda', '{}', 'pronto'`)))).toBe(true);
      expect(await denied(db.query(INSERT("kind, payload, result", `'agenda', '{}', '{"v":1}'`)))).toBe(true);
      expect(await denied(db.query(INSERT("kind, payload, error", `'agenda', '{}', 'x'`)))).toBe(true);
      expect(await denied(db.query(INSERT("kind, payload, processed_at", `'agenda', '{}', now()`)))).toBe(true);
    });
  });

  it("rejects an unknown kind or status", async () => {
    expect(await denied(db.query(INSERT("kind, payload", `'outro', '{}'`)))).toBe(true);
    expect(await denied(db.query(INSERT("kind, payload, status", `'agenda', '{}', 'x'`)))).toBe(true);
  });

  it("rejects a payload over 8192 bytes or not an object", async () => {
    const big = JSON.stringify({ pad: "x".repeat(8200) });
    await asEditor(async () => {
      expect(await denied(db.query(INSERT("kind, payload", `'agenda', '${big}'`)))).toBe(true);
    });
    expect(await denied(db.query(INSERT("kind, payload", `'agenda', '[]'`)))).toBe(true);
    await db.query(INSERT("kind, payload", `'agenda', '${JSON.stringify({ pad: "x".repeat(8000) })}'`));
  });

  it("rejects an error text over 300 characters", async () => {
    expect(await denied(db.query(INSERT("kind, payload, status, error", `'agenda', '{}', 'erro', '${"e".repeat(301)}'`)))).toBe(true);
    await db.query(INSERT("kind, payload, status, error", `'agenda', '{}', 'erro', '${"e".repeat(300)}'`));
  });

  it("lets the processor (postgres) write pronto + result", async () => {
    const id = await seed("pendente");
    await db.query(
      `update public.links_ai_requests set status = 'pronto', result = '{"v":1,"drafts":[]}', processed_at = now() where id = $1`,
      [id]
    );
    expect(await statusOf(id)).toBe("pronto");
  });

  it("lets an editor go pronto -> aplicado and pendente -> descartado", async () => {
    const ready = await seed("pronto");
    const pending = await seed("pendente");
    await asEditor(async () => {
      await db.query("update public.links_ai_requests set status = 'aplicado' where id = $1", [ready]);
      await db.query("update public.links_ai_requests set status = 'descartado' where id = $1", [pending]);
    });
    expect(await statusOf(ready)).toBe("aplicado");
    expect(await statusOf(pending)).toBe("descartado");
  });

  it("does not let an editor touch result, error or processed_at", async () => {
    const id = await seed("pronto");
    await asEditor(async () => {
      for (const set of [`result = '{"v":1}'`, `error = 'x'`, `processed_at = now()`]) {
        expect(await denied(db.query(`update public.links_ai_requests set ${set} where id = $1`, [id]))).toBe(true);
      }
    });
  });

  it("does not let an editor set pronto or processando", async () => {
    const id = await seed("pendente");
    await asEditor(async () => {
      for (const s of ["pronto", "processando"]) {
        expect(await denied(db.query(`update public.links_ai_requests set status = '${s}' where id = $1`, [id]))).toBe(true);
      }
    });
    expect(await statusOf(id)).toBe("pendente");
  });

  it("does not let an editor leave aplicado or descartado", async () => {
    const applied = await seed("aplicado");
    const dropped = await seed("descartado");
    // RLS `using` hides these rows from update: no error, zero rows touched.
    await asEditor(async () => {
      await db.query("update public.links_ai_requests set status = 'descartado' where id = $1", [applied]);
      await db.query("update public.links_ai_requests set status = 'pendente' where id = $1", [dropped]);
    });
    expect(await statusOf(applied)).toBe("aplicado");
    expect(await statusOf(dropped)).toBe("descartado");
  });

  it("gives the editor no delete", async () => {
    const id = await seed("pendente");
    await asEditor(async () => {
      expect(await denied(db.query("delete from public.links_ai_requests where id = $1", [id]))).toBe(true);
    });
  });

  it("bumps updated_at on update", async () => {
    const id = await seed("pendente");
    await db.query("update public.links_ai_requests set updated_at = now() - interval '1 day' where id = $1", [id]);
    await db.query("update public.links_ai_requests set status = 'processando' where id = $1", [id]);
    const r = await db.query<{ fresh: boolean }>(
      "select updated_at > now() - interval '1 minute' as fresh from public.links_ai_requests where id = $1",
      [id]
    );
    expect(r.rows[0]!.fresh).toBe(true);
  });
});

describe("migration 021: links_ai_runs", () => {
  it("starts with the single row, last_run_at null", async () => {
    const r = await db.query<{ id: number; last_run_at: string | null }>("select * from public.links_ai_runs");
    expect(r.rows).toEqual([{ id: 1, last_run_at: null }]);
  });

  it("lets an editor read but not write", async () => {
    await asEditor(async () => {
      const r = await db.query("select last_run_at from public.links_ai_runs");
      expect(r.rows).toHaveLength(1);
      expect(await denied(db.query("update public.links_ai_runs set last_run_at = now()"))).toBe(true);
      expect(await denied(db.query("insert into public.links_ai_runs (id) values (2)"))).toBe(true);
    });
  });

  it("hides it from anon and from a non-editor", async () => {
    await as("anon", null, async () => {
      expect(await denied(db.query("select * from public.links_ai_runs"))).toBe(true);
    });
    await as("authenticated", STRANGER, async () => {
      const r = await db.query("select * from public.links_ai_runs");
      expect(r.rows).toHaveLength(0);
    });
  });

  it("lets the processor stamp last_run_at and keeps one row", async () => {
    await db.query("update public.links_ai_runs set last_run_at = now()");
    expect(await denied(db.query("insert into public.links_ai_runs (id) values (2)"))).toBe(true);
  });
});
