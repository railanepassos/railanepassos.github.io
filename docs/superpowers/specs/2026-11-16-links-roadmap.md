# Roadmap: Bucket List como "guia de bolso"

**Date:** 2026-11-16
**Status:** Approved (ordem das fases); cada fase vira spec própria antes de implementar
**Surface:** `/p/a8f3k2/` admin autenticado

## Visão

Uma bucket list de lugares que acompanha o passeio inteiro:

- **antes:** entender o lugar e planejar;
- **durante:** um guia na mão, já que não temos guia turístico;
- **depois:** registrar impressões e aprender para o próximo.

As lições do "depois" alimentam o checklist do próximo "antes".

```
ANTES (planejar)        DIA DA VISITA (guia)       DEPOIS (aprender)
Dossiê do lugar   ──▶   Modo visita          ──▶   Impressões + nota
Roteiro/horários        Checklist marcável         Ranking
Lista de lanches        Poses de referência        Lições aprendidas
Agenda / sorteio        História à mão             Vídeo/álbum (link)
       ▲                                                  │
       └──────── lições viram itens do checklist ◀────────┘
```

## Restrições (valem para todas as fases)

- **Custo zero.** O Supabase fica no plano free e o app não usa APIs pagas.
- **Zero Supabase Storage.** Imagem, vídeo e álbum entram só como link externo (https).
- **Imagem do card:** foto padrão da categoria, ou um link externo (og:image ou Wikipedia/Wikimedia). Não usar Google Maps Photos, porque exige billing.
- **IA sem chave no front-end** (o repo é público). A IA roda por skill do Claude local, que pede aprovação antes de gravar. Gemini via Edge Function só se fizer falta, e com revisão de segurança.
- **CSP:** não relaxar sem revisão. Embed de vídeo exigiria `frame-src`, então mostrar só a miniatura (`img-src https:` já cobre) e o link.
- **LGPD:** notas e impressões são dados pessoais. Ficam sob RLS e passam pelo `docs/lgpd-checklist.md` a cada coluna nova.
- **UI:** visual de rede social (Fase 1), ícones SVG de traço fino, sem emoji, mobile-first, respeitando `prefers-reduced-motion`.

## Fases

| Fase | Conteúdo | Status |
|---|---|---|
| 1 | Redesign visual (feed, grade desktop, detalhe, sheet de adicionar), busca simples, deck restilizado | ✅ No ar |
| 2 | Campos novos: custo, cidade/endereço, dossiê (história/o que ver), roteiro, link do post de origem, poses de referência (links + texto), **tags `#` e menções `@`**, busca com sintaxe | ✅ No ar |
| 3 | Depois da visita: nota (1–5), "voltaria?", impressões, lições aprendidas, ranking, link de vídeo/álbum de memória | ✅ No ar |
| 4 | Plano do passeio: **participantes** (por nome, sem precisar de conta, ex. Railane, Alana, Lúcia), **responsabilidades** (quem leva o quê, quem compra os ingressos), checklist marcável + lista de lanches/compras, lições da Fase 3 sugeridas como itens; **exportar mensagem para o WhatsApp** com data, local, roteiro e a lista de quem faz o quê | ✅ No ar |
| 5 | Skills do Claude local: importar do Instagram (DMs e posts compartilhados via Claude in Chrome), gerar dossiê, roteiro e lista de lanches, sempre com aprovação antes de inserir | ✅ No ar |
| 6 | Aba Memórias (linha do tempo dos feitos, "há 1 ano…"), sorteio com filtros (custo, cidade, tag, tempo) | ✅ No ar |
| 4.1 | Link do plano para participantes (marcar itens sem login) | ✅ No ar |
| Extras | Dossiê e roteiro mais ricos na skill; várias categorias por item (principal + até 3); Fontes (links das fontes) nos detalhes; campo Duração | ✅ No ar |
| 7 | Modo visita: tela cheia para o dia do passeio (roteiro, checklist marcável, história, poses), tela acesa, banner "Hoje" e "Terminar visita" → Como foi. Spec: `2026-11-22-links-modo-visita-design.md` | ✅ No ar |
| 8 | Imagem automática: "Buscar imagem" na Wikipedia no formulário + regra de imagem na skill. Spec: `2026-11-22-links-imagem-automatica-design.md` | ✅ No ar |
| 9 | Pedidos ao Claude: botões no app (importar do Instagram, refinar dossiê/roteiro/lanches/imagem de 1+ lugares, importar da agenda) viram uma fila no Supabase processada pelo Claude local. Spec: `2026-11-22-links-pedidos-claude-design.md` | ✅ No ar |
| 10 | Exportar para o Google Agenda: botão por lugar, `.ics` de todos e link de assinatura (Edge Function). Spec: `2026-11-22-links-google-agenda-export-design.md` | ✅ No ar |

## Decisões já tomadas

- **Vídeos de memória:** a Railane sobe manualmente no YouTube como **não listado** e cola o link no item. Não automatizar upload nem edição. A edição fica no celular (montagem automática do Google Fotos ou modelo do CapCut), com música da Biblioteca de Áudio do YouTube, para evitar bloqueio por direitos autorais. O app mostra a miniatura e o botão "Assistir".
- **IA:** primeiro via skill do Claude local (zero custo, revisão humana). Botão de IA dentro do app fica fora até haver necessidade.

- **Participantes e WhatsApp (Fase 4):**
  - Participantes são nomes, não contas. Só Railane e Alana fazem login. Não guardar telefone de terceiros (LGPD: mínimo necessário).
  - A mensagem é montada no app e aberta com `https://wa.me/?text=<mensagem>` (ou `navigator.share` no celular). Você escolhe o grupo ou contato no próprio WhatsApp.
  - Sem API do WhatsApp (paga e burocrática). O grupo temporário é criado manualmente no WhatsApp.

## Perguntas em aberto

- `@` significa **pessoas** (Railane, Alana), **perfis do Instagram de origem**, ou os dois? Proposta para a Fase 2: os dois, como campos distintos. Tocar num chip de pessoa filtra por pessoa, e `@perfil` vem do link do post.

## Como implementar cada fase

1. Spec da fase no formato do `to-spec` (Problem, Solution, User Stories, Implementation/Testing Decisions, Out of Scope).
2. `/to-tickets` quebra a fase em tickets com dependências.
3. `/implement-spec` implementa os tickets em branch de integração com TDD, roda `code-review` e abre PR. Merge só com aprovação humana (AGENTS.md).
