# Spec: Fase 10 — Exportar para o Google Agenda

**Date:** 2026-11-22
**Status:** Approved (pedido da Railane em 2026-11-22: "opção de importar/exportar agenda para google calendar"; a importação fica na Fase 9)
**Surface:** `/p/a8f3k2/` admin autenticado e uma Edge Function do Supabase
**Roadmap:** `2026-11-16-links-roadmap.md`

## Problem Statement

Hoje um passeio agendado só sai do app como download de `.ics`, um por um. No celular, abrir esse arquivo no Google Agenda é confuso. E nada mantém a agenda atualizada: se a data muda no app, o evento antigo fica errado.

## Solution

1. **"Adicionar ao Google Agenda"**, por lugar agendado.
   - Fica no detalhe e no sheet de agendamento, ao lado do `.ics` que já existe.
   - Abre `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&details=…&location=…&ctz=America/Bahia` numa nova aba.
   - É navegação comum: não chama API, não faz login no app e não mexe na CSP.
2. **"Exportar agenda (.ics)"** no menu: um arquivo com todos os lugares agendados da wishlist, para importar de uma vez em qualquer agenda.
3. **"Assinar no Google Agenda"**: um link de assinatura secreto. É um feed `.ics` servido por uma Edge Function, que o Google Agenda atualiza sozinho de tempos em tempos (o Google decide quando, em geral algumas horas).
   - O link pode ser ligado, trocado (rotacionado) e desligado, no mesmo padrão do "Link do plano" da Fase 4.1.
   - O app mostra "Copiar link" e "Abrir no Google Agenda", que vai para `https://calendar.google.com/calendar/r?cid=<url webcal>`.

## User Stories

1. Como usuária, quero tocar em "Adicionar ao Google Agenda" num lugar agendado, para criar o evento com nome, data, hora, endereço e link sem digitar.
2. Como usuária, quero exportar todos os agendados num `.ics`, para importar de uma vez.
3. Como usuária, quero assinar a agenda do app no Google Agenda, para que mudanças de data apareçam lá sozinhas.
4. Como usuária, quero trocar ou desligar o link de assinatura, para cortar o acesso se ele vazar.
5. Como usuária, quero que o evento tenha o endereço no campo local e o link do lugar na descrição, para abrir o mapa direto do Google Agenda.

## Implementation Decisions

- `src/links/google-calendar.ts` (puro):
  - `googleCalendarUrl(link)` monta o template com datas em UTC (`YYYYMMDDTHHMMSSZ/…`), `location` igual a endereço + cidade e `details` igual a descrição + URL. Respeita o limite de tamanho da URL truncando os detalhes.
  - `buildCalendarIcs(links)` monta um VCALENDAR com vários VEVENTs, reaproveitando `ics.ts`.
- **Feed:**
  - A migration `022_links_calendar_feed.sql` cria a tabela de uma linha `links_calendar_feed(token text unique, enabled bool, rotated_at)`, com RLS de editora e RPCs `links_calendar_feed_enable()` / `rotate` / `disable` no padrão das RPCs do plan share (migration 014). O token tem 32 bytes aleatórios em base64url.
  - A Edge Function `supabase/functions/links-calendar/index.ts` faz `GET ?t=<token>` e:
    - compara o token em tempo constante;
    - com o feed ligado, lê os `links` agendados (`status != 'done'`, `scheduled_start` não nulo, próximos 12 meses e últimos 30 dias) com a service role;
    - responde `text/calendar; charset=utf-8`;
    - com token errado ou desligado, responde 404 sem detalhe;
    - manda `Cache-Control: private, max-age=900`.
  - O feed tem só nome, início, fim, endereço/cidade e URL do lugar. Não leva nota, impressões, pessoas nem plano.
  - O deploy da função é feito pelo Supabase MCP (`deploy_edge_function`), com `verify_jwt = false`, porque o Google não manda JWT. O acesso é protegido pelo token.
- **Segurança:** quem tiver o link do feed vê os passeios agendados e seus endereços. Por isso o token é longo e rotacionável, a resposta não ecoa o token e 404 é igual para token errado e feed desligado. A revisão de segurança fica registrada na issue.
- **CSP:** sem mudança. O app só mostra e copia o link, e quem chama a função é o Google.
- **LGPD:** o feed expõe agenda e endereços de lugares (não são dados de terceiros) para o Google (operador já citado no calendário público do site). A política §4 ganha a menção ao feed opcional, ligado pela editora.

## Testing Decisions

- **Unidade:**
  - `googleCalendarUrl` com acentos, sem endereço, sem fim, truncamento e fuso;
  - `buildCalendarIcs` com 0, 1 e N eventos, escapes e quebra de linha a 75 octetos, se o `ics.ts` já faz isso.
- **Edge Function:** testes Deno ou Vitest da função de montagem pura (token válido, inválido e desligado → 404, filtro de datas e campos).
- **Migration (pglite):** RLS da tabela do feed e RPCs só para editora.
- **UI (jsdom):** botão "Adicionar ao Google Agenda" só com agendamento; exportar `.ics`; ligar, copiar, trocar e desligar o feed.

## Out of Scope

- Escrever direto no Google Agenda via API ou OAuth.
- Sincronizar de volta do Google para o app (a importação é feita pelo Claude, na Fase 9).
- Uma agenda para cada participante.
