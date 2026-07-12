# Links auth-only list Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide registered experiences from anonymous visitors; show them only after login (UI + RLS).

**Architecture:** Gate `#links-list` when `!authenticated`; reload `listLinks` on auth change; migration drops public SELECT.

**Tech Stack:** TypeScript, Vitest, Playwright, Supabase RLS

## Global Constraints

- TDD: failing test before production code
- Conventional Commits; no secrets in commits
- LGPD: no privacy-policy change unless required
- Portuguese UI copy

---

### Task 1: Guest empty-state helper

**Files:**
- Create: `tests/unit/render-guest.test.ts`
- Modify: `src/links/render.ts`
- Test: `tests/unit/render-guest.test.ts`

**Interfaces:**
- Produces: `renderGuestGate(container: HTMLElement): void`

- [ ] **Step 1: Write failing test** — container gets `.links-status` with “Entre para ver as experiências.” and zero `.link-card`
- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement `renderGuestGate`**
- [ ] **Step 4: Run test — expect PASS**

### Task 2: Wire main.ts + migration

**Files:**
- Modify: `src/links/main.ts`
- Create: `supabase/migrations/009_links_select_auth.sql`
- Modify: `tests/e2e/links-page.spec.ts`
- Modify: `p/a8f3k2/app.js` (via `npm run build`)

- [ ] **Step 1: Update e2e** — anon must not require `.link-card`; expect gate status and/or Entrar when configured
- [ ] **Step 2: Migration** — drop `links_select_public`; add `links_select_auth` for `authenticated`
- [ ] **Step 3: `main.ts`** — anon uses `renderGuestGate`; no FALLBACK public list; reload links on auth; clear on logout; bootDynamic catch → `[]`
- [ ] **Step 4: `npm run build` + `npm run test:unit`**
- [ ] **Step 5: Commit + push**
