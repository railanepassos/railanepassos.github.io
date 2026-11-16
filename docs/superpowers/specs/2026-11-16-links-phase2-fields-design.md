# Spec: Fase 2 — dados do lugar, tags e busca com filtros

**Date:** 2026-11-16
**Status:** Draft (aguardando revisão da Railane)
**Surface:** `/p/a8f3k2/` admin autenticado
**Depende de:** Fase 1 (`feat/links-social-redesign`) mergeada
**Roadmap:** `2026-11-16-links-roadmap.md`

## Problem Statement

Hoje um item da bucket list é praticamente só um nome, uma categoria e um link. Faltam informações básicas:

- quanto custa e onde fica;
- a história do lugar e o que ver;
- um roteiro e o post de onde veio a ideia;
- referências de poses para fotos.

Sem isso, chegamos ao lugar sem contexto (não temos guia turístico) e planejamos mal o dia.

Também não dá para achar itens por tema, pessoa ou perfil de origem: a busca não entende `#praia` ou `@alana`.

## Solution

Cada item ganha campos opcionais:

- custo
- cidade/endereço
- dossiê (história e o que ver)
- roteiro
- link do post de origem
- poses de referência (lista de links e descrições)
- tags livres
- pessoas

O detalhe mostra tudo em seções legíveis no celular. O formulário continua rápido: só o link é obrigatório e o resto é opcional e recolhível.

A busca aceita uma sintaxe estilo rede social: `#tag`, `@pessoa`, texto livre e atalhos (`cidade:`, `custo<`). Tags e pessoas aparecem como chips clicáveis que filtram na hora.

## User Stories

1. Como usuária, quero registrar o custo de um lugar (texto livre, ex. "R$ 20 inteira · grátis às quartas"), para saber antes se cabe no orçamento.
2. Como usuária, quero ver o custo no card do feed, para comparar lugares sem abrir cada um.
3. Como usuária, quero registrar cidade e endereço, para saber onde fica e planejar o deslocamento.
4. Como usuária, quero ver a cidade no card do feed, para filtrar mentalmente por região.
5. Como usuária, quero um botão "Abrir no mapa" no detalhe, montado a partir do endereço, para chegar lá sem copiar e colar.
6. Como usuária, quero escrever um dossiê do lugar (história, curiosidades, o que não perder), para chegar com contexto.
7. Como usuária, quero ler o dossiê confortavelmente no celular durante a visita, para usar como guia.
8. Como usuária, quero escrever um roteiro (ordem das paradas, horários, dicas), para aproveitar melhor o dia.
9. Como usuária, quero salvar o link do post de origem (Instagram, TikTok, blog) separado do link oficial do lugar, para rever de onde veio a ideia.
10. Como usuária, quero ver "Ver post original" no detalhe, quando houver, para abrir o post com um toque.
11. Como usuária, quero adicionar poses de referência como link e/ou descrição escrita, para ter boas fotos no local.
12. Como usuária, quero ver as poses como lista no detalhe, para consultar na hora da foto.
13. Como usuária, quero remover ou reordenar uma pose, para manter a lista útil.
14. Como usuária, quero adicionar tags livres (`#praia`, `#grátis`), para organizar por tema além da categoria.
15. Como usuária, quero autocomplete das tags já usadas, para não criar duplicatas como `#praia` e `#praias`.
16. Como usuária, quero que tags sejam normalizadas (minúsculas, sem acento na comparação), para que `#Praia` e `#praia` sejam a mesma.
17. Como usuária, quero marcar pessoas no item (quem sugeriu ou quer ir), para filtrar por `@alana`.
18. Como usuária, quero tocar num chip de tag ou pessoa no card ou no detalhe, para filtrar o feed por ele.
19. Como usuária, quero digitar `#museu @alana pelourinho` na busca, para combinar filtros numa linha só.
20. Como usuária, quero `cidade:Salvador` e `custo<50` na busca, para filtros estruturados rápidos.
21. Como usuária, quero ver os filtros ativos como chips removíveis acima do feed, para entender e desfazer o filtro.
22. Como usuária, quero que a busca ignore maiúsculas e acentos, para achar "Recôncavo" digitando "reconcavo".
23. Como usuária, quero que itens antigos sem os campos novos continuem aparecendo normalmente, para não perder nada.
24. Como usuária, quero que o formulário de adicionar continue com um campo obrigatório só (o link) e os campos novos recolhidos em "Mais detalhes", para salvar rápido.
25. Como usuária, quero editar qualquer campo novo depois, para completar o item com calma.
26. Como usuária, quero que seções vazias não apareçam no detalhe, para a tela ficar limpa.
27. Como usuária, quero links externos (post, poses) sempre abrindo em nova aba com `rel="noopener"`, para segurança.
28. Como mantenedora, quero que só links https sejam aceitos nos campos de link, para não abrir esquemas perigosos.

