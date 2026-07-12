# Design: Experiências só após login

**Date:** 2026-07-12  
**Status:** Approved in chat  
**Surface:** `/p/a8f3k2/`  
**Tipo:** `feat`

---

## 1. Problem

A bucket list de experiências é pessoal, mas hoje qualquer visitante (anon) vê os cards públicos. RLS `links_select_public` permite `SELECT` para `anon` e `authenticated`.

## 2. Goals

- Visitante não autenticado: **não** vê experiências (nem cards, nem FALLBACK).
- Visitante vê CTA “Entrar” (quando Supabase configurado) + mensagem clara na lista.
- Editor autenticado: lista admin atual (view / edit / delete / deck / etc.).
- DB: `SELECT` só para `authenticated` (UI + RLS alinhados).

**Fora de escopo:** signup público, roles além de editor, mudar privacy-policy (N/A se não citar lista pública).

## 3. Decisions (aprovadas)

| Tema | Decisão |
|------|----------|
| Escopo | A — lista privada (UI + RLS) |
| Abordagem | 1 — UI gate + migration SELECT auth-only |
| Anon UX | Mensagem “Entre para ver as experiências.” + botão Entrar |
| Boot sem config / falha | Sem FALLBACK público; lista vazia + status (erro só se config inválida) |
| Pós-login | Recarregar `listLinks()` no auth change |
| Pós-logout | Limpar lista na UI |

## 4. Data / security

Migration `009_links_select_auth.sql`:

- Drop `links_select_public`
- Create `links_select_auth` — `SELECT` to `authenticated` using `(true)`

Insert/update/delete policies inalteradas.

## 5. App behavior

| Estado | `#links-admin-root` | `#links-list` |
|--------|---------------------|---------------|
| Anon + Supabase OK | Entrar | Status gate (sem `.link-card`) |
| Auth | Toolbar | Admin cards |
| Sem Supabase / key inválida | Vazio / erro config | Sem cards (sem FALLBACK) |

## 6. Tests

- Unit: helper de empty/gate renderiza mensagem e zero cards.
- E2E smoke: sem exigir `.link-card` para visitante; aceitar status + Entrar ou empty.

## 7. LGPD

Menos exposição pública de preferências/lugares. Checklist N/A se `privacy-policy.html` não mudar.

## 8. How to verify

1. Aplicar migration no Supabase.
2. Abrir `/p/a8f3k2/` logout → sem cards; “Entrar” visível.
3. Login → lista carrega.
4. Logout → lista some.
5. `npm run test:unit` + e2e smoke.
