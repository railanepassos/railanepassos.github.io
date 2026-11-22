# Spec: Fase 7 — Modo visita (guia do dia do passeio)

**Date:** 2026-11-22
**Status:** Approved (2026-11-22). Propostas [INFERIDO] aceitas como estão: banner "Hoje" entra, "Terminar visita" pergunta antes, offline fica para a 7.1
**Surface:** `/p/a8f3k2/` admin autenticado
**Depende de:** Fases 2, 3 e 4 (campos, "Como foi" e plano), já no ar
**Roadmap:** `2026-11-16-links-roadmap.md` (coluna "DIA DA VISITA" do diagrama)

Legenda: **[EXPLÍCITO]** foi decidido pela Railane. **[INFERIDO]** é uma proposta desta spec e deve ser confirmado na revisão.

## Problem Statement

O roadmap promete três momentos: antes, durante e depois. O antes (dossiê, roteiro, plano) e o depois (Como foi, Memórias) já estão no ar. O **durante** não existe como tela própria.

No dia do passeio, tudo o que precisamos já está no item, mas espalhado pelo detalhe, que foi feito para planejar:

- roteiro, dossiê, poses, checklist e lanches ficam em seções longas, uma abaixo da outra;
- a fonte é pequena para ler andando, no sol, com uma mão;
- a tela apaga enquanto lemos a história do lugar;
- ao sair do lugar, ninguém lembra de marcar como feito nem de escrever as impressões enquanto estão frescas.

## Solution

Um **Modo visita**: uma tela cheia, para usar no celular durante o passeio, que mostra só o que serve na hora, em abas grandes:

| Aba | Conteúdo | Origem |
|---|---|---|
| Roteiro | roteiro, endereço com "Abrir no mapa", custo, horário agendado | `itinerary`, `address`, `cost_text`, `scheduled_*` |
| Checklist | checklist e lista de compras marcáveis, com "quem" | `plan_items` (Fase 4) |
| História | dossiê em leitura confortável | `dossier` |
| Poses | poses de referência em lista grande | `pose_refs` |

O modo não cria dados novos. Ele lê o item e grava só os ticks do plano, pelo mesmo caminho do detalhe (`onSavePlanItems`). **Não há migration e não há coluna nova.** [INFERIDO]

Ao terminar, o botão **"Terminar visita"** propõe marcar o lugar como feito e abre o "Como foi" (Fase 3), fechando o ciclo antes → durante → depois. [INFERIDO]

```
Feed / detalhe ──▶ [Modo visita] ──▶ Terminar visita ──▶ Marcar feito? ──▶ Como foi
     ▲  banner "Hoje"     abas: Roteiro · Checklist · História · Poses
```

## User Stories

### Entrar
1. Como usuária, quero um botão "Modo visita" no detalhe de um lugar da wishlist, para abrir o guia com um toque.
2. Como usuária, quero um aviso no topo do feed quando um lugar está agendado para hoje ("Hoje: Pelourinho · Abrir modo visita"), para não procurar o item no dia. [INFERIDO]
3. Como usuária, quero que recarregar a página me devolva ao Modo visita do mesmo lugar, para não me perder se o navegador recarregar no meio do passeio. [INFERIDO]
4. Como usuária, quero que o botão não apareça em lugares já feitos, porque lá o que vale é o "Como foi". [INFERIDO]

### Usar durante o passeio
5. Como usuária, quero abas grandes no rodapé (zona do polegar), para trocar de seção com uma mão.
6. Como usuária, quero abrir na aba Roteiro, porque é o que preciso primeiro ao chegar.
7. Como usuária, quero esconder as abas que não têm conteúdo (ex. sem poses, sem aba Poses), para não abrir telas vazias.
8. Como usuária, quero texto maior e com mais contraste que no detalhe, para ler andando e no sol.
9. Como usuária, quero "Abrir no mapa" bem visível no Roteiro, para pedir o caminho na hora.
10. Como usuária, quero marcar e desmarcar itens do checklist e das compras, e que isso salve como no detalhe, para dividir a lista com quem está junto.
11. Como usuária, quero ver de quem é cada item ("Alana leva a toalha"), para saber o que cobrar de quem.
12. Como usuária, quero ver quantos itens faltam ("3 de 8"), para saber se esqueci algo antes de sair de casa.
13. Como usuária, quero que um tick que falhou ao salvar volte e mostre um aviso curto, para não achar que salvou sem sinal.
14. Como usuária, quero que a tela não apague enquanto o Modo visita está aberto, para ler a história sem tocar na tela. (Screen Wake Lock, com fallback silencioso.)
15. Como usuária, quero abrir uma pose em tela cheia (o link externo, em nova aba), para mostrar à pessoa que vai tirar a foto.
16. Como usuária, quero que o modo respeite `prefers-reduced-motion` e o tema claro/escuro, como o resto do app.

