# Design: Swipe bidirecional + tela de visualização (links admin)

**Date:** 2026-07-12  
**Status:** Approved — implemented
**Parent:** [links-admin-design](./2026-07-11-links-admin-design.md), [links-mobile-ux-design](./2026-07-11-links-mobile-ux-design.md)  
**Surface:** `/p/a8f3k2/` (admin autenticado)

---

## 1. Problem

Hoje o swipe só revela **Excluir** (deslize para a esquerda). Toque no card abre direto o **formulário de edição**, o que é agressivo no mobile. Falta um caminho de **leitura** e um swipe para **Editar**.

## 2. Goals

| Gesto | Resultado |
|--------|-----------|
| Deslize ← (conteúdo vai à esquerda) | Revela botão **Excluir** (direita) |
| Deslize → (conteúdo vai à direita) | Revela botão **Editar** (esquerda) |
| Toque no card | Abre tela **Visualizar** (somente leitura) |
| **Editar** (swipe ou na visualização) | Abre formulário de edição existente |
| ↑↓ | Reordenar (inalterado) |

**Fora de escopo:** long-press reorder; ícones manuais no formulário; autofocus de campos (já removido).

## 3. Approach (A) — Dois trilhos + view screen

### 3.1 Swipe bidirecional

- Largura de cada ação: `ACTIONS_WIDTH_PX = 72` (inalterada por lado).
- Markup do row:
  - `.swipe-row__actions.swipe-row__actions--edit` — `inset: 0 auto 0 0` (esquerda), botão Editar (navy).
  - `.swipe-row__actions.swipe-row__actions--delete` — `inset: 0 0 0 auto` (direita), botão Excluir (vermelho).
- `translateX` do conteúdo:
  - `0` = fechado
  - `+72` = Editar revelado
  - `-72` = Excluir revelado
- Snap puro em `snapSwipeOffset(offset, width, velocity)` → retorna `-width | 0 | +width`.
- Um card aberto por vez; abrir outro fecha o anterior.
- Toque com swipe aberto no mesmo card: primeiro fecha o swipe (não abre view).

### 3.2 Tela Visualizar

Full-screen no mesmo chrome das outras telas (`createScreenChrome` / `links-admin-modal`):

- Título da chrome: label da experiência (ou “Experiência”).
- Corpo (somente leitura):
  - **Nome** (label)
  - **Nota** (description; omitir bloco se vazia)
  - **Link** — `<a href>` com `rel="noopener noreferrer"` `target="_blank"`, texto = URL
- Ações:
  - **Voltar** (chrome existente)
  - **Editar** — botão primário → fecha view e chama `formModal.openEdit(link)`
- Sem campo focável ao abrir (sem teclado).
- Sem botão Excluir nesta tela (exclusão continua via swipe / botão desktop).

### 3.3 Wiring (`main.ts`)

- `onView(link)` → `viewModal.open(link)`
- `onEdit(link)` → `formModal.openEdit(link)` (swipe Editar e botão da view)
- `onDelete(link)` → fluxo atual (sheet de confirmação)
- Tap / Enter / Space no card → `onView`, não `onEdit`

### 3.4 Desktop / a11y

- `pointer: fine`: manter ↑↓; botão Excluir no card opcional como hoje; tap/click abre view.
- Teclado: Enter/Space no card → view; na view, Editar focável.

## 4. Testes (TDD)

| Camada | O quê |
|--------|--------|
| Unit `swipe.ts` | Snap para +W / 0 / −W; flick esquerda/direita; clamp |
| Unit (opcional) | Helpers de baseOffset aberto (+W vs −W) se extraídos |
| Manual / e2e smoke | Página admin ainda carrega; não regressão de login |

## 5. LGPD / segurança

- Sem novos dados pessoais; view só exibe o que já está na lista.
- Link externo: `noopener noreferrer`, `https` já exigido pelo repo.
- Sem analytics, sem mudança de CSP, sem cookies.

## 6. Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/links/swipe.ts` | Snap bidirecional |
| `tests/unit/swipe.test.ts` | Casos +W / −W |
| `src/links/admin-ui.ts` | Dois action rails; `createViewModal`; tap → view |
| `src/links/main.ts` | Wire view + edit |
| `styles.css` | Actions esquerda/direita; layout da view |

## 7. Success criteria

- [ ] Swipe ← revela só Excluir; toque em Excluir abre confirmação atual
- [ ] Swipe → revela só Editar; toque em Editar abre formulário
- [ ] Toque no card abre view (nome, nota se houver, link, Voltar, Editar)
- [ ] Editar na view abre formulário sem autofocus
- [ ] Unit de snap verde; `npm run build` ok
