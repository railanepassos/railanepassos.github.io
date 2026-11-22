# Spec: Fase 9 — Pedidos ao Claude (botões de IA no app)

**Date:** 2026-11-22
**Status:** Approved. A Railane escolheu o "Claude local" como motor e "Importar da agenda via Claude local" em 2026-11-22.
**Surface:** `/p/a8f3k2/` admin autenticado, Supabase e a skill local `bucket-list`
**Roadmap:** `2026-11-16-links-roadmap.md`. Evolui a Fase 5, que hoje só funciona pedindo no chat.

## Problem Statement

Importar do Instagram e gerar dossiê ou roteiro já funcionam, mas só quando a Railane abre uma sessão do Claude na pasta do repo e pede no chat. Ela não acha a função dentro do app. Também não dá para pedir isso do celular, nem para vários lugares de uma vez.

## Solution

O app ganha **botões que criam pedidos** numa fila no Supabase. Uma **tarefa agendada do Claude no Mac** pega os pedidos pendentes, roda a skill `bucket-list` e grava o resultado como **sugestão**. A Railane revisa a sugestão no formulário de sempre e toca em Salvar. Nada é salvo sem ela.

```
App: botão ──▶ links_ai_requests (pendente) ──▶ tarefa agendada no Mac (Claude + skill)
                                                     │  Instagram (Chrome) · fontes públicas · Google Agenda
App: "Sugestões prontas (N)" ◀── pronto + result ◀───┘
   └─▶ Revisar (formulário com rascunho) ──▶ Salvar ──▶ aplicado
```

Há três tipos de pedido:

| Tipo | Onde pedir | O que o Claude faz | O que volta |
|---|---|---|---|
| `instagram` | Menu "Pedir ao Claude" → "Importar do Instagram": colar 1 a 10 links de post e/ou marcar "posts que me mandaram nas DMs" | Lê os posts no Chrome logado e pesquisa as fontes públicas | Rascunho `novo` ou `fila` |
| `refinar` | No detalhe, "Pedir ao Claude". No menu, escolher 1 a 10 lugares da lista. Opções: dossiê, roteiro, lanches/checklist, imagem | Pesquisa fontes públicas e escreve | Um rascunho `atualizacao` por lugar |
| `agenda` | Menu "Pedir ao Claude" → "Importar da agenda" (período, padrão: próximos 60 dias) | Lê o Google Agenda pelo conector e casa os eventos com os lugares da lista | Propostas de agendamento (lugar + início/fim + nome do evento) |

## User Stories

1. Como usuária, quero um item "Pedir ao Claude" no menu do app, para achar a importação e o refino sem abrir o terminal.
2. Como usuária, quero colar um ou vários links de post do Instagram e pedir a importação, para cadastrar passeios do celular.
3. Como usuária, quero pedir que o Claude olhe os posts compartilhados nas minhas DMs, para não copiar link por link.
4. Como usuária, quero pedir dossiê, roteiro, lanches e imagem para um lugar no próprio detalhe dele.
5. Como usuária, quero escolher vários lugares de uma vez e pedir o mesmo refino para todos.
6. Como usuária, quero pedir "Importar da agenda" para um período, para trazer ao app os passeios que já marquei no Google Agenda.
7. Como usuária, quero ver meus pedidos e o status de cada um (Na fila, Processando, Pronto, Erro), para saber o que esperar.
8. Como usuária, quero ver no topo "Sugestões prontas (N)", para revisar quando o Claude terminar.
9. Como usuária, quero que "Revisar" abra o formulário de sempre já preenchido (um por um, quando forem vários), para salvar só o que aprovo.
10. Como usuária, quero aplicar ou ignorar cada proposta de agendamento vinda da agenda.
11. Como usuária, quero descartar um pedido ou uma sugestão, para limpar a lista.
12. Como usuária, quero saber que o processamento depende do Mac ligado, e quando foi a última rodada, para não achar que travou.
13. Como usuária, quero que pedidos com erro mostrem o motivo em uma linha e possam ser refeitos.

## Implementation Decisions

### Banco (migration `021_links_ai_requests.sql`)
- A tabela `public.links_ai_requests` tem:
  - `id uuid pk`, `kind text check in ('instagram','refinar','agenda')`;
  - `payload jsonb`, com `link_ids`, `post_urls`, `from_dms`, `options`, `range_start`, `range_end`, validado por check de tamanho;
  - `status text check in ('pendente','processando','pronto','erro','aplicado','descartado') default 'pendente'`;
  - `result jsonb` (rascunho no formato da skill ou `{ "agenda": [...] }`), `error text` com até 300 caracteres;
  - `created_by uuid default auth.uid()`, `created_at`, `updated_at`, `processed_at`.
- **RLS** com `public.links_is_editor()` (migration 017) em todas as operações. O app só insere com `status = 'pendente'` e só muda o status para `aplicado`/`descartado`. Isso fica garantido por uma policy de update com check, ou por RPC.
- Retenção: pedidos `aplicado`/`descartado` com mais de 90 dias são apagados pelo próprio processador.
- `public.links_ai_runs` é uma linha única com `last_run_at`, que o processador atualiza a cada rodada e o app lê para mostrar "Última verificação: há 12 min".

