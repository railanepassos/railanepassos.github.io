# Links Deck Tinder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editor-only full-screen Deck on `/p/a8f3k2/` to prioritize wishlist items (Quero / Agora não) and revisit done experiences (want again / pass), with status + optional image URL and note on the same `links` row.

**Architecture:** Extend `public.links` with deck fields. Pure `deck-queue.ts` for session skip order. `deck-ui.ts` for full-screen swipe UI. Wire from toolbar in `admin-ui` / `main.ts`. List display filters out `status === 'done'`. CSP already allows `img-src https:`.

**Tech Stack:** TypeScript, Vitest, Supabase JS, Vite IIFE, Pointer Events (no new deps).

**Spec:** `docs/superpowers/specs/2026-07-12-links-deck-tinder-design.md`

**Branch:** continue on `feat/links-schedule` (or rename later); do not merge to `main` without review.

---

## File map

| File | Role |
|------|------|
| `supabase/migrations/005_links_deck.sql` | status, priority, want_again, image_url, note, completed_at |
| `supabase/migrations/001_links.sql` | Mirror columns for greenfield |
| `src/links/deck-queue.ts` | Filter by status, order, skip-to-end |
| `src/links/deck-ui.ts` | Full-screen Deck UI |
| `src/links/links-repo.ts` | Types + validation for new fields |
| `src/links/sort-links.ts` | Omit done from list; optional priority tie-break |
| `src/links/admin-ui.ts` | Deck toolbar btn; form fields; mark done on view |
| `src/links/main.ts` | Wire gestures → repo |
| `src/links/render.ts` | FALLBACK + public list omit done |
| `styles.css` | Deck layout |
| `tests/unit/deck-queue.test.ts` | Queue unit |
| `tests/unit/links-repo.test.ts` | Extend validation |
| `tests/unit/sort-links.test.ts` | Omit done |

---

### Task 1: Migration `005` + greenfield `001`

**Files:**
- Create: `supabase/migrations/005_links_deck.sql`
- Modify: `supabase/migrations/001_links.sql`

- [ ] **Step 1: Write `005_links_deck.sql`**

```sql
alter table public.links
  add column if not exists status text not null default 'wishlist',
  add column if not exists priority integer not null default 0,
  add column if not exists want_again boolean not null default false,
  add column if not exists image_url text,
  add column if not exists note text,
  add column if not exists completed_at timestamptz;

alter table public.links drop constraint if exists links_status_check;
alter table public.links
  add constraint links_status_check
  check (status in ('wishlist', 'done'));

alter table public.links drop constraint if exists links_image_url_https;
alter table public.links
  add constraint links_image_url_https
  check (image_url is null or image_url ~ '^https://');

alter table public.links drop constraint if exists links_note_len;
alter table public.links
  add constraint links_note_len
  check (note is null or char_length(note) <= 500);
```

- [ ] **Step 2: Mirror on `001_links.sql`** (columns in CREATE + same constraints at bottom)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_links_deck.sql supabase/migrations/001_links.sql
git commit -m "feat(links): add deck status and memory columns"
```

---

### Task 2: Repo types + validation (TDD)

**Files:**
- Modify: `src/links/links-repo.ts`
- Modify: `tests/unit/links-repo.test.ts`

- [ ] **Step 1: Failing tests** for `image_url` must be https; `note` max 500; types include `status`, `priority`, `want_again`, `image_url`, `note`, `completed_at`.

- [ ] **Step 2: Extend `LinkRow` / `CreateLinkInput` / `UpdateLinkPatch` + `validateLinkFields`**

Defaults when reading: treat missing `status` as `'wishlist'`, `priority` as `0`, `want_again` as `false` (normalize in listLinks map if needed).

- [ ] **Step 3: Tests pass → commit**

```bash
git commit -m "feat(links): type and validate deck fields on repo"
```

---

### Task 3: `deck-queue.ts` (TDD)

**Files:**
- Create: `src/links/deck-queue.ts`
- Create: `tests/unit/deck-queue.test.ts`

```ts
export type DeckTab = "wishlist" | "done";

