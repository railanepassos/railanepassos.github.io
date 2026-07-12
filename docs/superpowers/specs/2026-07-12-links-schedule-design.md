# Design: Agendamento + ICS na tela de detalhes (links admin)

**Date:** 2026-07-12  
**Status:** Approved by titular (pending implementation)  
**Parent:** [links-admin-design](./2026-07-11-links-admin-design.md), [links-swipe-view-design](./2026-07-12-links-swipe-view-design.md)  
**Surface:** `/p/a8f3k2/` (editor autenticado)  
**Tipo:** `feat`

---

## 1. Problem

A tela de **Visualizar** permite ler nome, nota e link, mas não há como marcar **quando** viver a experiência nem levar isso para o calendário do celular (ICS). O carregamento textual / fluxo atual não cobre planejamento com deslocamento.

## 2. Goals

| Ação | Resultado |
|------|-----------|
| Editor em Visualizar → **Agendar** | Abre sheet com data + horários (padrão 09:00–17:00) |
| **Salvar agendamento** | Persiste `scheduled_start` / `scheduled_end` no Supabase |
| **Baixar ICS** | Gera `.ics` no cliente e inicia download |
| **Alterar data** | Reabre sheet com valores atuais |
| **Remover agendamento** | Limpa as colunas (`null`) |
| Lista (cards) | Chip com data/horário quando agendado |

**Fora de escopo (v1):** Google Calendar API / OAuth; calendário custom em CSS; agendamento por visitante anônimo; filtro “já agendados”; múltiplos horários / recorrência; 3 eventos separados de deslocamento.

## 3. Decisions (aprovadas)

| Tema | Decisão |
|------|----------|
| Quem agenda | Só editor logado |
| O quê | Data obrigatória; horários editáveis |
| Default de tempo | Bloco **09:00–17:00** `America/Sao_Paulo` (deslocamento incluso; no local ~10h–16h) |
| ICS | **1** VEVENT cobrindo 9–17 (ou horários editados) |
| Salvar vs ICS | Ações **separadas** (salvar ≠ download) |
| Visibilidade | Detalhes + chip na lista |
| UI de data | Controles nativos (`input type="date"` / `time`) |
| Visual | Tokens do site (`--green`, `--navy`, `--surface`, …) — não cores do protótipo |

## 4. Approach — nativo + colunas em `links`

### 4.1 Schema

Migration `004_links_schedule.sql` (e espelho em `001` para greenfield):

```sql
alter table public.links
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz;

alter table public.links
  drop constraint if exists links_schedule_order;
alter table public.links
  add constraint links_schedule_order
  check (
    scheduled_start is null and scheduled_end is null
    or scheduled_start is not null
       and scheduled_end is not null
       and scheduled_end > scheduled_start
  );
```

RLS existente (update autenticado) cobre gravação; select público continua a expor o schedule (leitura pública intencional da lista).

### 4.2 Módulos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/links/schedule.ts` | Defaults 09:00/17:00; montar/parse ISO em SP; validar fim > início; formatar chip (`20 jul · 9–17`) e label da view |
| `src/links/ics.ts` | `buildIcs({ uid, title, description, url, start, end })` → string RFC5545; `downloadIcs(filename, content)` via Blob |
| `src/links/links-repo.ts` | Tipagem + create/update/list com as novas colunas |
| `src/links/admin-ui.ts` | Sheet `createScheduleSheet`; ações na `createViewModal`; chip em cards |
| `src/links/main.ts` | Wire save/clear via repo; refresh lista após sucesso |
| `styles.css` | Estilos do sheet/chip com tokens existentes |

### 4.3 UX (tela Visualizar)

**Sem schedule**

- Botões: **Agendar** (primário) · **Editar** (secundário)

**Com schedule**

- Bloco “Agendado”: data + intervalo formatados
- Botões: **Baixar ICS** (primário) · **Alterar data** · **Remover agendamento** · **Editar**

**Sheet Agendar / Alterar**

- Chrome full-screen (mesmo padrão das outras telas)
- Campos: Data · Início · Fim (pré-preenchidos 09:00 / 17:00 ou valores salvos)
- Texto de ajuda: “Padrão: deslocamento incluso (9h–17h). No local ~10h–16h.”
- **Salvar agendamento** — só persiste; não baixa ICS
- Validação local antes do request

### 4.4 ICS

- `SUMMARY` = `link.label`
- `DESCRIPTION` = nota (se houver) + URL
- `URL` = `link.url`
- `DTSTART` / `DTEND` em horário local com `TZID=America/Sao_Paulo` (ou UTC equivalente documentado no código)
- `UID` estável por link (`{id}@railanepassos.tec.br`) para reimport não duplicar cegamente
- Sem dependências externas; sem alteração de CSP (`connect-src` inalterado)

### 4.5 Lista

- Chip abaixo da descrição/categoria quando `scheduled_start` presente
- Estilo alinhado ao chip de categoria (`--green-light` / `--green-dark`)
- Visível em cards públicos e admin

## 5. Errors

| Caso | Comportamento |
|------|----------------|
| Data vazia / fim ≤ início | Erro no sheet; não chama API |
| Falha Supabase | Mensagem genérica existente; sheet permanece aberto |
| Sem schedule | Esconde Baixar ICS / Remover / bloco Agendado |
| Visitante anônimo | Sem botões de agenda (só chip se já houver data pública) |

## 6. Testing

| Camada | Cobertura |
|--------|-----------|
| Unit `schedule.ts` | Defaults; validação; formatação chip; montagem start/end |
| Unit `ics.ts` | Contém `BEGIN:VCALENDAR`, `VEVENT`, `SUMMARY`, `DTSTART`, `DTEND`, `UID` |
| Unit repo (mocks) | Update patch com schedule / clear nulls |
| E2e smoke | Página carrega; sem fluxo auth de agenda no CI (igual smoke atual) |

TDD: testes unitários vermelhos antes da implementação dos módulos puros.

## 7. LGPD / segurança

- Schedule é metadado da experiência (planejamento do titular), não coleta de dados de terceiros
- Sem cookies, analytics ou scripts de terceiros novos
- ICS gerado só no cliente a partir de dados já carregados
- PR: marcar checklist LGPD **N/A** se `privacy-policy.html` não mudar; se a política precisar citar “data de planejamento da experiência”, bump + checklist completo
- Não relaxar CSP

## 8. Manual ops

Titular aplica `004_links_schedule.sql` no SQL Editor do Supabase (mesmo padrão das migrations 002/003).

## 9. Success criteria

1. Editor autenticado agenda data/horário na view e vê persistido após reload  
2. Chip aparece na lista  
3. **Baixar ICS** abre/baixa arquivo importável no calendário do iOS/Android  
4. Remover limpa schedule e chip  
5. Visitante não vê botões de agenda  
6. Unit tests verdes; build gera `app.js`
