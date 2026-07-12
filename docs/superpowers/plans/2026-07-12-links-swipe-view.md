# Swipe bidirecional + view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swipe ← Excluir, swipe → Editar; tap abre tela Visualizar (nome, nota, link) com botão Editar.

**Architecture:** Snap bidirecional em `swipe.ts` (±ACTIONS_WIDTH_PX). Dois action rails no DOM. Nova `createViewModal` no chrome full-screen existente. Tap → view; Editar (swipe ou view) → form.

**Tech Stack:** TypeScript, Vitest, Pointer Events, CSS transform, Vite.

**Spec:** `docs/superpowers/specs/2026-07-12-links-swipe-view-design.md`

## Global Constraints

- Sem long-press reorder; sem autofocus no form/view
- Sem CDN; CSP inalterada; LGPD: só leitura de dados já listados
- Tip: “Toque para ver · Deslize → editar · ← excluir · ↑↓ reordenar”

---

### Task 1: Snap bidirecional (`swipe.ts`)

**Files:**
- Modify: `src/links/swipe.ts`
- Test: `tests/unit/swipe.test.ts`

**Produces:** `snapSwipeOffset(offset, width, velocity) → -width | 0 | +width`

- [ ] Update tests: open right (+W), flick right, clamp +W; remove “never positive”
- [ ] Implement bidirectional snap (OPEN_RATIO / FLICK both sides)
- [ ] `npm run test:unit -- --run tests/unit/swipe.test.ts`

---

### Task 2: Rails + wireSwipe + view modal (`admin-ui.ts` + CSS)

**Files:**
- Modify: `src/links/admin-ui.ts`, `styles.css`, `src/links/main.ts`

**Produces:** `onView`; `createViewModal`; edit rail left / delete rail right

- [ ] Dual actions markup + CSS (`--edit` left, `--delete` right)
- [ ] `wireSwipe` clamps ±W; `openSwipeContent` when offset ≠ 0; baseOffset ±W; tap → `onView`
- [ ] `createViewModal({ open(link), close })` — nome, nota opcional, link, Voltar, Editar
- [ ] Wire in `main.ts`; update tip; rebuild

---

### Task 3: Verify

- [ ] `npm run test:unit -- --run` + `npm run build`