## Implementation Decisions

- **Schema:** uma migration nova na tabela `links`, só com colunas opcionais e nulas por padrão, para que os dados existentes continuem válidos:
  - `cost_text text` (custo é texto livre, porque preço real costuma ser "inteira/meia/grátis às quartas"; um número exato não modela bem);
  - `city text`;
  - `address text`;
  - `dossier text`;
  - `itinerary text`;
  - `source_url text` (link do post de origem; o `url` existente segue como link principal);
  - `pose_refs jsonb` (array de `{url?: string, note?: string}`);
  - `tags text[]`;
  - `people text[]`.
- **Constraints:**
  - checks de tamanho máximo nos textos, seguindo o padrão das migrations existentes;
  - `source_url` e cada `pose_refs[].url` precisam começar com `https://` (checar no cliente e no banco quando viável).
- **RLS:** as policies existentes da tabela cobrem as colunas novas. Confirmar e rodar `docs/lgpd-checklist.md`, pois `people` e textos livres são dados pessoais.
- **Normalização de tags:** módulo puro. Ele tira o `#`, deixa em minúsculas e faz trim. A comparação ignora acentos e o valor exibido preserva o original.
- **Parser de busca:** módulo puro (`parseQuery(text) → {terms, tags, people, city?, costMax?}`) mais um `matches(link, query)`. Ele substitui o matcher simples da Fase 1 e roda tudo no cliente sobre as linhas já carregadas, sem query nova ao banco.
- **"Abrir no mapa":** monta uma URL `https://www.google.com/maps/search/?api=1&query=<endereço+cidade>`. Só um link, sem API nem custo.
- **UI:** reaproveitar os componentes da Fase 1 (chips, seções do detalhe, sheet do formulário). Os campos novos ficam numa seção "Mais detalhes" recolhida no formulário.
- **Seam de teste principal:** os módulos puros (parser/matcher de busca, normalização de tags, validação de links e poses) mais o e2e com sessão mockada já criado na Fase 1.

## Testing Decisions

- Testar comportamento externo, nunca detalhes internos: entrada → saída nos módulos puros e o que a usuária vê no e2e.
- **Vitest (unit):**
  - `parseQuery` e `matches`, com combinações de `#`, `@`, texto, `cidade:` e `custo<`, acentos e maiúsculas;
  - normalização e deduplicação de tags;
  - validação https de `source_url` e `pose_refs`;
  - formatação do link de mapa.
  - Prior art: os testes existentes em `tests/unit/` (ex.: filtro de categoria, card-theme).
- **Playwright (e2e, sessão mockada, projetos mobile e desktop):**
  - item com todos os campos mostra todas as seções no detalhe;
  - item antigo sem campos não mostra seções vazias;
  - tocar numa tag filtra o feed;
  - a busca `#tag @pessoa` filtra corretamente;
  - o formulário salva os campos novos (mockando o POST/PATCH do PostgREST).
- **Migration:** validar localmente com o padrão das migrations `001`–`010` (constraints e defaults) antes de aplicar no projeto.

## Out of Scope

- Nota, impressões, lições, ranking e link de vídeo (Fase 3).
- Checklist e lista de lanches (Fase 4).
- Qualquer IA ou importação do Instagram (Fase 5).
- Imagem automática via og:image ou Wikipedia (avaliar junto com a Fase 5, porque precisa de fetch fora do CSP atual).
- Upload de arquivos ou uso de Supabase Storage.
- Embed de vídeo ou mapa (exigiria relaxar a CSP).

## Further Notes

- Pergunta em aberto herdada do roadmap: `@` cobre pessoas e também perfis de origem? Esta spec assume **pessoas** em `people`. O perfil de origem pode ser derivado do `source_url` numa fase futura.
- Fluxo sugerido: `/setup-matt-pocock-skills` (uma vez, escolhendo onde ficam specs e tickets), depois `/to-tickets` a partir desta spec, depois `/implement-spec`.
