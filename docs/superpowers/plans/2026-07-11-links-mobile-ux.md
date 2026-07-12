# Links Mobile UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobile-first UX on `/p/a8f3k2/`: swipe-left Edit/Delete, long-press reorder, delete confirm sheet, fluid layout — no new deps.

**Architecture:** Pure functions for swipe snap + long-press detection; Pointer Events in `admin-ui.ts`; CSS for swipe-row, bottom sheets, mobile toolbar; reuse `applyReorder` + `saveOrder`.

**Tech Stack:** TypeScript, Vite, Vitest, existing `styles.css`, Pointer Events API

**Spec:** [docs/superpowers/specs/2026-07-11-links-mobile-ux-design.md](../specs/2026-07-11-links-mobile-ux-design.md)

## Global Constraints

- No CDN / no new gesture libraries
- CSP unchanged (`script-src 'self'`)
- Only `p/a8f3k2/` surface; hub untouched
- TDD for pure modules; e2e smoke must stay green
- `prefers-reduced-motion` respected

---

## File map

| File | Responsibility |
|------|----------------|
| `src/links/swipe.ts` | `snapSwipeOffset(offset, actionWidth, velocityX) → number` |
| `src/links/long-press.ts` | `shouldStartLongPress({ elapsedMs, movedPx })`, constants |
| `src/links/admin-ui.ts` | Swipe-row markup, pointer handlers, delete sheet, sheet classes |
| `src/links/main.ts` | Wire delete sheet; touch reorder → `applyReorder`/`saveOrder` |
| `styles.css` | Mobile layout, swipe actions, sheets, reduced-motion |
| `tests/unit/swipe.test.ts` | Snap thresholds |
| `tests/unit/long-press.test.ts` | Timer / cancel |

---

### Task 1: `swipe.ts` (TDD)

**Files:**
- Create: `src/links/swipe.ts`
- Test: `tests/unit/swipe.test.ts`

**Produces:**
- `ACTIONS_WIDTH_PX = 144` (2 × 72)
- `snapSwipeOffset(offsetX: number, actionWidth: number, velocityX: number): number`  
  — returns `0` (closed) or `-actionWidth` (open). Negative offset = swiped left.

- [ ] **Step 1:** Write failing tests (open when offset ≤ -30% width OR velocityX < -0.5; else close; clamp)
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** Run → PASS

---

### Task 2: `long-press.ts` (TDD)

**Files:**
- Create: `src/links/long-press.ts`
- Test: `tests/unit/long-press.test.ts`

**Produces:**
- `LONG_PRESS_MS = 400`
- `LONG_PRESS_MOVE_CANCEL_PX = 10`
- `shouldActivateLongPress(elapsedMs: number, movedPx: number): boolean`

- [ ] **Step 1:** Failing tests
- [ ] **Step 2:** Implement → PASS

---

### Task 3: Admin card swipe-row + delete sheet + CSS

**Files:**
- Modify: `src/links/admin-ui.ts`
- Modify: `styles.css`
- Modify: `src/links/main.ts`

**Produces:**
- `renderAdminCard` builds `.swipe-row` > `.swipe-row__actions` + `.swipe-row__content`
- Pointer handlers for horizontal swipe using `snapSwipeOffset`
- `createDeleteConfirmSheet(onConfirm)` bottom sheet
- `main.ts` uses sheet instead of `window.confirm`
- Long-press + vertical drag reorder wired to existing callbacks
- Mobile CSS: sticky toolbar, bottom sheets, hide ↑↓ under `(pointer: coarse)` (keep in DOM for a11y/`pointer: fine`)

- [ ] **Step 1:** Markup + CSS + wire
- [ ] **Step 2:** `npm run test:unit` + `npm run build`
- [ ] **Step 3:** `npm run test:e2e` smoke

---

### Task 4: Verify acceptance

- [ ] Manual checklist from spec §8 (or DevTools mobile)
- [ ] Commit when user requests
