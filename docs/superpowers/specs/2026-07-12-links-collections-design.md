# Design: Collections manuais (estilo Instagram Saved)

**Date:** 2026-07-12
**Status:** Approved
**Surface:** `/p/a8f3k2/` admin autenticado

## Contexto

Hoje cada experiência tem uma `category` fixa (bar/museu/parque/...), inferida por
keyword, single-select. Não existe conceito de pasta nomeada pelo usuário onde uma
mesma experiência possa aparecer em várias pastas ao mesmo tempo — o que o usuário
quer, inspirado no Saved Collections do Instagram.

Este spec cobre só as **collections manuais** (criar pasta, adicionar/remover
experiência, ver conteúdo da pasta). Agrupamento automático por proximidade/distância
a pé é um subsistema separado, com spec próprio depois deste.

## Modelo de dados

Nova migração `011_collections.sql`:

```sql
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index collections_name_unique on public.collections (lower(name));

create trigger collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create table public.link_collections (
  link_id uuid not null references public.links(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (link_id, collection_id)
);

alter table public.collections enable row level security;
alter table public.link_collections enable row level security;

-- auth-only em tudo nas duas tabelas (mesmo padrão de 009_links_select_auth.sql —
-- app de editor único, sem acesso anon).
create policy "collections_all_auth" on public.collections
  for all to authenticated using (true) with check (true);
create policy "link_collections_all_auth" on public.link_collections
  for all to authenticated using (true) with check (true);
```

- Nome de collection único (case-insensitive) via índice único em `lower(name)`.
- Deletar collection só remove a organização (`link_collections` cascade); a
  experiência (`links`) permanece intacta.
- Deletar um `link` remove suas entradas em `link_collections` via cascade.

## Arquitetura de código

- **`src/links/collections-repo.ts`** (novo, espelha `links-repo.ts`):
  - `listCollections(): Promise<Collection[]>`
  - `createCollection(name): Promise<Collection>`
  - `renameCollection(id, name): Promise<void>`
  - `deleteCollection(id): Promise<void>`
  - `listLinkCollectionIds(): Promise<Record<string, string[]>>` — busca todas as
    entradas de `link_collections` de uma vez (sem N+1), retorna mapa
    `link_id -> collection_id[]`.
  - `addLinkToCollection(linkId, collectionId): Promise<void>`
  - `removeLinkFromCollection(linkId, collectionId): Promise<void>`
  - Validação de nome (trim, 1–80 chars) espelha `validateLinkFields`.

- **`src/links/collections-ui.ts`** (novo arquivo — não em `admin-ui.ts`, que já
  está com ~1900 linhas; separar evita inchar mais e mantém a UI de collections
  isolada e testável):
  - `createCollectionsButton` (ícone toolbar)
  - `createCollectionsListScreen` (lista de pastas + "Nova collection")
  - `createCollectionDetailScreen` (itens da pasta + renomear/excluir)
  - `createCollectionsPickerSheet` (toggle por collection, a partir do ViewModal)

- **`src/links/main.ts`**: no boot, busca `collections` + `listLinkCollectionIds()`
  junto com `initialLinks` (mesmo padrão de fetch único, sem paginação, já usado
  pros links). Mantém em memória (`collections`, `linkCollectionIds` map), atualiza
  otimisticamente a cada create/rename/delete/add/remove, chamando o repo.

## UI / fluxos

- **Toolbar**: novo ícone "Collections" (bookmark) entre Filtrar e Sortear.
- **Tela "Collections"**: mesmo chrome full-screen das outras telas (back + título).
  Lista: nome + contagem de itens + capa (imagem do primeiro item da pasta).
  "Nova collection" no topo. Toque numa pasta → tela de detalhe.
- **Tela de detalhe**: header com nome + "..." (renomear/excluir a collection) +
  back. Corpo reaproveita `renderAdminCard` filtrado pelos ids da pasta — herda
  editar/agendar/concluir/swipe-delete da experiência sem trabalho extra.
- **ViewModal**: novo botão "Collections" (block, ghost) ao lado de
  Agendar/Concluir/Editar. Abre o picker sheet.
- **Picker sheet**: lista todas as collections com toggle (+/✓); tocar liga/desliga
  a experiência atual naquela pasta na hora (otimista). "Nova collection" no topo
  do picker cria e já marca a experiência atual nela.
- **Remover de uma collection** só acontece pelo picker (desmarcar o ✓) — não há
  swipe/remover duplicado dentro da tela de detalhe.
- Estados vazios: lista de collections vazia → "Nenhuma collection ainda. Crie a
  primeira."; collection sem itens → "Nenhuma experiência nesta collection ainda."

## Tratamento de erro

Mesmo padrão do resto do app: falha na chamada → mensagem genérica inline
(`GENERIC_ERROR`), sem crash. No picker, toggle é otimista — se a chamada falhar,
desmarca de volta e mostra erro no sheet. Criar/renomear/excluir collection segue o
padrão de `setBusy`/`setError` já usado em `formModal`.

## Testes

- `tests/unit/collections-repo.test.ts` (mirror de `links-repo.test.ts`): CRUD de
  collection, add/remove vínculo, `listLinkCollectionIds`, propagação de erro.
- `tests/unit/collections-ui.test.ts` (mirror de `admin-ui.test.ts`, jsdom): picker
  abre, toggle liga/desliga, criar collection nova dentro do picker, tela de
  detalhe filtra corretamente.
- `collections-ui.ts` entra no `coverage.exclude` do `vite.config.ts`, mesmo
  tratamento hoje dado a `admin-ui.ts`/`render.ts` (UI pesada em DOM — não conta
  na métrica, mas continua testada via jsdom).

## Out of scope

- Agrupamento automático por proximidade/distância a pé (subsistema separado,
  spec próprio depois deste — depende de lat/lng por experiência, que não existe
  hoje).
- Cobertura e2e do fluxo de login/collections (o e2e atual só cobre o guest-gate).
- Drag-and-drop ou reordenar collections entre si.