### Sair e fechar o ciclo
17. Como usuária, quero um "Terminar visita" que pergunte "Marcar como feito?", para registrar o passeio sem procurar o botão.
18. Como usuária, quero que, ao confirmar, a data da visita seja a de hoje e o "Como foi" abra em seguida, para escrever as impressões enquanto estão frescas.
19. Como usuária, quero poder sair do modo sem marcar nada (fechar ou "Agora não"), porque às vezes só estou relendo em casa.

## Implementation Decisions

### Módulos novos
- `src/links/visit.ts` (puro, testável):
  - `visitTabs(link): VisitTab[]` decide quais abas existem e em que ordem (só as com conteúdo; Roteiro sempre, porque tem endereço/agenda ou mostra "Sem roteiro ainda");
  - `isVisitToday(link, now): boolean`, com `scheduled_start` lido em horário local, como os cards;
  - `todayVisits(links, now): LinkRow[]`, só wishlist, ordenado pelo horário;
  - `planProgress(items, list): { done, total }`.
- `src/links/visit-ui.ts`: a tela cheia, as abas e o "Terminar visita". Recebe callbacks (`onSavePlanItems`, `onMarkDone`, `onClose`), como o `ViewModal`.
- `src/links/wake-lock.ts`: `requestWakeLock()` e `release()`, sem erro quando a API não existe. Reaquisita em `visibilitychange`.

### Reuso
- Os ticks usam o `onSavePlanItems` existente, com o mesmo rollback do detalhe.
- O "Abrir no mapa" usa `map-url.ts`.
- O render das poses reaproveita `renderPoseItem`, com uma classe de tamanho maior.
- "Marcar como feito" chama o `markDone` de `main.ts`, que já grava `completed_at` = agora e abre o "Como foi" (`openReview(done, "after-done")`). O modo só fecha antes.

### Estado na URL
- O fragmento `#visita/<id>` abre o modo, no mesmo padrão de `isPlanShareFragment`. Fechar o modo limpa o fragmento com `history.replaceState`. [INFERIDO]
- Um id inexistente ou de lugar feito cai no feed sem erro.

### Banner "Hoje"
- O banner aparece no topo do feed quando `todayVisits` não está vazio. Com mais de um lugar, mostra o primeiro e "+N".
- O banner pode ser dispensado no dia. A dispensa fica no `sessionStorage` (conveniência por aparelho, com try/catch). [INFERIDO]

### Restrições do roadmap
- Custo zero, sem API paga, sem Storage. A Wake Lock é uma API do navegador.
- **CSP sem mudança.** Não há embed, as poses e o mapa abrem como links.
- **LGPD:** não há dado novo. O modo mostra dados que já estão sob RLS. A troca do `?v=` do bundle passa pelo gate, então o PR leva `LGPD-OK` e o checklist.
- UI: ícones SVG de traço fino, sem emoji, mobile-first. No desktop (≥1024px), o modo abre como painel largo centralizado.

## Testing Decisions

- **Unidade (Vitest):**
  - `visitTabs` com combinações de campos vazios;
  - `isVisitToday` e `todayVisits` na virada do dia, com fuso local e com itens feitos excluídos;
  - `planProgress`;
  - o parse do fragmento `#visita/<id>`;
  - `wake-lock` sem `navigator.wakeLock`.
- **UI (jsdom), como `plan-sheet.test.ts`:**
  - as abas renderizam só com conteúdo;
  - o tick chama `onSavePlanItems` e faz rollback na rejeição;
  - "Terminar visita" → "Marcar como feito" fecha o modo e chama `onMarkDone`;
  - "Agora não" fecha sem chamar nada.
- **E2E (Playwright), um spec `links-visit.spec.ts`:**
  - abrir pelo detalhe, marcar um item, recarregar com `#visita/<id>` e ver o tick mantido;
  - terminar a visita e ver o "Como foi" aberto.
- **Acessibilidade:** as abas são `role="tablist"` com setas no teclado, e o pa11y cobre a tela.

## Out of Scope

- **Offline de verdade** (service worker, fila de ticks sem sinal). Nesta fase, o tick sem sinal faz rollback e avisa. Fica como candidato à Fase 7.1, se fizer falta no uso real.
- Localização em tempo real, "estou perto" e notificações.
- Embed de mapa ou de vídeo, porque exigiriam relaxar a CSP.
- Foto tirada dentro do app, porque não há Storage.
- Modo visita no link público do plano (Fase 4.1). Os participantes continuam com a página de ticks atual.
- Timer ou cronômetro por parada do roteiro. O roteiro continua sendo texto livre.

## Perguntas para a revisão

1. O banner "Hoje" no feed entra nesta fase, ou fica só o botão no detalhe?
2. "Terminar visita" deve marcar como feito direto ou sempre perguntar? A spec propõe perguntar.
3. A falta de offline incomoda já (lugares sem sinal), ou pode esperar a 7.1?

## Further Notes

Fluxo sugerido depois do APROVADO: `/to-tickets` a partir desta spec, depois `/implement-spec` numa branch de integração (`feat/links-visit-mode`), revisão opus, CI verde e merge.
