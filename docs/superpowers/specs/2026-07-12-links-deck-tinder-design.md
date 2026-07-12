# Design: Deck Tinder — wishlist + experiências já feitas

**Date:** 2026-07-12  
**Status:** Approved by titular (pending implementation)  
**Parent:** [links-admin-design](./2026-07-11-links-admin-design.md)  
**Surface:** `/p/a8f3k2/` (editor autenticado)  
**Tipo:** `feat`

---

## 1. Problem

A bucket list tem lista, filtro, sorteio e agendamento, mas falta um modo **rápido e lúdico** para:

1. Priorizar o que ainda quer fazer (wishlist)
2. Revisitar o que já viveu (já feitas) e marcar o que quer repetir

O reel de **Sortear** resolve descoberta aleatória; não resolve priorização nem memória do que já foi feito.

## 2. Goals

| Ação | Resultado |
|------|-----------|
| Editor → **Deck** (toolbar) | Full-screen com abas **Wishlist** \| **Já feitas** |
| Wishlist → swipe direita / ♥ | Marca **Quero** (sobe `priority`) |
| Wishlist → swipe esquerda / ✕ | **Agora não** (pula; volta no fim da fila da sessão) |
| Wishlist → botão **Já fiz** | `status = done`, preenche `completed_at` |
| Já feitas → swipe direita / ♥ | `want_again = true` |
| Já feitas → swipe esquerda / ✕ | Só passar (fila de sessão) |
| Ver / editar card | Botão **Marcar como feita** (mesmo efeito do atalho no Deck) |
| Formulário create/edit | Campos opcionais `image_url` (`https://`) e `note` curta |

**Fora de escopo (v1):** upload Storage; visitantes no Deck; matching multiplayer; long-press reorder; substituir o Sortear; analytics de swipe; rota `/deck/` separada.

## 3. Decisions (aprovadas)

| Tema | Decisão |
|------|----------|
| Objetivo | Wishlist **e** já feitas, gesto estilo Tinder |
| Quem usa | Só editor logado |
| Wishlist swipe | → Quero · ← Agora não |
| Já feitas swipe | → Curtir / quer repetir · ← Só passar |
| Modelo | Mesmo registro `links` + `status`; foto/nota opcionais |
| Foto/nota v1 | URL `https://` + nota curta no form (sem upload) |
| Marcar feita | Ver/editar **e** botão no Deck |
| Onde mora | Botão **Deck** na toolbar da página atual; Sortear permanece |
| Skip | Só sessão (não persiste “skipped” no banco) |
| Lista principal | Cards `done` **somem** da lista; aparecem só no Deck Já feitas |

## 4. Approach — Deck full-screen na mesma página

### 4.1 Schema

Migration `005_links_deck.sql` (e espelho em `001` para greenfield):

```sql
alter table public.links
  add column if not exists status text not null default 'wishlist'
    check (status in ('wishlist', 'done')),
  add column if not exists priority integer not null default 0,
  add column if not exists want_again boolean not null default false,
  add column if not exists image_url text
    check (image_url is null or image_url ~ '^https://'),
  add column if not exists note text
    check (note is null or char_length(note) <= 500),
  add column if not exists completed_at timestamptz;

-- optional: backfill completed_at when status flips to done (app-side)
```

RLS existente cobre update autenticado. Select público continua; itens `done` deixam de renderizar na lista pública/admin principal (filtro client-side e/ou query).

**Nota vs description:** `description` permanece a copy da lista/card público. `note` é memória pós-visita (Deck / já feitas). Ambos opcionais; o Deck prioriza `note`, senão cai em `description`.

### 4.2 Módulos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/links/deck-queue.ts` | Fila pura: skip → fim; order por `priority` DESC + `created_at` DESC; filtrar por `status` |
| `src/links/deck-ui.ts` | Full-screen Deck: tabs, card, botões, swipe/teclado, empty states |
| `src/links/links-repo.ts` | Tipos + create/update/list com novos campos |
| `src/links/admin-ui.ts` | Botão Deck na toolbar; “Marcar como feita” na view; campos image/note no form |
| `src/links/main.ts` | Wire Deck + persistência Quero / done / want_again; refresh lista |
| `src/links/render.ts` / sort | Lista omite `status === 'done'`; wishlist pode priorizar `priority` |
| `styles.css` | Layout Deck com tokens do site |

### 4.3 UX

**Toolbar (editor):** `+` · Filtrar · Sortear · **Deck** · Sair

**Deck full-screen**

- Header: título + Fechar
- Tabs: Wishlist | Já feitas
- Stack de 1 card visível (+ sombra do próximo)
- Conteúdo do card: `image_url` (se houver) ou fallback visual; categoria; label; nota/descrição curta
- Controles: ✕ · **Já fiz** (só Wishlist) · ♥
- Hint: “← Agora não · Quero →” / “← Passar · Quer repetir →”
- Teclado: ArrowLeft / ArrowRight; atalho dedicada para “Já fiz” (ex. tecla `D` ou botão focado)
- Empty: “Nada na wishlist” / “Nenhuma experiência marcada como feita”
- `prefers-reduced-motion`: transição sem bounce extremo

**Lista:** sem cards `done`. Chip opcional de prioridade alta na wishlist (v1: opcional; mínimo = só reordenar por `priority` no Deck).

### 4.4 Persistência dos gestos

| Gesto | Persistência |
|-------|----------------|
| Quero | `priority = max(priority na wishlist) + 1` |
| Agora não / Só passar | Só `deck-queue` em memória |
| Já fiz | `status='done'`, `completed_at=now()` |
| Quer repetir | `want_again=true` (não move automaticamente de volta à wishlist na v1) |
| Reabrir wishlist a partir de done | Fora de escopo v1 (pode ser fase 2: botão “Voltar à wishlist”) |

### 4.5 CSP / LGPD

- Carregar `image_url` exige `img-src` permitir hosts externos **ou** restringir a um allowlist. Preferência v1: documentar no checklist LGPD; se CSP atual for restritiva, ampliar `img-src` com revisão explícita na issue/PR (AGENTS.md).
- Sem cookies novos; sem analytics de swipe.
- Atualizar `privacy-policy.html` + `docs/lgpd-checklist.md` se a política de imagens mudar.

## 5. Testing

| Camada | O quê |
|--------|--------|
| Unit (Vitest) | `deck-queue` (skip, prioridade, filtro status); updates de status/priority via helpers |
| Unit | Validação `image_url` https + limite `note` |
| E2E (Playwright) | Smoke: página carrega; (se auth de teste existir) abrir Deck — senão smoke só presença do botão ausente para anônimo |
| Manual | Swipe + teclado; marcar feita na view e no Deck; lista sem itens done |

## 6. Success criteria

- [ ] Editor abre Deck; visitante anônimo **não** vê o botão Deck
- [ ] Wishlist: Quero persiste priority; skip volta ao fim; Já fiz move para done
- [ ] Já feitas: want_again persiste; skip só sessão
- [ ] Lista principal não mostra `done`
- [ ] Form aceita image_url + note; card do Deck usa a imagem quando houver
- [ ] Sortear continua intacto
- [ ] Testes unitários verdes; e2e smoke não regrede
- [ ] Checklist LGPD no PR se CSP/privacy tocados

## 7. Ops

Titular aplica `005_links_deck.sql` no SQL Editor do Supabase (mesmo fluxo da migration 004).
