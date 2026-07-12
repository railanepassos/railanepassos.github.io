# Design: UX mobile-first na página de links (`/p/a8f3k2/`)

**Data:** 2026-07-11  
**Status:** Aprovado pelo titular — implementado  
**Tipo:** `feat` — extensão da Onda 2 (admin de links)  
**Escopo:** somente `p/a8f3k2/` (visitante + editor). Hub `index.html` inalterado.

**Spec pai:** [2026-07-11-links-admin-design.md](./2026-07-11-links-admin-design.md)

---

## 1. Objetivo

Tornar a página secreta de links usável como app de celular: layout fluido, swipe para ações (estilo Instagram/iOS), long-press para reordenar, e confirmação de exclusão em bottom sheet — sem libs CDN e sem relaxar CSP.

---

## 2. Decisões do titular

| Tema | Escolha |
|------|---------|
| Swipe | **A** — deslizar para a **esquerda** revela **Editar** + **Excluir** |
| Reordenar (mobile) | **B** — **long-press (~400ms) + arrastar** vertical |
| Excluir | **A** — sheet “Excluir «título»?” com **Cancelar / Excluir** |
| Implementação | Pointer Events + CSS transform (sem lib de swipe/DnD) |

---

## 3. Requisitos funcionais

| ID | Requisito |
|----|-----------|
| RF-M01 | Em viewport estreita (e touch), card admin em modo swipe-row: conteúdo desliza; ações Editar/Excluir ficam à direita sob o card |
| RF-M02 | Swipe esquerda abre ações; swipe direita / tap fora / abrir outro card fecha o aberto |
| RF-M03 | Tap em **Editar** abre o formulário existente (preferência: bottom sheet no mobile) |
| RF-M04 | Tap em **Excluir** abre sheet de confirmação (não `window.confirm`) |
| RF-M05 | Long-press no card (≥ ~400ms) entra em modo reorder; arrastar vertical recalcula `sort_order` e persiste via `saveOrder` existente |
| RF-M06 | Feedback haptic opcional (`navigator.vibrate` se disponível) ao entrar em reorder |
| RF-M07 | Visitante não autenticado: layout fluido; **sem** swipe nem long-press (cards continuam links) |
| RF-M08 | Desktop (≥ breakpoint): ↑↓ e drag HTML5 (ou equivalente) permanecem; swipe pode funcionar com ponteiro mas não é o caminho primário |
| RF-M09 | Teclado: ↑↓ + ações Editar/Excluir acessíveis sem depender só de swipe (a11y) |

---

## 4. Requisitos não funcionais

| ID | Requisito |
|----|-----------|
| RNF-M01 | Sem dependência CDN; lógica no bundle Vite `app.js` |
| RNF-M02 | CSP atual mantida (`script-src 'self'`, sem inline style de JS se evitável — classes CSS) |
| RNF-M03 | TDD: unit para thresholds de swipe/reorder (funções puras); e2e smoke não quebra fallback |
| RNF-M04 | `prefers-reduced-motion`: animações de swipe reduzidas / instantâneas |
| RNF-M05 | Pa11y na página não introduz critical/serious novas |

---

## 5. UX detalhada

### 5.1 Layout mobile-first

- Lista e toolbar ocupam largura útil; padding confortável (~16px).
- Toolbar sticky no topo da área de conteúdo (Novo link / Sair) com alvos ≥ 44px.
- Modais de login, formulário de link e confirmação de exclusão: **bottom sheet** em `max-width` mobile; centrados em desktop (comportamento atual ou sheet curto).

### 5.2 Swipe row (autenticado)

```
┌─────────────────────────────────────┐
│ [conteúdo do card  ←→ ] │ Edit│Del │
└─────────────────────────────────────┘
```

- Ações sob o foreground; foreground `translateX` negativo ao swipe esquerda.
- Largura revelada ≈ 2 botões (Editar navy, Excluir vermelho/destrutivo).
- Um card aberto por vez.
- Threshold: ~30% da largura de ações ou velocity mínima para snap open/close.

### 5.3 Long-press reorder

- Pointer down inicia timer ~400ms; movimento > ~10px antes do timer cancela (é scroll/swipe).
- Após ativar: elevação visual do card; outros cards recebem drop targets; soltar chama `applyReorder` + `saveOrder` (já existentes).
- Conflito swipe vs reorder: se long-press ativou, gestos horizontais ignorados até pointer up; se swipe horizontal dominante cedo, cancela long-press.

### 5.4 Delete sheet

- Texto: `Excluir "«label»"?` + ações Cancelar / Excluir.
- Excluir confirma → `repo.deleteLink` (fluxo atual em `main.ts`).
- Escape / tap no overlay cancela.

### 5.5 Visitante

- Cards públicos inalterados em comportamento (tap → nova aba).
- Apenas CSS fluido (tipografia, espaçamento, safe-area).

---

## 6. Arquitetura / arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/links/swipe.ts` (novo) | Estado/thresholds puros: open/close offset, snap |
| `src/links/long-press-reorder.ts` (novo) | Detecção long-press vs pan; índices de drop |
| `src/links/admin-ui.ts` | Markup swipe-row; wire pointers; delete sheet; bottom sheet classes |
| `src/links/main.ts` | Trocar `confirm()` por callback do sheet; wire reorder touch |
| `styles.css` | Mobile layout, swipe actions, sheets, reduced-motion |
| `tests/unit/swipe.test.ts` | Snap/threshold |
| `tests/unit/long-press-reorder.test.ts` | Timer/cancel thresholds |
| `tests/e2e/links-page.spec.ts` | Smoke: página ainda carrega; opcional assert classes shell |

Sem mudança de schema Supabase, CSP meta, ou hub principal.

---

## 7. Fora de escopo (v1 mobile)

- Undo após delete
- Swipe completa até apagar sem botão (full-swipe delete)
- Reorder por haptic-only sem drop visual
- Alterar `index.html` / brand hub
- Libs de gesture (Hammer, etc.)

---

## 8. Critérios de aceite

- [ ] No celular (ou DevTools mobile), editor logado: swipe esquerda revela Editar + Excluir
- [ ] Excluir abre sheet; Cancelar não apaga; Excluir apaga
- [ ] Long-press + drag reordena e persiste após reload
- [ ] Visitante: sem ações de swipe; links abrem normalmente
- [ ] Teclado: ainda possível mover ↑↓ e acionar editar/excluir
- [ ] Vitest verde; e2e smoke fallback verde
- [ ] `prefers-reduced-motion` respeitado

---

## 9. Relação com a11y (RNF-06 do spec pai)

O spec pai exige fallback teclado para reorder. Esta feature **mantém** ↑↓ no desktop/teclado; no mobile o primário é long-press, com ↑↓ disponíveis via media query `pointer: fine` ou botões em menu acessível se necessário para Pa11y.