### App
- `src/links/ai-requests.ts` (puro): validação do payload (no máximo 10 links de post, todos `https://www.instagram.com/...`, no máximo 10 `link_ids` e período de no máximo 180 dias), rótulos de status e contagem de prontos.
- `src/links/ai-requests-repo.ts`: listar, criar, descartar e marcar aplicado.
- `src/links/ai-requests-ui.ts`: o sheet "Pedir ao Claude" (três abas: Instagram, Refinar e Agenda) e o sheet "Pedidos e sugestões".
- **Revisão:** `result` passa pelo mesmo `parseDraft` (com `validateDraft`) usado no fragmento `#rascunho=`. Assim, a sugestão abre no fluxo de rascunho que já existe, inclusive a `fila`. Depois de Salvar, o pedido vira `aplicado`. Um resultado inválido aparece como erro e nunca é aplicado.
- **Agenda:** a lista de propostas mostra lugar, data e hora e o nome do evento, com os botões "Aplicar" (usa o mesmo save do agendamento que já existe, `scheduled_start`/`scheduled_end`) e "Ignorar".
- Pontos de entrada:
  - item "Pedir ao Claude" no menu ou cabeçalho;
  - botão "Pedir ao Claude" no detalhe;
  - badge "Sugestões prontas (N)" no topo do feed quando N > 0.
- Atualização: o app recarrega a lista ao abrir, ao voltar para a aba (`visibilitychange`) e a cada 60 s enquanto há pedido pendente ou em processamento. Não usa Realtime.

### Processador local
- A skill `bucket-list` ganha o **Modo fila** em `SKILL.md`. A cada rodada:
  1. atualiza `links_ai_runs`;
  2. pega até 5 pedidos `pendente` (os mais antigos) e marca `processando`;
  3. roda o modo certo (Instagram / dossiê-roteiro / agenda);
  4. valida o rascunho com `npm run draft-url` (exit 0) antes de gravar;
  5. grava `result` + `pronto`, ou `erro` + o motivo;
  6. faz a limpeza de retenção.
- **Acesso ao banco:** pelo Supabase MCP (`execute_sql`), que já está configurado no Mac da Railane. É uma exceção documentada à regra "sem API do Supabase": o processador só lê e escreve `links_ai_requests`/`links_ai_runs` e lê `links` (nome, cidade, endereço e campos existentes, para refinar e casar com a agenda). Nunca escreve em `links`.
- **Agenda:** usa o conector do Google Calendar da sessão, só leitura. Casa o evento com o lugar pelo nome ou endereço, com a confiança declarada. Na dúvida, não propõe.
- **Instagram:** as mesmas regras da Fase 5 (Chrome logado, só leitura). Das DMs fica só o link do post e fatos do lugar. Nada de nomes, @ ou mensagens.
- **Agendamento:** uma tarefa agendada no app Claude (scheduled-tasks), **de hora em hora, das 8h às 23h**, com o prompt "Processar a fila da Bucket List" no diretório do repo. A rodada sai cedo quando a fila está vazia, para gastar pouco. A Railane também pode pedir "processar a fila agora" no chat.

### LGPD
- O texto dos pedidos (links de post e opções) e os resultados (rascunhos) ficam sob RLS, só para as editoras.
- O que vem da agenda guarda só o nome do evento, o início e o fim. Não guarda participantes nem descrição.
- Retenção de 90 dias depois de aplicado ou descartado.
- Política: §3 ganha "pedidos ao assistente", e §4 cita Anthropic (Claude) como operador do processamento local e Google Agenda como fonte, só leitura e só por pedido da editora.

### CSP
- Sem mudança, porque tudo vai pelo Supabase que já está liberado.

## Testing Decisions

- **Unidade:**
  - validação do payload (limites, URLs do Instagram, período);
  - contagem de prontos;
  - rótulos;
  - `result` inválido rejeitado;
  - mapeamento das propostas de agenda.
- **UI (jsdom):**
  - criar pedido de cada tipo;
  - lista com status;
  - badge;
  - "Revisar" chama o fluxo de rascunho;
  - "Aplicar" de agenda chama o save do agendamento;
  - descartar.
- **Migration (pglite, como os testes `migration-0xx`):**
  - RLS: quem não é editora não lê nem escreve;
  - a editora não consegue gravar `result` nem `status = 'pronto'` (só o processador, via service role ou MCP);
  - limites de tamanho.
- **E2E:** criar pedido de refino, simular a resposta da fila (backend mockado) com `pronto` + `result`, revisar, salvar e ver o pedido `aplicado`.

## Out of Scope

- Gemini ou qualquer IA na nuvem.
- Processar com o Mac desligado.
- Supabase Realtime e push.
- Escrever no Google Agenda (a exportação fica na Fase 10).
- O Claude salvar direto em `links`.
