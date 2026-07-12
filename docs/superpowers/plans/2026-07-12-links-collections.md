# Collections (Manual) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the editor of the Experience Bucket List app (`/p/a8f3k2/`) create named "Collections" (folders) and file any experience into one or more of them, mirroring Instagram's Saved Collections UI.

**Architecture:** Two new Postgres tables (`collections`, `link_collections` join table) behind a new `collections-repo.ts` data layer; a new `collections-ui.ts` DOM module (self-contained, no import from `admin-ui.ts` — matches this codebase's existing pattern where sibling screen modules like `deck-ui.ts` build their own chrome rather than importing it); small additive hooks in `admin-ui.ts` (toolbar icon, ViewModal button) and `main.ts` (state + wiring). No pagination — collections and their membership are fetched once at boot and kept in memory, exactly like `links` already are.

**Tech Stack:** TypeScript, Vite, Supabase (`@supabase/supabase-js` v2), Vitest + jsdom, vanilla DOM (no framework).

## Global Constraints

- RLS: every new table is `authenticated`-only for select/insert/update/delete — no `anon` policies (this app restricts all reads to the logged-in editor; see `supabase/migrations/009_links_select_auth.sql`).
- SQL migrations use the existing idempotent style: `create table if not exists`, `drop policy if exists` before `create policy`, one named policy per action (not a single `for all` policy) — matches every file in `supabase/migrations/`.
- UI copy is Portuguese (pt-BR), matching every existing string in `src/links/admin-ui.ts`.
- New CSS classes are added to the single global `styles.css` (no CSS modules/scoping in this project) using the existing `links-*` BEM-ish naming.
- Applying the migration to the live Supabase project is a manual step for the human operator (schema change on shared infrastructure) — it is called out explicitly in Task 1 and is not something an executing agent runs unattended.
- `collections-ui.ts` is DOM-heavy like `admin-ui.ts`/`render.ts` and is added to `vite.config.ts`'s `coverage.exclude` (Task 4) — it is still tested via jsdom, just not counted toward the coverage metric, matching the existing precedent.

---

### Task 1: Database migration — `collections` + `link_collections`

**Files:**
- Create: `supabase/migrations/011_collections.sql`

**Interfaces:**
- Produces: tables `public.collections(id, name, created_by, created_at, updated_at)` and `public.link_collections(link_id, collection_id, added_at)` that Task 2's `collections-repo.ts` queries by name.

- [ ] **Step 1: Write the migration file**

```sql
-- Collections: user-named folders + many-to-many membership with links.
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists collections_name_unique
  on public.collections (lower(name));

drop trigger if exists collections_updated_at on public.collections;
create trigger collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

alter table public.collections enable row level security;

drop policy if exists "collections_select_auth" on public.collections;
create policy "collections_select_auth"
  on public.collections for select
  to authenticated
  using (true);

drop policy if exists "collections_insert_auth" on public.collections;
create policy "collections_insert_auth"
  on public.collections for insert
  to authenticated
  with check (true);

drop policy if exists "collections_update_auth" on public.collections;
create policy "collections_update_auth"
  on public.collections for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "collections_delete_auth" on public.collections;
create policy "collections_delete_auth"
  on public.collections for delete
  to authenticated
  using (true);

-- Join table: which links belong to which collections (many-to-many).
create table if not exists public.link_collections (
  link_id uuid not null references public.links (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (link_id, collection_id)
);

alter table public.link_collections enable row level security;

drop policy if exists "link_collections_select_auth" on public.link_collections;
create policy "link_collections_select_auth"
  on public.link_collections for select
  to authenticated
  using (true);

drop policy if exists "link_collections_insert_auth" on public.link_collections;
create policy "link_collections_insert_auth"
  on public.link_collections for insert
  to authenticated
  with check (true);

drop policy if exists "link_collections_delete_auth" on public.link_collections;
create policy "link_collections_delete_auth"
  on public.link_collections for delete
  to authenticated
  using (true);
```

Notes for the implementer:
- `public.set_updated_at()` already exists (created in `001_links.sql`) — do not redefine it.
- `link_collections` has no `update` policy: join rows are only ever inserted or deleted, never updated.
- `gen_random_uuid()` requires `pgcrypto`, already enabled in this project (used unqualified in `001_links.sql`).

- [ ] **Step 2: Review for idempotency**

Re-read the file against `supabase/migrations/001_links.sql` and `009_links_select_auth.sql` side by side. Confirm every `create table`/`create policy`/`create trigger`/`create index` has a matching `if not exists` or preceding `drop ... if exists`, so the file can be re-run safely.

- [ ] **Step 3: Apply the migration (manual, human operator only)**

This is a schema change against the live Supabase project backing `https://fashrynmqkucrlxoglsp.supabase.co` (see `.env`). Do **not** run this automatically. The human operator applies it themselves, either:

```bash
supabase db push --db-url "$SUPABASE_DB_URL"
```

or by pasting the file's contents into the Supabase Dashboard → SQL Editor and running it.

After applying, sanity-check from the dashboard's SQL editor:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('collections', 'link_collections');
```

Expected: both rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/011_collections.sql
git commit -m "feat(links): add collections + link_collections tables"
```

---

### Task 2: Collections data layer — `collections-repo.ts` + `collections-summary.ts`

**Files:**
- Create: `src/links/collections-repo.ts`
- Create: `src/links/collections-summary.ts`
- Test: `tests/unit/collections-repo.test.ts`
- Test: `tests/unit/collections-summary.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js`; `LinkRow` from `./links-repo`.
- Produces: `Collection` type, `CollectionsRepo` interface + `createCollectionsRepo(client)` factory, `CollectionSummary` type, `summarizeCollections(...)`, `linksInCollection(...)` — all consumed by Task 4/5 (`collections-ui.ts`) and Task 6 (`main.ts`).

- [ ] **Step 1: Write the failing repo tests**

Create `tests/unit/collections-repo.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createCollectionsRepo } from "../../src/links/collections-repo";
import type { SupabaseClient } from "@supabase/supabase-js";

type FakeResult = { data: unknown; error: unknown };

function makeQueryBuilder(result: FakeResult) {
  const builder: Record<string, unknown> = {};

  const chain = (name: string) => {
    builder[name] = vi.fn().mockReturnValue(builder);
  };

  chain("select");
  chain("insert");
  chain("update");
  chain("delete");
  chain("eq");

  builder["single"] = vi.fn().mockResolvedValue(result);
  builder["then"] = (resolve: (v: FakeResult) => void) => {
    Promise.resolve(result).then(resolve);
  };

  return builder;
}

function makeFakeClient(resultOverrides: Partial<Record<string, FakeResult>> = {}) {
  const defaultResult: FakeResult = { data: [], error: null };
  const fromMock = vi.fn((table: string) => {
    const result = resultOverrides[table] ?? defaultResult;
    return makeQueryBuilder(result);
  });
  return { from: fromMock } as unknown as SupabaseClient;
}

describe("listCollections", () => {
  it("selects from collections table", async () => {
    const rows = [
      { id: "1", name: "Comida dicas" },
      { id: "2", name: "Viagem Tips" },
    ];
    const client = makeFakeClient({ collections: { data: rows, error: null } });
    const repo = createCollectionsRepo(client);
    const result = await repo.listCollections();

    expect(client.from).toHaveBeenCalledWith("collections");
    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.select).toHaveBeenCalled();
    expect(builder.order).toHaveBeenCalledWith("name", { ascending: true });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Comida dicas");
  });

  it("throws when supabase returns an error", async () => {
    const client = makeFakeClient({ collections: { data: null, error: { message: "DB error" } } });
    const repo = createCollectionsRepo(client);
    await expect(repo.listCollections()).rejects.toThrow("DB error");
  });
});

describe("createCollection", () => {
  it("inserts the trimmed name", async () => {
    const createdRow = { id: "new-id", name: "Viagem Tips" };
    const client = makeFakeClient({ collections: { data: createdRow, error: null } });
    const repo = createCollectionsRepo(client);
    const result = await repo.createCollection("  Viagem Tips  ");

    expect(client.from).toHaveBeenCalledWith("collections");
    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith({ name: "Viagem Tips" });
    expect(result.id).toBe("new-id");
  });

  it("rejects an empty name", async () => {
    const client = makeFakeClient();
    const repo = createCollectionsRepo(client);
    await expect(repo.createCollection("   ")).rejects.toThrow(/name/i);
  });

  it("rejects a name longer than 80 characters", async () => {
    const client = makeFakeClient();
    const repo = createCollectionsRepo(client);
    await expect(repo.createCollection("x".repeat(81))).rejects.toThrow(/name/i);
  });
});

describe("renameCollection", () => {
  it("updates with id filter", async () => {
    const client = makeFakeClient({ collections: { data: {}, error: null } });
    const repo = createCollectionsRepo(client);
    await repo.renameCollection("col-1", "Novo nome");

    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ name: "Novo nome" });
    expect(builder.eq).toHaveBeenCalledWith("id", "col-1");
  });

  it("rejects an empty name", async () => {
    const client = makeFakeClient();
    const repo = createCollectionsRepo(client);
    await expect(repo.renameCollection("col-1", "")).rejects.toThrow(/name/i);
  });
});

describe("deleteCollection", () => {
  it("deletes with id filter", async () => {
    const client = makeFakeClient({ collections: { data: {}, error: null } });
    const repo = createCollectionsRepo(client);
    await repo.deleteCollection("col-1");

    expect(client.from).toHaveBeenCalledWith("collections");
    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("id", "col-1");
  });
});

describe("listLinkCollectionIds", () => {
  it("groups collection ids by link id", async () => {
    const rows = [
      { link_id: "link-1", collection_id: "col-1" },
      { link_id: "link-1", collection_id: "col-2" },
      { link_id: "link-2", collection_id: "col-1" },
    ];
    const client = makeFakeClient({ link_collections: { data: rows, error: null } });
    const repo = createCollectionsRepo(client);
    const result = await repo.listLinkCollectionIds();

    expect(client.from).toHaveBeenCalledWith("link_collections");
    expect(result).toEqual({
      "link-1": ["col-1", "col-2"],
      "link-2": ["col-1"],
    });
  });

  it("returns an empty map when there are no rows", async () => {
    const client = makeFakeClient({ link_collections: { data: [], error: null } });
    const repo = createCollectionsRepo(client);
    await expect(repo.listLinkCollectionIds()).resolves.toEqual({});
  });
});

describe("addLinkToCollection", () => {
  it("inserts link_id and collection_id", async () => {
    const client = makeFakeClient({ link_collections: { data: {}, error: null } });
    const repo = createCollectionsRepo(client);
    await repo.addLinkToCollection("link-1", "col-1");

    expect(client.from).toHaveBeenCalledWith("link_collections");
    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith({ link_id: "link-1", collection_id: "col-1" });
  });

  it("throws when supabase returns an error", async () => {
    const client = makeFakeClient({
      link_collections: { data: null, error: { message: "duplicate key" } },
    });
    const repo = createCollectionsRepo(client);
    await expect(repo.addLinkToCollection("link-1", "col-1")).rejects.toThrow("duplicate key");
  });
});

describe("removeLinkFromCollection", () => {
  it("deletes filtering by both link_id and collection_id", async () => {
    const client = makeFakeClient({ link_collections: { data: {}, error: null } });
    const repo = createCollectionsRepo(client);
    await repo.removeLinkFromCollection("link-1", "col-1");

    const builder = (client.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenNthCalledWith(1, "link_id", "link-1");
    expect(builder.eq).toHaveBeenNthCalledWith(2, "collection_id", "col-1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/collections-repo.test.ts`
Expected: FAIL — `Cannot find module '../../src/links/collections-repo'`

- [ ] **Step 3: Add `order` chaining to the test's query builder**

The `makeQueryBuilder` helper above is missing an `order` chain method (needed by `listCollections`). Add it right after `chain("select")`:

```typescript
  chain("select");
  chain("order");
  chain("insert");
```

- [ ] **Step 4: Write `collections-repo.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export type Collection = {
  id: string;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
};

function normalizeCollection(
  row: Partial<Collection> & Pick<Collection, "id" | "name">
): Collection {
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function validateCollectionName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length < 1) {
    throw new Error("name must not be empty");
  }
  if (trimmed.length > 80) {
    throw new Error("name must not exceed 80 characters");
  }
}

export interface CollectionsRepo {
  listCollections(): Promise<Collection[]>;
  createCollection(name: string): Promise<Collection>;
  renameCollection(id: string, name: string): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  listLinkCollectionIds(): Promise<Record<string, string[]>>;
  addLinkToCollection(linkId: string, collectionId: string): Promise<void>;
  removeLinkFromCollection(linkId: string, collectionId: string): Promise<void>;
}

export function createCollectionsRepo(client: SupabaseClient): CollectionsRepo {
  return {
    async listCollections(): Promise<Collection[]> {
      const result = await (client
        .from("collections")
        .select("*")
        .order("name", { ascending: true }) as unknown as Promise<{
        data: Array<Partial<Collection> & Pick<Collection, "id" | "name">> | null;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
      return (result.data ?? []).map(normalizeCollection);
    },

    async createCollection(name: string): Promise<Collection> {
      validateCollectionName(name);
      const trimmed = name.trim();

      const result = await (client
        .from("collections")
        .insert({ name: trimmed })
        .select()
        .single() as unknown as Promise<{
        data: (Partial<Collection> & Pick<Collection, "id" | "name">) | null;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
      return normalizeCollection(result.data!);
    },

    async renameCollection(id: string, name: string): Promise<void> {
      validateCollectionName(name);
      const trimmed = name.trim();

      const result = await (client
        .from("collections")
        .update({ name: trimmed })
        .eq("id", id) as unknown as Promise<{
        data: unknown;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
    },

    async deleteCollection(id: string): Promise<void> {
      const result = await (client
        .from("collections")
        .delete()
        .eq("id", id) as unknown as Promise<{
        data: unknown;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
    },

    async listLinkCollectionIds(): Promise<Record<string, string[]>> {
      const result = await (client
        .from("link_collections")
        .select("link_id, collection_id") as unknown as Promise<{
        data: Array<{ link_id: string; collection_id: string }> | null;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);

      const map: Record<string, string[]> = {};
      for (const row of result.data ?? []) {
        (map[row.link_id] ??= []).push(row.collection_id);
      }
      return map;
    },

    async addLinkToCollection(linkId: string, collectionId: string): Promise<void> {
      const result = await (client
        .from("link_collections")
        .insert({ link_id: linkId, collection_id: collectionId }) as unknown as Promise<{
        data: unknown;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
    },

    async removeLinkFromCollection(linkId: string, collectionId: string): Promise<void> {
      const result = await (client
        .from("link_collections")
        .delete()
        .eq("link_id", linkId)
        .eq("collection_id", collectionId) as unknown as Promise<{
        data: unknown;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/collections-repo.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 6: Write the failing summary tests**

Create `tests/unit/collections-summary.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { summarizeCollections, linksInCollection } from "../../src/links/collections-summary";
import type { Collection } from "../../src/links/collections-repo";
import type { LinkRow } from "../../src/links/links-repo";

function link(partial: Partial<LinkRow> & Pick<LinkRow, "id">): LinkRow {
  return {
    url: "https://example.com",
    label: "Experiência",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: null,
    sort_order: 0,
    scheduled_start: null,
    scheduled_end: null,
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    ...partial,
  };
}

function collection(partial: Partial<Collection> & Pick<Collection, "id" | "name">): Collection {
  return { ...partial };
}

describe("summarizeCollections", () => {
  it("counts members and picks the first image as cover", () => {
    const collections = [
      collection({ id: "col-1", name: "Viagem Tips" }),
      collection({ id: "col-2", name: "Comida dicas" }),
    ];
    const links = [
      link({ id: "link-1", image_url: null }),
      link({ id: "link-2", image_url: "https://img.example.com/a.jpg" }),
      link({ id: "link-3", image_url: "https://img.example.com/b.jpg" }),
    ];
    const linkCollectionIds = {
      "link-1": ["col-1"],
      "link-2": ["col-1"],
      "link-3": ["col-2"],
    };

    const result = summarizeCollections(collections, links, linkCollectionIds);

    expect(result).toEqual([
      { collection: collections[0], itemCount: 2, coverUrl: "https://img.example.com/a.jpg" },
      { collection: collections[1], itemCount: 1, coverUrl: "https://img.example.com/b.jpg" },
    ]);
  });

  it("returns itemCount 0 and coverUrl null for a collection with no members", () => {
    const collections = [collection({ id: "col-1", name: "Vazia" })];
    const result = summarizeCollections(collections, [], {});
    expect(result).toEqual([{ collection: collections[0], itemCount: 0, coverUrl: null }]);
  });
});

describe("linksInCollection", () => {
  it("returns only links whose membership includes the collection id", () => {
    const links = [
      link({ id: "link-1" }),
      link({ id: "link-2" }),
      link({ id: "link-3" }),
    ];
    const linkCollectionIds = {
      "link-1": ["col-1"],
      "link-2": ["col-2"],
      "link-3": ["col-1", "col-2"],
    };

    const result = linksInCollection("col-1", links, linkCollectionIds);
    expect(result.map((l) => l.id)).toEqual(["link-1", "link-3"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(linksInCollection("col-x", [link({ id: "link-1" })], {})).toEqual([]);
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/collections-summary.test.ts`
Expected: FAIL — `Cannot find module '../../src/links/collections-summary'`

- [ ] **Step 8: Write `collections-summary.ts`**

```typescript
import type { LinkRow } from "./links-repo";
import type { Collection } from "./collections-repo";

export type CollectionSummary = {
  collection: Collection;
  itemCount: number;
  coverUrl: string | null;
};

export function summarizeCollections(
  collections: readonly Collection[],
  links: readonly LinkRow[],
  linkCollectionIds: Record<string, string[]>
): CollectionSummary[] {
  return collections.map((collection) => {
    const members = linksInCollection(collection.id, links, linkCollectionIds);
    const withImage = members.find((link) => link.image_url);
    return {
      collection,
      itemCount: members.length,
      coverUrl: withImage?.image_url ?? null,
    };
  });
}

export function linksInCollection(
  collectionId: string,
  links: readonly LinkRow[],
  linkCollectionIds: Record<string, string[]>
): LinkRow[] {
  return links.filter((link) =>
    (linkCollectionIds[link.id] ?? []).includes(collectionId)
  );
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/collections-summary.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 10: Full unit suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass (existing + 18 new), no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/links/collections-repo.ts src/links/collections-summary.ts \
  tests/unit/collections-repo.test.ts tests/unit/collections-summary.test.ts
git commit -m "feat(links): add collections data layer (repo + summary helpers)"
```

---

### Task 3: `admin-ui.ts` integration points (icon, toolbar, ViewModal)

**Files:**
- Modify: `src/links/admin-ui.ts`
- Modify: `src/links/skeleton.ts`
- Modify: `tests/unit/admin-ui.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createToolbar(...)` gains a 4th parameter `onCollections: () => void` (inserted between `onFilter` and `onDraw`); `ViewModalCallbacks` gains `onCollections: (link: LinkRow) => void`. Task 6 (`main.ts`) calls both with the real handlers.

- [ ] **Step 1: Update the two `createViewModal` tests that assert the action button list**

In `tests/unit/admin-ui.test.ts`, both call sites currently omit `onCollections` and both `actionButtons` assertions will need a 4th entry once Task 3 Step 4 lands. Make the change now so the red→green cycle is visible:

```typescript
  it("shows Agendar above Editar when the link has no schedule", () => {
    const onEdit = vi.fn();
    const onSchedule = vi.fn();
    const onMarkDone = vi.fn();
    const onCollections = vi.fn();
    const modal = createViewModal({ onEdit, onSchedule, onMarkDone, onCollections });
    document.body.appendChild(modal.element);

    modal.open(row());

    const actionButtons = [
      ...modal.element.querySelectorAll(
        ".links-admin-form__actions button"
      ),
    ].map((btn) => btn.textContent?.trim());
    expect(actionButtons).toEqual(["Agendar", "Marcar como feita", "Editar", "Collections"]);
```

(keep the rest of that `it` block unchanged) and:

```typescript
  it("shows Agenda label and opens schedule sheet callback when scheduled", () => {
    const callbacks = { onEdit: vi.fn(), onSchedule: vi.fn(), onMarkDone: vi.fn(), onCollections: vi.fn() };
    const modal = createViewModal(callbacks);
    document.body.appendChild(modal.element);

    modal.open(
      row({
        scheduled_start: "2026-08-03T09:00:00-03:00",
        scheduled_end: "2026-08-03T17:00:00-03:00",
      })
    );

    expect(modal.element.textContent).toContain("Agendado");
    expect(modal.element.textContent).toContain("3 ago 2026 · 09:00–17:00");
    const actionButtons = [
      ...modal.element.querySelectorAll(
        ".links-admin-form__actions button"
      ),
    ].map((btn) => btn.textContent?.trim());
    expect(actionButtons).toEqual(["Agenda", "Marcar como feita", "Editar", "Collections"]);
```

(keep the rest of that `it` block unchanged — the click assertions below still target the first button, which stays "Agendar"/"Agenda".)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/admin-ui.test.ts`
Expected: FAIL — TS error "Property 'onCollections' is missing" (once Step 4's type change lands) or, before that, the `actionButtons` assertions fail with a 3-element array (run this now to see the array-length mismatch: `expected [ 'Agendar', 'Marcar como feita', 'Editar', 'Collections' ], received [ 'Agendar', 'Marcar como feita', 'Editar' ]`).

- [ ] **Step 3: Add the bookmark icon**

In `src/links/admin-ui.ts`, right after `iconLogout()` (defined around line 272-278), add:

```typescript
/** Bookmark — collections. */
function iconCollections(): SVGSVGElement {
  return strokeIcon(
    "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"
  );
}
```

- [ ] **Step 4: Add the toolbar button and the new parameter**

Change the `createToolbar` signature (around line 315) from:

```typescript
export function createToolbar(
  onNew: () => void,
  onSignOut: () => void,
  onFilter: () => void,
  onDraw: () => void,
  onDeck: () => void,
  activeCategories: readonly Category[] = []
): HTMLElement {
```

to:

```typescript
export function createToolbar(
  onNew: () => void,
  onSignOut: () => void,
  onFilter: () => void,
  onCollections: () => void,
  onDraw: () => void,
  onDeck: () => void,
  activeCategories: readonly Category[] = []
): HTMLElement {
```

Right after the `filterBtn` block (ends with `filterBtn.addEventListener("click", onFilter);`) and before the `drawBtn` block, insert:

```typescript
  const collectionsBtn = document.createElement("button");
  collectionsBtn.type = "button";
  collectionsBtn.className =
    "links-admin-button links-admin-button--ghost links-admin-button--icon";
  collectionsBtn.setAttribute("aria-label", "Collections");
  collectionsBtn.title = "Collections";
  collectionsBtn.appendChild(iconCollections());
  collectionsBtn.addEventListener("click", onCollections);
```

Change the `row.append(...)` line from:

```typescript
  row.append(newBtn, filterBtn, drawBtn, deckBtn, signOutBtn);
```

to:

```typescript
  row.append(newBtn, filterBtn, collectionsBtn, drawBtn, deckBtn, signOutBtn);
```

And update the tip text right below it from:

```typescript
  tip.textContent =
    "Toque para ver · Deslize → editar · ← excluir · Filtrar · Sortear · Deck";
```

to:

```typescript
  tip.textContent =
    "Toque para ver · Deslize → editar · ← excluir · Filtrar · Collections · Sortear · Deck";
```

- [ ] **Step 5: Add `onCollections` to `ViewModalCallbacks` and the ViewModal button**

Change (around line 1586):

```typescript
export type ViewModalCallbacks = {
  onEdit: (link: LinkRow) => void;
  onSchedule: (link: LinkRow) => void;
  onMarkDone: (link: LinkRow) => void;
};
```

to:

```typescript
export type ViewModalCallbacks = {
  onEdit: (link: LinkRow) => void;
  onSchedule: (link: LinkRow) => void;
  onMarkDone: (link: LinkRow) => void;
  onCollections: (link: LinkRow) => void;
};
```

In `createViewModal`, right after the `editBtn` declaration block (ends with `editBtn.textContent = "Editar";`) add:

```typescript
  const collectionsBtn = document.createElement("button");
  collectionsBtn.type = "button";
  collectionsBtn.className =
    "links-admin-button links-admin-button--ghost links-admin-button--block";
  collectionsBtn.textContent = "Collections";
```

Change:

```typescript
  actions.append(scheduleBtn, markDoneBtn, editBtn);
```

to:

```typescript
  actions.append(scheduleBtn, markDoneBtn, editBtn, collectionsBtn);
```

Right after the existing `editBtn.addEventListener(...)` block, add:

```typescript
  collectionsBtn.addEventListener("click", () => {
    if (!current) return;
    const link = current;
    close();
    cb.onCollections(link);
  });
```

- [ ] **Step 6: Make the delete-confirm sheet's title overridable**

`createDeleteConfirmSheet` (used today only for deleting an experience) is reused as-is in Task 6 to confirm deleting a *collection*. Its body paragraph is already dynamic (`Excluir "${label}"?`), but its screen title is frozen at construction as "Excluir experiência?" — reused unchanged it would misleadingly say "Excluir experiência?" while asking about a collection. Make the title overridable per-call.

Change the destructure at the top of `createDeleteConfirmSheet` (around line 1042) from:

```typescript
  const { overlay, dialog, backBtn } = createScreenChrome(
    "links-delete-title",
    "Excluir experiência?",
    "alertdialog"
  );
```

to:

```typescript
  const { overlay, dialog, title: titleEl, backBtn } = createScreenChrome(
    "links-delete-title",
    "Excluir experiência?",
    "alertdialog"
  );
```

Change the `DeleteSheetHandle` type from:

```typescript
export type DeleteSheetHandle = {
  element: HTMLElement;
  open: (label: string, onConfirm: () => void | Promise<void>) => void;
  close: () => void;
};
```

to:

```typescript
export type DeleteSheetHandle = {
  element: HTMLElement;
  open: (label: string, onConfirm: () => void | Promise<void>, title?: string) => void;
  close: () => void;
};
```

Change the `open` function from:

```typescript
  function open(label: string, onConfirm: () => void | Promise<void>): void {
    body.textContent = `Excluir "${label}"? Esta ação não pode ser desfeita.`;
    onConfirmCb = onConfirm;
    overlay.hidden = false;
    syncBodyScreenLock();
    confirmBtn.focus();
  }
```

to:

```typescript
  function open(
    label: string,
    onConfirm: () => void | Promise<void>,
    title = "Excluir experiência?"
  ): void {
    titleEl.textContent = title;
    body.textContent = `Excluir "${label}"? Esta ação não pode ser desfeita.`;
    onConfirmCb = onConfirm;
    overlay.hidden = false;
    syncBodyScreenLock();
    confirmBtn.focus();
  }
```

This is additive and backward-compatible: `main.ts`'s existing 2-argument call (`deleteSheet.open(link.label, async () => {...})`) keeps working unchanged, defaulting to the original title.

- [ ] **Step 7: Fix the toolbar skeleton bone count**

In `src/links/skeleton.ts`, `renderToolbarSkeleton` currently renders 5 placeholder icons for 5 toolbar buttons. Change:

```typescript
  for (let i = 0; i < 5; i++) {
    row.appendChild(bone("links-skeleton__icon"));
  }
```

to:

```typescript
  for (let i = 0; i < 6; i++) {
    row.appendChild(bone("links-skeleton__icon"));
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/admin-ui.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. (`createToolbar`'s new required parameter has no other call sites yet outside `main.ts`, which Task 6 updates — until then `npx tsc --noEmit` will show a "expected 7 arguments, got 6" error at `main.ts`'s existing call site; that's expected and resolved in Task 6. If you want a fully green typecheck at the end of this task, temporarily pass `() => undefined` as a placeholder 4th argument at that one call site in `main.ts`, to be replaced for real in Task 6.)

- [ ] **Step 9: Commit**

```bash
git add src/links/admin-ui.ts src/links/skeleton.ts tests/unit/admin-ui.test.ts
git commit -m "feat(links): add Collections entry points to toolbar and ViewModal"
```

---

### Task 4: `collections-ui.ts` (part 1) — collection form sheet + collections list screen

**Files:**
- Create: `src/links/collections-ui.ts`
- Modify: `vite.config.ts`
- Modify: `styles.css`
- Test: `tests/unit/collections-ui.test.ts`

**Interfaces:**
- Consumes: `Collection` from `./collections-repo`; `CollectionSummary` from `./collections-summary`; `setScreenBusy` from `./skeleton`; `syncBodyScreenLock` from `./screen-lock`.
- Produces: `CollectionFormHandle` + `createCollectionFormSheet(onSubmit)`; `CollectionsListHandle` + `createCollectionsListScreen(cb)`. Consumed by Task 6 (`main.ts`).

- [ ] **Step 1: Exclude the new file from coverage**

In `vite.config.ts`, change:

```typescript
      coverage: {
        include: ["src/links/**/*.ts"],
        exclude: ["src/links/main.ts", "src/links/admin-ui.ts", "src/links/render.ts"],
      },
```

to:

```typescript
      coverage: {
        include: ["src/links/**/*.ts"],
        exclude: [
          "src/links/main.ts",
          "src/links/admin-ui.ts",
          "src/links/render.ts",
          "src/links/collections-ui.ts",
        ],
      },
```

- [ ] **Step 2: Write the failing test for the form sheet**

Create `tests/unit/collections-ui.test.ts`:

```typescript
/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCollectionFormSheet,
  createCollectionsListScreen,
} from "../../src/links/collections-ui";
import type { Collection } from "../../src/links/collections-repo";
import type { CollectionSummary } from "../../src/links/collections-summary";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("createCollectionFormSheet", () => {
  it("openCreate shows an empty 'Nova collection' form and submits the typed name", () => {
    const onSubmit = vi.fn();
    const sheet = createCollectionFormSheet(onSubmit);
    document.body.appendChild(sheet.element);

    sheet.openCreate();
    expect(sheet.element.hidden).toBe(false);
    expect(sheet.element.textContent).toContain("Nova collection");

    const input = sheet.element.querySelector(
      "#links-collection-form-name"
    ) as HTMLInputElement;
    expect(input.value).toBe("");
    input.value = "Praias";
    sheet.element.querySelector("form")?.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true })
    );

    expect(onSubmit).toHaveBeenCalledWith("Praias", null);
  });

  it("openEdit pre-fills the name and submits with the collection id", () => {
    const onSubmit = vi.fn();
    const sheet = createCollectionFormSheet(onSubmit);
    document.body.appendChild(sheet.element);

    sheet.openEdit({ id: "col-1", name: "Viagem Tips" });
    const input = sheet.element.querySelector(
      "#links-collection-form-name"
    ) as HTMLInputElement;
    expect(input.value).toBe("Viagem Tips");
    expect(sheet.element.textContent).toContain("Renomear collection");

    input.value = "Viagem Tips 2026";
    sheet.element.querySelector("form")?.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true })
    );
    expect(onSubmit).toHaveBeenCalledWith("Viagem Tips 2026", "col-1");
  });

  it("blocks submit with an inline error when the name is blank", () => {
    const onSubmit = vi.fn();
    const sheet = createCollectionFormSheet(onSubmit);
    document.body.appendChild(sheet.element);
    sheet.openCreate();

    sheet.element.querySelector("form")?.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true })
    );

    expect(onSubmit).not.toHaveBeenCalled();
    expect(sheet.element.textContent).toContain("Informe um nome.");
  });

  it("setError and setBusy toggle the expected UI state", () => {
    const sheet = createCollectionFormSheet(vi.fn());
    document.body.appendChild(sheet.element);
    sheet.openCreate();

    sheet.setError("Nome já usado.");
    expect(sheet.element.textContent).toContain("Nome já usado.");

    sheet.setBusy(true);
    expect(sheet.element.querySelector(".links-skeleton-screen")).toBeTruthy();
    sheet.setBusy(false);
  });
});

function summary(partial: Partial<CollectionSummary> & { collection: Collection }): CollectionSummary {
  return { itemCount: 0, coverUrl: null, ...partial };
}

describe("createCollectionsListScreen", () => {
  it("shows the empty state when there are no collections", () => {
    const screen = createCollectionsListScreen({ onOpenCollection: vi.fn(), onCreate: vi.fn() });
    document.body.appendChild(screen.element);

    screen.open([]);
    expect(screen.element.textContent).toContain("Nenhuma collection ainda. Crie a primeira.");
  });

  it("renders a row per collection with name and item count, and opens on click", () => {
    const onOpenCollection = vi.fn();
    const screen = createCollectionsListScreen({ onOpenCollection, onCreate: vi.fn() });
    document.body.appendChild(screen.element);

    const summaries = [
      summary({ collection: { id: "col-1", name: "Comida dicas" }, itemCount: 3 }),
      summary({ collection: { id: "col-2", name: "Praias" }, itemCount: 1 }),
    ];
    screen.open(summaries);

    const rows = [...screen.element.querySelectorAll(".links-collections-list__row")];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Comida dicas");
    expect(rows[0].textContent).toContain("3 experiências");
    expect(rows[1].textContent).toContain("1 experiência");

    (rows[0] as HTMLElement).click();
    expect(onOpenCollection).toHaveBeenCalledWith(summaries[0].collection);
  });

  it("calls onCreate when 'Nova collection' is clicked", () => {
    const onCreate = vi.fn();
    const screen = createCollectionsListScreen({ onOpenCollection: vi.fn(), onCreate });
    document.body.appendChild(screen.element);
    screen.open([]);

    (screen.element.querySelector(".links-collections-list__new") as HTMLElement).click();
    expect(onCreate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/collections-ui.test.ts`
Expected: FAIL — `Cannot find module '../../src/links/collections-ui'`

- [ ] **Step 4: Write `collections-ui.ts` (form sheet + list screen)**

```typescript
import type { Collection } from "./collections-repo";
import type { CollectionSummary } from "./collections-summary";
import { setScreenBusy } from "./skeleton";
import { syncBodyScreenLock } from "./screen-lock";

// ---------------------------------------------------------------------------
// Shared full-screen chrome (overlay/dialog/header/back/title). Kept local
// rather than imported from admin-ui.ts — this module intentionally builds
// its own chrome, matching the existing deck-ui.ts precedent of
// self-contained screen modules composed together only in main.ts. Shared
// here, within this module, so the three screens below don't triple it.
// ---------------------------------------------------------------------------

type ScreenShell = {
  overlay: HTMLElement;
  dialog: HTMLElement;
  header: HTMLElement;
  backBtn: HTMLButtonElement;
  title: HTMLHeadingElement;
};

function createScreenShell(titleId: string): ScreenShell {
  const overlay = document.createElement("div");
  overlay.className = "links-admin-modal";
  overlay.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "links-admin-modal__dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", titleId);

  const header = document.createElement("header");
  header.className = "links-admin-screen__header";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "links-admin-screen__back";
  backBtn.textContent = "Voltar";

  const title = document.createElement("h2");
  title.className = "links-admin-modal__title links-admin-screen__title";
  title.id = titleId;

  header.append(backBtn, title);
  overlay.appendChild(dialog);

  return { overlay, dialog, header, backBtn, title };
}

// ---------------------------------------------------------------------------
// Create / rename form.
// ---------------------------------------------------------------------------

export type CollectionFormHandle = {
  element: HTMLElement;
  openCreate: () => void;
  openEdit: (collection: Collection) => void;
  close: () => void;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
};

export function createCollectionFormSheet(
  onSubmit: (name: string, editingId: string | null) => void
): CollectionFormHandle {
  let editingId: string | null = null;

  const { overlay, dialog, header, backBtn, title } = createScreenShell(
    "links-collection-form-title"
  );

  const form = document.createElement("form");
  form.className = "links-admin-form links-admin-form--screen";
  form.noValidate = true;

  const field = document.createElement("div");
  field.className = "links-admin-form__field";

  const label = document.createElement("label");
  label.className = "links-admin-form__label";
  label.htmlFor = "links-collection-form-name";
  label.textContent = "Nome";

  const input = document.createElement("input");
  input.className = "links-admin-form__control";
  input.id = "links-collection-form-name";
  input.type = "text";
  input.maxLength = 80;

  field.append(label, input);

  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "links-admin-form__actions links-admin-form__actions--sticky";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className =
    "links-admin-button links-admin-button--primary links-admin-button--block";
  submitBtn.textContent = "Salvar";

  actions.append(submitBtn);
  form.append(field, error, actions);
  dialog.append(header, form);

  function close(): void {
    overlay.hidden = true;
    editingId = null;
    error.hidden = true;
    error.textContent = "";
    form.reset();
    syncBodyScreenLock();
  }

  function openCreate(): void {
    editingId = null;
    title.textContent = "Nova collection";
    submitBtn.textContent = "Criar";
    input.value = "";
    error.hidden = true;
    overlay.hidden = false;
    syncBodyScreenLock();
    input.focus();
  }

  function openEdit(collection: Collection): void {
    editingId = collection.id;
    title.textContent = "Renomear collection";
    submitBtn.textContent = "Salvar";
    input.value = collection.name;
    error.hidden = true;
    overlay.hidden = false;
    syncBodyScreenLock();
    input.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (input.value.trim().length === 0) {
      error.hidden = false;
      error.textContent = "Informe um nome.";
      return;
    }
    onSubmit(input.value, editingId);
  });

  backBtn.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return {
    element: overlay,
    openCreate,
    openEdit,
    close,
    setError(message: string) {
      error.textContent = message;
      error.hidden = false;
    },
    setBusy(busy: boolean) {
      submitBtn.disabled = busy;
      backBtn.disabled = busy;
      setScreenBusy(dialog, busy);
    },
  };
}

// ---------------------------------------------------------------------------
// Collections list screen (browse all collections; toolbar entry point).
// ---------------------------------------------------------------------------

function createCoverEl(coverUrl: string | null, name: string): HTMLElement {
  if (coverUrl) {
    const img = document.createElement("img");
    img.className = "links-collections-list__cover";
    img.src = coverUrl;
    img.alt = "";
    return img;
  }
  const mono = document.createElement("span");
  mono.className =
    "links-collections-list__cover links-collections-list__cover--mono";
  mono.textContent = (name.trim()[0] ?? "?").toUpperCase();
  mono.setAttribute("aria-hidden", "true");
  return mono;
}

export type CollectionsListHandle = {
  element: HTMLElement;
  open: (summaries: CollectionSummary[]) => void;
  close: () => void;
};

export function createCollectionsListScreen(cb: {
  onOpenCollection: (collection: Collection) => void;
  onCreate: () => void;
}): CollectionsListHandle {
  const { overlay, dialog, header, backBtn, title } = createScreenShell(
    "links-collections-title"
  );
  title.textContent = "Collections";

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className =
    "links-admin-button links-admin-button--ghost links-admin-button--block links-collections-list__new";
  newBtn.textContent = "Nova collection";
  newBtn.addEventListener("click", () => cb.onCreate());

  const list = document.createElement("div");
  list.className = "links-collections-list";

  dialog.append(header, newBtn, list);

  function renderRow(summary: CollectionSummary): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "links-collections-list__row";
    row.appendChild(createCoverEl(summary.coverUrl, summary.collection.name));

    const text = document.createElement("span");
    text.className = "links-collections-list__text";

    const name = document.createElement("span");
    name.className = "links-collections-list__name";
    name.textContent = summary.collection.name;

    const count = document.createElement("span");
    count.className = "links-collections-list__count";
    count.textContent =
      summary.itemCount === 1
        ? "1 experiência"
        : `${summary.itemCount} experiências`;

    text.append(name, count);
    row.appendChild(text);
    row.addEventListener("click", () => cb.onOpenCollection(summary.collection));
    return row;
  }

  function close(): void {
    overlay.hidden = true;
    syncBodyScreenLock();
  }

  function open(summaries: CollectionSummary[]): void {
    list.replaceChildren();
    if (summaries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "links-status";
      empty.textContent = "Nenhuma collection ainda. Crie a primeira.";
      list.appendChild(empty);
    } else {
      for (const summary of summaries) {
        list.appendChild(renderRow(summary));
      }
    }
    overlay.hidden = false;
    syncBodyScreenLock();
  }

  backBtn.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return { element: overlay, open, close };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/collections-ui.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Add the CSS for the list screen**

In `styles.css`, right after the `.links-admin-button--filter-active::after { ... }` block (just before the `/* Category filter bottom sheet */` comment), add:

```css
/* Collections list screen (browse all collections). */
.links-collections-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 16px calc(20px + env(safe-area-inset-bottom, 0px));
}

.links-collections-list__new {
  margin: 12px 16px 4px;
  width: auto;
}

.links-collections-list__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 4px;
  border: none;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.links-collections-list__row:hover,
.links-collections-list__row:focus-visible {
  background: var(--bg, #eef2f6);
  outline: none;
}

.links-collections-list__cover {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--bg, #eef2f6);
}

.links-collections-list__cover--mono {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--green-dark, #276749);
  background: var(--green-light, #e8f5ef);
  font-size: 1.1rem;
  font-weight: 700;
}

.links-collections-list__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.links-collections-list__name {
  color: var(--navy);
  font-size: 1rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.links-collections-list__count {
  color: var(--text-muted, #5a6570);
  font-size: 0.82rem;
}
```

- [ ] **Step 7: Typecheck + full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors (aside from the known, expected `main.ts` `createToolbar` argument-count mismatch already noted in Task 3 — resolved in Task 6); all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/links/collections-ui.ts vite.config.ts styles.css tests/unit/collections-ui.test.ts
git commit -m "feat(links): add collection form sheet and collections list screen"
```

---

### Task 5: `collections-ui.ts` (part 2) — collection detail screen + picker sheet

**Files:**
- Modify: `src/links/collections-ui.ts`
- Modify: `styles.css`
- Modify: `tests/unit/collections-ui.test.ts`

**Interfaces:**
- Consumes: `LinkRow` from `./links-repo` (type-only); everything Task 4 produced.
- Produces: `CollectionDetailHandle` + `createCollectionDetailScreen(cb)`; `CollectionsPickerOpenOpts`, `CollectionsPickerHandle` + `createCollectionsPickerSheet()`. Consumed by Task 6 (`main.ts`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/collections-ui.test.ts` (add the import first):

```typescript
import {
  createCollectionFormSheet,
  createCollectionsListScreen,
  createCollectionDetailScreen,
  createCollectionsPickerSheet,
} from "../../src/links/collections-ui";
```

(replace the existing narrower import from Task 4's Step 2 with this one) then append:

```typescript
describe("createCollectionDetailScreen", () => {
  it("shows the empty state when the collection has no members", () => {
    const screen = createCollectionDetailScreen({
      renderCard: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
    });
    document.body.appendChild(screen.element);

    screen.open({ id: "col-1", name: "Praias" }, []);
    expect(screen.element.textContent).toContain("Praias");
    expect(screen.element.textContent).toContain(
      "Nenhuma experiência nesta collection ainda."
    );
  });

  it("renders a card per link via the injected renderCard callback", () => {
    const card1 = document.createElement("div");
    card1.textContent = "Card 1";
    const renderCard = vi.fn().mockReturnValue(card1);
    const screen = createCollectionDetailScreen({
      renderCard,
      onRename: vi.fn(),
      onDelete: vi.fn(),
    });
    document.body.appendChild(screen.element);

    const link = { id: "link-1" } as never;
    screen.open({ id: "col-1", name: "Praias" }, [link]);

    expect(renderCard).toHaveBeenCalledWith(link);
    expect(screen.element.querySelector(".links-collections-detail__list")?.textContent).toContain(
      "Card 1"
    );
  });

  it("calls onRename and onDelete with the open collection", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const screen = createCollectionDetailScreen({
      renderCard: vi.fn(),
      onRename,
      onDelete,
    });
    document.body.appendChild(screen.element);

    const collection = { id: "col-1", name: "Praias" };
    screen.open(collection, []);

    (screen.element.querySelector(
      ".links-admin-form__actions button:first-child"
    ) as HTMLElement).click();
    expect(onRename).toHaveBeenCalledWith(collection);

    (screen.element.querySelector(
      ".links-admin-form__actions button:last-child"
    ) as HTMLElement).click();
    expect(onDelete).toHaveBeenCalledWith(collection);
  });
});

describe("createCollectionsPickerSheet", () => {
  it("renders one row per collection, toggled on for active ids", () => {
    const sheet = createCollectionsPickerSheet();
    document.body.appendChild(sheet.element);

    sheet.open({
      collections: [
        { id: "col-1", name: "Praias" },
        { id: "col-2", name: "Trilhas" },
      ],
      activeIds: ["col-2"],
      onToggle: vi.fn().mockResolvedValue(undefined),
      onCreate: vi.fn(),
    });

    const rows = [...sheet.element.querySelectorAll(".links-collections-sheet__row")];
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("aria-pressed")).toBe("false");
    expect(rows[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onToggle and flips to active on success", async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    const sheet = createCollectionsPickerSheet();
    document.body.appendChild(sheet.element);

    sheet.open({
      collections: [{ id: "col-1", name: "Praias" }],
      activeIds: [],
      onToggle,
      onCreate: vi.fn(),
    });

    const row = sheet.element.querySelector(
      ".links-collections-sheet__row"
    ) as HTMLElement;
    row.click();
    expect(onToggle).toHaveBeenCalledWith("col-1", true);

    await vi.waitFor(() => {
      const updatedRow = sheet.element.querySelector(
        ".links-collections-sheet__row"
      ) as HTMLElement;
      expect(updatedRow.getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("shows an inline error and reverts when onToggle rejects", async () => {
    const onToggle = vi.fn().mockRejectedValue(new Error("Falha ao salvar"));
    const sheet = createCollectionsPickerSheet();
    document.body.appendChild(sheet.element);

    sheet.open({
      collections: [{ id: "col-1", name: "Praias" }],
      activeIds: [],
      onToggle,
      onCreate: vi.fn(),
    });

    (sheet.element.querySelector(".links-collections-sheet__row") as HTMLElement).click();

    await vi.waitFor(() => {
      expect(sheet.element.textContent).toContain("Falha ao salvar");
    });
    const row = sheet.element.querySelector(
      ".links-collections-sheet__row"
    ) as HTMLElement;
    expect(row.getAttribute("aria-pressed")).toBe("false");
  });

  it("creates a collection inline and marks it active", async () => {
    const created = { id: "col-new", name: "Praias" };
    const onCreate = vi.fn().mockResolvedValue(created);
    const sheet = createCollectionsPickerSheet();
    document.body.appendChild(sheet.element);

    sheet.open({ collections: [], activeIds: [], onToggle: vi.fn(), onCreate });

    const input = sheet.element.querySelector(
      ".links-collections-sheet__create input"
    ) as HTMLInputElement;
    input.value = "Praias";
    sheet.element
      .querySelector(".links-collections-sheet__create")
      ?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    expect(onCreate).toHaveBeenCalledWith("Praias");
    await vi.waitFor(() => {
      const rows = [...sheet.element.querySelectorAll(".links-collections-sheet__row")];
      expect(rows).toHaveLength(1);
      expect(rows[0].getAttribute("aria-pressed")).toBe("true");
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/collections-ui.test.ts`
Expected: FAIL — `createCollectionDetailScreen`/`createCollectionsPickerSheet` are not exported yet.

- [ ] **Step 3: Append the detail screen and picker sheet to `collections-ui.ts`**

Add near the top of the file, alongside the existing imports:

```typescript
import type { LinkRow } from "./links-repo";
```

Then append at the end of `src/links/collections-ui.ts`:

```typescript
// ---------------------------------------------------------------------------
// Collection detail screen — reuses the caller's card renderer (injected, so
// this module never needs to import from admin-ui.ts).
// ---------------------------------------------------------------------------

export type CollectionDetailHandle = {
  element: HTMLElement;
  open: (collection: Collection, links: LinkRow[]) => void;
  close: () => void;
};

export function createCollectionDetailScreen(cb: {
  renderCard: (link: LinkRow) => HTMLElement;
  onRename: (collection: Collection) => void;
  onDelete: (collection: Collection) => void;
}): CollectionDetailHandle {
  let current: Collection | null = null;

  const { overlay, dialog, header, backBtn, title } = createScreenShell(
    "links-collection-detail-title"
  );

  const list = document.createElement("div");
  list.className = "links-collections-detail__list";

  const actions = document.createElement("div");
  actions.className = "links-admin-form__actions links-admin-form__actions--sticky";

  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "links-admin-button links-admin-button--ghost";
  renameBtn.textContent = "Renomear";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className =
    "links-admin-button links-admin-button--danger links-admin-button--block";
  deleteBtn.textContent = "Excluir collection";

  actions.append(renameBtn, deleteBtn);
  dialog.append(header, list, actions);

  function close(): void {
    overlay.hidden = true;
    current = null;
    syncBodyScreenLock();
  }

  function open(collection: Collection, links: LinkRow[]): void {
    current = collection;
    title.textContent = collection.name;
    list.replaceChildren();
    if (links.length === 0) {
      const empty = document.createElement("p");
      empty.className = "links-status";
      empty.textContent = "Nenhuma experiência nesta collection ainda.";
      list.appendChild(empty);
    } else {
      for (const link of links) {
        list.appendChild(cb.renderCard(link));
      }
    }
    overlay.hidden = false;
    syncBodyScreenLock();
  }

  renameBtn.addEventListener("click", () => {
    if (current) cb.onRename(current);
  });
  deleteBtn.addEventListener("click", () => {
    if (current) cb.onDelete(current);
  });
  backBtn.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return { element: overlay, open, close };
}

// ---------------------------------------------------------------------------
// Collections picker sheet — opened from the ViewModal for one specific link.
// Mirrors admin-ui.ts's ScheduleSheet convention: callbacks are passed at
// `.open()` time (not at creation time), since they close over the specific
// link the sheet was opened for.
// ---------------------------------------------------------------------------

function pickerErrorMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : "Algo deu errado. Tente novamente.";
}

export type CollectionsPickerOpenOpts = {
  collections: Collection[];
  activeIds: readonly string[];
  onToggle: (collectionId: string, active: boolean) => Promise<void>;
  onCreate: (name: string) => Promise<Collection>;
};

export type CollectionsPickerHandle = {
  element: HTMLElement;
  open: (opts: CollectionsPickerOpenOpts) => void;
  close: () => void;
};

export function createCollectionsPickerSheet(): CollectionsPickerHandle {
  let opts: CollectionsPickerOpenOpts | null = null;
  let activeIds = new Set<string>();

  const overlay = document.createElement("div");
  overlay.className = "links-filter-sheet links-collections-sheet";
  overlay.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "links-filter-sheet__backdrop";
  backdrop.setAttribute("aria-label", "Fechar collections");

  const panel = document.createElement("div");
  panel.className = "links-filter-sheet__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "links-collections-sheet-title");

  const title = document.createElement("h2");
  title.className = "links-filter-sheet__title";
  title.id = "links-collections-sheet-title";
  title.textContent = "Collections";

  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const createRow = document.createElement("form");
  createRow.className = "links-collections-sheet__create";
  createRow.noValidate = true;

  const createInput = document.createElement("input");
  createInput.className = "links-admin-form__control";
  createInput.type = "text";
  createInput.placeholder = "Nova collection";
  createInput.maxLength = 80;
  createInput.setAttribute("aria-label", "Nome da nova collection");

  const createBtn = document.createElement("button");
  createBtn.type = "submit";
  createBtn.className = "links-admin-button links-admin-button--primary";
  createBtn.textContent = "Criar";

  createRow.append(createInput, createBtn);

  const list = document.createElement("div");
  list.className = "links-collections-sheet__list";

  panel.append(title, error, createRow, list);
  overlay.append(backdrop, panel);

  function renderRows(): void {
    if (!opts) return;
    list.replaceChildren();
    for (const collection of opts.collections) {
      list.appendChild(renderRow(collection));
    }
  }

  function renderRow(collection: Collection): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "links-collections-sheet__row";
    const isActive = activeIds.has(collection.id);
    row.setAttribute("aria-pressed", isActive ? "true" : "false");

    const name = document.createElement("span");
    name.className = "links-collections-sheet__name";
    name.textContent = collection.name;

    const toggle = document.createElement("span");
    toggle.className = "links-collections-sheet__toggle";
    toggle.setAttribute("aria-hidden", "true");
    toggle.textContent = isActive ? "✓" : "+";
    if (isActive) toggle.classList.add("links-collections-sheet__toggle--active");

    row.append(name, toggle);

    row.addEventListener("click", () => {
      const current = opts;
      if (!current || row.disabled) return;
      const nextActive = !activeIds.has(collection.id);
      row.disabled = true;
      error.hidden = true;
      void current
        .onToggle(collection.id, nextActive)
        .then(() => {
          if (opts !== current) return;
          if (nextActive) activeIds.add(collection.id);
          else activeIds.delete(collection.id);
          renderRows();
        })
        .catch((err) => {
          error.textContent = pickerErrorMessage(err);
          error.hidden = false;
        })
        .finally(() => {
          row.disabled = false;
        });
    });

    return row;
  }

  function close(): void {
    overlay.hidden = true;
    opts = null;
    syncBodyScreenLock();
  }

  function open(nextOpts: CollectionsPickerOpenOpts): void {
    opts = nextOpts;
    activeIds = new Set(nextOpts.activeIds);
    error.hidden = true;
    createInput.value = "";
    renderRows();
    overlay.hidden = false;
    syncBodyScreenLock();
  }

  createRow.addEventListener("submit", (e) => {
    e.preventDefault();
    const current = opts;
    if (!current) return;
    const name = createInput.value.trim();
    if (name.length === 0) return;
    createBtn.disabled = true;
    error.hidden = true;
    void current
      .onCreate(name)
      .then((created) => {
        if (opts !== current) return;
        opts = { ...current, collections: [...current.collections, created] };
        activeIds.add(created.id);
        createInput.value = "";
        renderRows();
      })
      .catch((err) => {
        error.textContent = pickerErrorMessage(err);
        error.hidden = false;
      })
      .finally(() => {
        createBtn.disabled = false;
      });
  });

  backdrop.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return { element: overlay, open, close };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/collections-ui.test.ts`
Expected: PASS (12 tests total in the file).

- [ ] **Step 5: Add the remaining CSS**

In `styles.css`, right after the `.links-collections-list__count { ... }` block added in Task 4, add:

```css
/* Collection detail screen: reuses renderAdminCard, just needs a scroll container. */
.links-collections-detail__list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 16px calc(20px + env(safe-area-inset-bottom, 0px));
}

/* Collections picker sheet (from ViewModal — add/remove current experience). */
.links-collections-sheet__create {
  display: flex;
  gap: 8px;
  padding: 0 20px 10px;
}

.links-collections-sheet__create .links-admin-form__control {
  flex: 1 1 auto;
  min-width: 0;
}

.links-collections-sheet__list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 0 12px 8px;
  gap: 4px;
}

.links-collections-sheet__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 10px 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 1rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.links-collections-sheet__row:hover,
.links-collections-sheet__row:focus-visible {
  background: var(--bg, #eef2f6);
  outline: none;
}

.links-collections-sheet__toggle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border);
  color: var(--text-muted, #5a6570);
  font-size: 1rem;
  line-height: 1;
}

.links-collections-sheet__toggle--active {
  border-color: var(--green);
  background: var(--green-light, #e8f5ef);
  color: var(--green-dark, #276749);
}
```

- [ ] **Step 6: Typecheck + full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: same expected pre-existing `main.ts` argument-count note as Task 4 Step 7; everything else green.

- [ ] **Step 7: Commit**

```bash
git add src/links/collections-ui.ts styles.css tests/unit/collections-ui.test.ts
git commit -m "feat(links): add collection detail screen and collections picker sheet"
```

---

### Task 6: Wire it all together in `main.ts`

**Files:**
- Modify: `src/links/main.ts`

**Interfaces:**
- Consumes: everything from Task 2 (`collections-repo.ts`, `collections-summary.ts`) and Tasks 4–5 (`collections-ui.ts`); the updated `createToolbar`/`ViewModalCallbacks` from Task 3.
- Produces: a working, wired feature. `main.ts` has no unit tests in this codebase today (confirmed: no `main.test.ts` exists) — its orchestration is verified by typecheck + build + the manual browser smoke test in Task 7, matching how this file's other features (schedule, deck, quick-add) were verified.

- [ ] **Step 1: Add imports**

At the top of `src/links/main.ts`, after the existing `import { createAuthStorage, setRememberMe } from "./session-storage";` line, add:

```typescript
import { createCollectionsRepo, type CollectionsRepo, type Collection } from "./collections-repo";
import { summarizeCollections, linksInCollection } from "./collections-summary";
import {
  createCollectionFormSheet,
  createCollectionsListScreen,
  createCollectionDetailScreen,
  createCollectionsPickerSheet,
  type CollectionFormHandle,
  type CollectionsListHandle,
  type CollectionDetailHandle,
  type CollectionsPickerHandle,
} from "./collections-ui";
```

- [ ] **Step 2: Extend `bootDynamic`'s signature and add collections state**

Change the `bootDynamic` function signature from:

```typescript
function bootDynamic(
  els: Els,
  auth: Auth,
  repo: LinksRepo,
  initialLinks: LinkRow[],
  warning?: string
): void {
  let links: LinkRow[] = sortLinks(initialLinks);
  let authenticated = false;
  let notice = warning ?? null;
  let categoryFilter: Category[] = [];
```

to:

```typescript
function bootDynamic(
  els: Els,
  auth: Auth,
  repo: LinksRepo,
  collectionsRepo: CollectionsRepo,
  initialLinks: LinkRow[],
  initialCollections: Collection[],
  initialLinkCollectionIds: Record<string, string[]>,
  warning?: string
): void {
  let links: LinkRow[] = sortLinks(initialLinks);
  let collections: Collection[] = initialCollections;
  let linkCollectionIds: Record<string, string[]> = initialLinkCollectionIds;
  let authenticated = false;
  let notice = warning ?? null;
  let categoryFilter: Category[] = [];
```

- [ ] **Step 3: Instantiate the new UI pieces and update the ViewModal callbacks**

Change:

```typescript
  const deleteSheet: DeleteSheetHandle = createDeleteConfirmSheet();
  const scheduleSheet: ScheduleSheetHandle = createScheduleSheet();
  const viewModal: ViewModalHandle = createViewModal({
    onEdit: (l) => formModal.openEdit(l),
    onSchedule: (l) => openSchedule(l),
    onMarkDone: (l) => void markDone(l),
  });
  const filterSheet: CategoryFilterHandle = createCategoryFilterSheet((cats) => {
    categoryFilter = cats;
    render();
  });
```

to:

```typescript
  const deleteSheet: DeleteSheetHandle = createDeleteConfirmSheet();
  const scheduleSheet: ScheduleSheetHandle = createScheduleSheet();
  const viewModal: ViewModalHandle = createViewModal({
    onEdit: (l) => formModal.openEdit(l),
    onSchedule: (l) => openSchedule(l),
    onMarkDone: (l) => void markDone(l),
    onCollections: (l) => openCollectionsPicker(l),
  });
  const filterSheet: CategoryFilterHandle = createCategoryFilterSheet((cats) => {
    categoryFilter = cats;
    render();
  });

  const collectionFormSheet: CollectionFormHandle = createCollectionFormSheet(
    async (name, editingId) => {
      collectionFormSheet.setBusy(true);
      try {
        if (editingId) {
          await collectionsRepo.renameCollection(editingId, name);
          collections = collections
            .map((c) => (c.id === editingId ? { ...c, name: name.trim() } : c))
            .sort((a, b) => a.name.localeCompare(b.name));
          collectionFormSheet.close();
          const renamed = collections.find((c) => c.id === editingId);
          if (renamed) {
            collectionDetailScreen.open(renamed, linksInCollection(renamed.id, links, linkCollectionIds));
          }
        } else {
          const created = await collectionsRepo.createCollection(name);
          collections = [...collections, created].sort((a, b) => a.name.localeCompare(b.name));
          collectionFormSheet.close();
          collectionsListScreen.open(summarizeCollections(collections, links, linkCollectionIds));
        }
      } catch (err) {
        collectionFormSheet.setError(messageOf(err, GENERIC_ERROR));
      } finally {
        collectionFormSheet.setBusy(false);
      }
    }
  );

  const collectionDetailScreen: CollectionDetailHandle = createCollectionDetailScreen({
    renderCard: (link) =>
      renderAdminCard(link, {
        onView: (l) => viewModal.open(l),
        onEdit: (l) => formModal.openEdit(l),
        onDelete: (l) => void deleteLink(l),
      }),
    onRename: (collection) => collectionFormSheet.openEdit(collection),
    onDelete: (collection) => deleteCollectionConfirm(collection),
  });

  const collectionsListScreen: CollectionsListHandle = createCollectionsListScreen({
    onOpenCollection: (collection) =>
      collectionDetailScreen.open(collection, linksInCollection(collection.id, links, linkCollectionIds)),
    onCreate: () => collectionFormSheet.openCreate(),
  });

  const collectionsPickerSheet: CollectionsPickerHandle = createCollectionsPickerSheet();
```

- [ ] **Step 4: Append the collections elements to `document.body`**

Change:

```typescript
  document.body.append(
    loginModal.element,
    formModal.element,
    deleteSheet.element,
    viewModal.element,
    scheduleSheet.element,
    filterSheet.element,
    drawSheet.element,
    deckScreen.element
  );
```

to:

```typescript
  document.body.append(
    loginModal.element,
    formModal.element,
    deleteSheet.element,
    viewModal.element,
    scheduleSheet.element,
    filterSheet.element,
    drawSheet.element,
    deckScreen.element,
    collectionFormSheet.element,
    collectionDetailScreen.element,
    collectionsListScreen.element,
    collectionsPickerSheet.element
  );
```

- [ ] **Step 5: Add the `openCollectionsPicker` and `deleteCollectionConfirm` handlers**

Add these two functions right after `runDraw()` (before the `// --- persistence helpers ---` comment):

```typescript
  function openCollectionsPicker(link: LinkRow): void {
    collectionsPickerSheet.open({
      collections,
      activeIds: linkCollectionIds[link.id] ?? [],
      onToggle: async (collectionId, active) => {
        if (active) {
          await collectionsRepo.addLinkToCollection(link.id, collectionId);
          linkCollectionIds = {
            ...linkCollectionIds,
            [link.id]: [...(linkCollectionIds[link.id] ?? []), collectionId],
          };
        } else {
          await collectionsRepo.removeLinkFromCollection(link.id, collectionId);
          linkCollectionIds = {
            ...linkCollectionIds,
            [link.id]: (linkCollectionIds[link.id] ?? []).filter((id) => id !== collectionId),
          };
        }
      },
      onCreate: async (name) => {
        const created = await collectionsRepo.createCollection(name);
        collections = [...collections, created].sort((a, b) => a.name.localeCompare(b.name));
        await collectionsRepo.addLinkToCollection(link.id, created.id);
        linkCollectionIds = {
          ...linkCollectionIds,
          [link.id]: [...(linkCollectionIds[link.id] ?? []), created.id],
        };
        return created;
      },
    });
  }

  function deleteCollectionConfirm(collection: Collection): void {
    deleteSheet.open(
      collection.name,
      async () => {
        try {
          await collectionsRepo.deleteCollection(collection.id);
          collections = collections.filter((c) => c.id !== collection.id);
          linkCollectionIds = Object.fromEntries(
            Object.entries(linkCollectionIds).map(([linkId, ids]) => [
              linkId,
              ids.filter((id) => id !== collection.id),
            ])
          );
          collectionDetailScreen.close();
          collectionsListScreen.open(summarizeCollections(collections, links, linkCollectionIds));
        } catch (err) {
          renderMessage(els.list, messageOf(err, GENERIC_ERROR));
        }
      },
      "Excluir collection?"
    );
  }
```

- [ ] **Step 6: Update the `createToolbar` call site**

Change:

```typescript
      els.adminRoot.appendChild(
        createToolbar(
          () => formModal.openCreate(),
          async () => {
            try {
              await auth.signOut();
            } catch (err) {
              renderMessage(els.list, messageOf(err, "Não foi possível sair. Tente novamente."));
            }
          },
          () => filterSheet.open(categoryFilter),
          () => runDraw(),
          () => deckScreen.open(links, "wishlist"),
          categoryFilter
        )
      );
```

to:

```typescript
      els.adminRoot.appendChild(
        createToolbar(
          () => formModal.openCreate(),
          async () => {
            try {
              await auth.signOut();
            } catch (err) {
              renderMessage(els.list, messageOf(err, "Não foi possível sair. Tente novamente."));
            }
          },
          () => filterSheet.open(categoryFilter),
          () => collectionsListScreen.open(summarizeCollections(collections, links, linkCollectionIds)),
          () => runDraw(),
          () => deckScreen.open(links, "wishlist"),
          categoryFilter
        )
      );
```

- [ ] **Step 7: Update `boot()` to fetch collections data**

Change:

```typescript
  const client = createClient(config.url, config.anonKey, {
    auth: { storage: createAuthStorage() },
  });
  const auth = createAuth(client);
  const repo = createLinksRepo(client);

  let initialLinks: LinkRow[];
  try {
    initialLinks = await repo.listLinks();
  } catch {
    // Anonymous SELECT is denied by RLS — empty list until login.
    initialLinks = [];
  }

  bootDynamic(els, auth, repo, initialLinks);
}
```

to:

```typescript
  const client = createClient(config.url, config.anonKey, {
    auth: { storage: createAuthStorage() },
  });
  const auth = createAuth(client);
  const repo = createLinksRepo(client);
  const collectionsRepo = createCollectionsRepo(client);

  let initialLinks: LinkRow[];
  try {
    initialLinks = await repo.listLinks();
  } catch {
    // Anonymous SELECT is denied by RLS — empty list until login.
    initialLinks = [];
  }

  let initialCollections: Collection[];
  let initialLinkCollectionIds: Record<string, string[]>;
  try {
    initialCollections = await collectionsRepo.listCollections();
    initialLinkCollectionIds = await collectionsRepo.listLinkCollectionIds();
  } catch {
    initialCollections = [];
    initialLinkCollectionIds = {};
  }

  bootDynamic(
    els,
    auth,
    repo,
    collectionsRepo,
    initialLinks,
    initialCollections,
    initialLinkCollectionIds
  );
}
```

- [ ] **Step 8: Refresh collections data on every auth state change**

Change the `onAuthStateChange` handler from:

```typescript
  auth.onAuthStateChange((_event, session) => {
    void (async () => {
      authenticated = session != null;
      if (authenticated) {
        try {
          links = sortLinks(await repo.listLinks());
          notice = null;
        } catch {
          links = [];
          notice =
            "Não foi possível carregar links do Supabase. Confira a migration e a chave anon.";
        }
      } else {
        links = [];
      }
      render();
      handlePendingShare();
    })();
  });
```

to:

```typescript
  auth.onAuthStateChange((_event, session) => {
    void (async () => {
      authenticated = session != null;
      if (authenticated) {
        try {
          links = sortLinks(await repo.listLinks());
          notice = null;
        } catch {
          links = [];
          notice =
            "Não foi possível carregar links do Supabase. Confira a migration e a chave anon.";
        }
        try {
          collections = await collectionsRepo.listCollections();
          linkCollectionIds = await collectionsRepo.listLinkCollectionIds();
        } catch {
          collections = [];
          linkCollectionIds = {};
        }
      } else {
        links = [];
        collections = [];
        linkCollectionIds = {};
      }
      render();
      handlePendingShare();
    })();
  });
```

And the initial-session IIFE right below it, from:

```typescript
  void (async () => {
    try {
      const session = await auth.getSession();
      authenticated = session != null;
      if (authenticated) {
        try {
          links = sortLinks(await repo.listLinks());
          notice = null;
        } catch {
          links = [];
          notice =
            "Não foi possível carregar links do Supabase. Confira a migration e a chave anon.";
        }
      } else {
        links = [];
      }
    } catch {
      authenticated = false;
      links = [];
    }
    render();
    handlePendingShare();
  })();
```

to:

```typescript
  void (async () => {
    try {
      const session = await auth.getSession();
      authenticated = session != null;
      if (authenticated) {
        try {
          links = sortLinks(await repo.listLinks());
          notice = null;
        } catch {
          links = [];
          notice =
            "Não foi possível carregar links do Supabase. Confira a migration e a chave anon.";
        }
        try {
          collections = await collectionsRepo.listCollections();
          linkCollectionIds = await collectionsRepo.listLinkCollectionIds();
        } catch {
          collections = [];
          linkCollectionIds = {};
        }
      } else {
        links = [];
        collections = [];
        linkCollectionIds = {};
      }
    } catch {
      authenticated = false;
      links = [];
      collections = [];
      linkCollectionIds = {};
    }
    render();
    handlePendingShare();
  })();
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. This is the first point where the `createToolbar` argument-count note from Task 3/4 fully resolves.

- [ ] **Step 10: Full unit suite**

Run: `npx vitest run`
Expected: all tests pass (no new tests added in this task — `main.ts` is excluded from coverage and has no dedicated unit tests in this codebase, matching every other feature wired through it).

- [ ] **Step 11: Production build**

Run: `npx vite build`
Expected: succeeds, regenerates `p/a8f3k2/app.js`.

- [ ] **Step 12: Commit**

```bash
git add src/links/main.ts p/a8f3k2/app.js
git commit -m "feat(links): wire Collections into main.ts boot and event handlers"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full automated check**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: all green, build succeeds.

- [ ] **Step 2: Confirm the migration was applied**

Ask the human operator to confirm Task 1 Step 3 was run against the live project (the app will silently behave as if there are zero collections — no crash — if the tables don't exist yet, because `boot()`'s `try/catch` around `collectionsRepo.listCollections()` swallows the error; this makes the feature safe to deploy before the migration lands, but it won't actually work until the tables exist).

- [ ] **Step 3: Manual browser smoke test**

Serve the built site and drive it with Playwright + a real Chrome install (no bundled browser download needed), the same technique already proven in this repo for the previous feature (remember-me login):

```bash
(nohup python3 -m http.server 8080 --bind 127.0.0.1 > /tmp/links-static-server.log 2>&1 &)
for i in $(seq 1 15); do curl -sf http://127.0.0.1:8080/p/a8f3k2/ >/dev/null && echo SERVER_UP && break; sleep 1; done
```

Write a throwaway driver script at the repo root (Node ESM resolves `node_modules` from the importing file's own directory, so it must live inside the repo, not in `/tmp`) — call it `.tmp-verify-collections.mjs`:

```javascript
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.goto("http://127.0.0.1:8080/p/a8f3k2/", { waitUntil: "networkidle" });

// This smoke test requires being logged in as the editor — log in first
// with real credentials from your own .env / password manager, then:
// await page.click(".links-login-button");
// ... fill email/password, submit, wait for the toolbar to render ...

await page.click('[aria-label="Collections"]');
await page.waitForSelector(".links-status", { timeout: 10000 });
console.log("Collections list empty state:", await page.textContent(".links-status"));

await page.click(".links-collections-list__new");
await page.fill("#links-collection-form-name", "Praias");
await page.click('#links-collection-form-name ~ * button[type="submit"], .links-admin-form--screen button[type="submit"]');
await page.waitForSelector(".links-collections-list__row");
console.log("Collections list after create:", await page.textContent(".links-collections-list"));

console.log("Console errors:", consoleErrors);
await browser.close();
```

Fill in the real login step (this app has no seeded test account committed to the repo — use the operator's own credentials interactively or via env vars, never hardcode them in the script or commit them). Run it:

```bash
node .tmp-verify-collections.mjs
```

Confirm:
- The empty state reads "Nenhuma collection ainda. Crie a primeira." before creating anything.
- After creating "Praias", a row appears in `.links-collections-list__row` showing "Praias" and "0 experiências".
- `consoleErrors` contains nothing new beyond the pre-existing, unrelated CSP `frame-ancestors` meta warning already known from this app's other pages.

Then, still driving the same page, open any experience's ViewModal, click the new "Collections" button, toggle "Praias" on, close, reopen the ViewModal for the same experience, open "Collections" again, and confirm "Praias" now shows as toggled (`aria-pressed="true"`). Open the collections list again from the toolbar and confirm "Praias" now shows "1 experiência". Open "Praias" and confirm the card for that experience renders with working swipe/edit/delete (inherited from `renderAdminCard`). Rename "Praias" to "Praias 2026" via the detail screen and confirm the list screen reflects the new name. Finally delete the collection and confirm it disappears from the list while the underlying experience itself is untouched (still visible in the main list).

- [ ] **Step 4: Clean up**

```bash
rm -f .tmp-verify-collections.mjs
pkill -f "http.server 8080" 2>/dev/null || true
```

- [ ] **Step 5: Report results**

Summarize pass/fail for each bullet in Step 3 back to the user. Do not claim the feature works end-to-end unless Step 3's manual pass actually happened (typecheck/build/unit-tests passing is necessary but not sufficient — this feature has real DOM interactions and a real Supabase round-trip that only the manual pass exercises).

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-07-12-links-collections-design.md` maps to a task — data model → Task 1, repo → Task 2, toolbar/ViewModal entry points → Task 3, list/detail/picker UI → Tasks 4–5, wiring → Task 6, manual QA → Task 7. The spec's "Out of scope" items (proximity grouping, e2e coverage, drag-and-drop) are not present in any task, as intended.
- **Deviation from the spec, called out explicitly:** the spec's RLS sketch used a single `for all` policy per table; this plan uses four granular per-action policies instead, matching the literal convention of every existing migration file in this repo (`001_links.sql`, `009_links_select_auth.sql`). Same intent (auth-only, full CRUD), more consistent SQL. The spec also said the detail screen's rename/delete affordance lives behind a "..." menu; this plan implements the same capability as two buttons in the existing sticky-actions-row pattern instead, since no dropdown/menu widget exists anywhere else in this codebase and inventing one for two buttons would be over-engineering — the user-facing capability (rename, delete) is unchanged.
- **Type consistency check:** `Collection` (Task 2) is the single source of truth for that shape and is imported, never redefined, in `collections-summary.ts`, `collections-ui.ts`, and `main.ts`. `CollectionSummary` (Task 2) flows unchanged into `CollectionsListHandle.open()` (Task 4). `CollectionsPickerOpenOpts` (Task 5) matches exactly how `main.ts`'s `openCollectionsPicker` (Task 6) constructs it. `ViewModalCallbacks.onCollections` (Task 3) matches the closure `main.ts` passes at the `createViewModal` call site (Task 6).