export function linksForDeck(links: readonly LinkRow[], tab: DeckTab): LinkRow[] {
  const filtered = links.filter((l) => (l.status ?? "wishlist") === tab);
  return [...filtered].sort((a, b) => {
    if (tab === "wishlist") {
      const byPri = (b.priority ?? 0) - (a.priority ?? 0);
      if (byPri !== 0) return byPri;
    }
    // want_again first on done tab
    if (tab === "done") {
      const aw = a.want_again ? 0 : 1;
      const bw = b.want_again ? 0 : 1;
      if (aw !== bw) return aw - bw;
    }
    const ac = a.created_at ? Date.parse(a.created_at) : 0;
    const bc = b.created_at ? Date.parse(b.created_at) : 0;
    return bc - ac;
  });
}

/** Move front item to end (session skip). */
export function skipFront(queue: readonly LinkRow[]): LinkRow[] {
  if (queue.length <= 1) return [...queue];
  const [head, ...rest] = queue;
  return [...rest, head];
}

export function nextPriority(links: readonly LinkRow[]): number {
  const max = links.reduce((m, l) => Math.max(m, l.priority ?? 0), 0);
  return max + 1;
}
```

Tests: filter tabs; skip rotates; nextPriority.

- [ ] Commit: `feat(links): add deck queue helpers`

---

### Task 4: List omits `done` (TDD)

**Files:**
- Modify: `src/links/sort-links.ts`
- Modify: `tests/unit/sort-links.test.ts`
- Modify: `src/links/render.ts` / `main.ts` to use filter

```ts
export function visibleListLinks(links: readonly LinkRow[]): LinkRow[] {
  return sortLinksForDisplay(
    links.filter((l) => (l.status ?? "wishlist") !== "done")
  );
}
```

- [ ] Commit: `feat(links): hide done items from main list`

---

### Task 5: `deck-ui.ts` + CSS

**Files:**
- Create: `src/links/deck-ui.ts`
- Modify: `styles.css`
- Optional unit: mount opens with tabs (jsdom)

API sketch:

```ts
export type DeckHandlers = {
  onWant: (link: LinkRow) => void | Promise<void>;
  onSkip: () => void;
  onMarkDone: (link: LinkRow) => void | Promise<void>;
  onWantAgain: (link: LinkRow) => void | Promise<void>;
  onClose: () => void;
};

export function createDeckScreen(handlers: DeckHandlers): {
  element: HTMLElement;
  open: (links: LinkRow[], tab?: DeckTab) => void;
  close: () => void;
  setBusy: (busy: boolean) => void;
};
```

Swipe: pointer events on card; threshold ~80px; buttons ✕ / Já fiz / ♥; tabs Wishlist | Já feitas; keyboard arrows + `d` for done.

- [ ] Commit: `feat(links): add Deck full-screen UI`

---

### Task 6: Wire admin toolbar, form, view, main

**Files:**
- Modify: `src/links/admin-ui.ts` — `createToolbar(..., onDeck)`; form `image_url` + `note`; view **Marcar como feita**
- Modify: `src/links/main.ts` — createDeckScreen; handlers call `repo.updateLink`
- Modify: `src/links/skeleton.ts` if toolbar icon count changes

Handlers:
- Want → `priority: nextPriority(wishlist)`
- Mark done → `status:'done', completed_at: new Date().toISOString()`
- Want again → `want_again: true`
- Skip → local `skipFront` only

- [ ] Commit: `feat(links): wire Deck gestures to Supabase`

---

### Task 7: Build + verify

```bash
npm run test:unit
npm run build
```

Manual: apply `005` in Supabase SQL Editor; open Deck logged in.

- [ ] Commit built `p/a8f3k2/app.js` with last feat if not already included

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Deck toolbar, full-screen tabs | 5–6 |
| Wishlist Quero / Agora não / Já fiz | 3, 5–6 |
| Done want_again / pass | 3, 5–6 |
| Mark done on view | 6 |
| image_url + note form | 2, 6 |
| List hides done | 4 |
| Migration | 1 |
| Sortear intact | 6 (no change to draw) |
| CSP img https | already OK |
| LGPD | note in PR if privacy text needs bump (images already allowed) |

## Ops note

Titular must run `supabase/migrations/005_links_deck.sql` in Supabase SQL Editor before Deck persistence works in production.
