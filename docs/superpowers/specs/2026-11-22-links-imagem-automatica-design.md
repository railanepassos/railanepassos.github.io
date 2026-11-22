# Spec: Fase 8 — Imagem automática do card

**Date:** 2026-11-22
**Status:** Approved (pedido direto da Railane em 2026-11-22: "agora faz a imagem automática do card")
**Surface:** `/p/a8f3k2/` admin autenticado e skill local `bucket-list`
**Roadmap:** `2026-11-16-links-roadmap.md` (restrição "Imagem do card"); estava fora do escopo da Fase 2

## Problem Statement

Quase todo card mostra a foto padrão da categoria, porque achar e colar o link de uma imagem dá trabalho. O feed fica repetitivo e é difícil reconhecer um lugar de relance.

## Solution

Há dois caminhos, ambos com custo zero e sem Supabase Storage:

1. **No app, o botão "Buscar imagem"** fica no campo Imagem do formulário (novo item e edição).
   - Ele busca na **Wikipedia em português** pelo nome do lugar e pela cidade, e mostra até 6 miniaturas.
   - Tocar numa miniatura preenche o campo Imagem com a URL https da imagem do Wikimedia.
   - A busca **só acontece quando o editor toca no botão**. Nada é buscado sozinho.
   - Sem resultado, o app mostra "Nenhuma imagem encontrada" e deixa colar um link à mão.
2. **Na skill local `bucket-list`**, a regra de `image_url` fica explícita.
   - A skill sempre propõe uma imagem: a `og:image` do site oficial ou uma imagem do Wikimedia Commons.
   - Ela confere que a URL é https e abre. Na dúvida, fica sem imagem.
   - Em `atualizacao`, ela pode preencher a imagem de itens antigos que ainda não têm.

**Por que não `og:image` dentro do app:** o navegador não consegue ler o HTML de outro site (CORS). Para isso seria preciso um proxy, como uma Edge Function, e um proxy que busca qualquer URL é risco de SSRF e de abuso. A `og:image` fica na skill local, onde a Railane revisa antes de gravar.

## User Stories

1. Como usuária, quero tocar em "Buscar imagem" ao cadastrar ou editar um lugar, para ver fotos candidatas sem sair do app.
2. Como usuária, quero que a busca use o nome do lugar e a cidade já digitados, para não digitar de novo.
3. Como usuária, quero escolher uma entre até 6 miniaturas, para pegar a foto que representa o lugar.
4. Como usuária, quero ver a imagem escolhida no campo e poder trocar ou apagar, como já faço com o link colado.
5. Como usuária, quero um aviso claro quando não houver resultado ou a Wikipedia falhar, sem travar o formulário.
6. Como usuária, quero que o botão fique desativado sem nome do lugar, porque não há o que buscar.
7. Como usuária, quero que a skill do Claude proponha uma imagem em novos rascunhos e preencha os itens antigos sem imagem, para não fazer isso à mão.

## Implementation Decisions

- **`src/links/image-search.ts`**, puro e com `fetch` injetável:
  - `buildImageSearchUrl(label, city)` monta `https://pt.wikipedia.org/w/api.php` com `action=query`, `generator=search`, `gsrsearch=<label city>`, `gsrlimit=6`, `prop=pageimages`, `piprop=thumbnail`, `pithumbsize=800`, `format=json` e `origin=*` (CORS anônimo, sem credenciais).
  - `parseImageSearch(json)` devolve `{ title, url }[]`. Só aceita URLs `https://upload.wikimedia.org/...`, ordenadas pelo `index` da busca.
  - `searchImages(label, city, fetchFn, signal)` aplica timeout de 8 s e cancela a busca anterior.
- **UI no formulário (`admin-ui.ts`):** o botão "Buscar imagem" fica ao lado do campo Imagem, e a grade de miniaturas usa `<button>` com `<img alt="título">`. O texto entra por `textContent` e o `src` só recebe URLs validadas.
- **CSP:** `connect-src` ganha **só `https://pt.wikipedia.org`**. O `img-src https:` já cobre `upload.wikimedia.org`. A revisão de segurança está abaixo.
- **Skill:** atualizar `.claude/skills/bucket-list/SKILL.md` com a regra da imagem.

### Revisão de segurança da mudança de CSP
- **Escopo:** um host exato (`pt.wikipedia.org`), só GET, sem cookies nem credenciais (`credentials: "omit"`), sem token.
- **Dados enviados:** o nome do lugar e a cidade. Não vai nenhum dado pessoal de terceiros. A Wikimedia recebe o IP do editor e o texto buscado, só no clique.
- **Resposta:** só JSON lido como dado. Nada vira HTML, e as URLs passam por validação (host `upload.wikimedia.org`, https) antes de ir para `src` ou para o banco.
- **Pior caso:** se a Wikipedia devolver lixo, o editor vê miniaturas erradas e não escolhe. Não há execução de script porque `script-src 'self'` continua igual.

### LGPD
- Há um terceiro novo, a Wikimedia Foundation (EUA), acionado só por clique do editor autenticado. A política ganha a menção em §4 (operadores e compartilhamento) e §5 (transferência internacional).
- Não há coluna nova: `image_url` já existe.

### Licença das imagens
- As imagens do Wikimedia são livres (CC BY-SA e similares). O uso é privado (2 editoras), sem republicação. O crédito na tela fica fora desta fase.

## Testing Decisions

- **Unidade:**
  - `buildImageSearchUrl` com acentos e cidade vazia;
  - `parseImageSearch` com resposta sem `query`, páginas sem thumbnail, host diferente de `upload.wikimedia.org` (rejeitado) e ordem;
  - `searchImages` com timeout, abort e erro de rede.
- **UI (jsdom):**
  - botão desativado sem nome;
  - clique mostra miniaturas com `fetch` falso;
  - escolher preenche o campo;
  - erro mostra aviso;
  - sem resultado mostra "Nenhuma imagem encontrada".
- **E2E:** formulário de novo item, buscar imagem (rota da Wikipedia interceptada com fixture), escolher e salvar. O card mostra a imagem.
- **CSP:** o teste ou lint de CSP do CI aceita o novo host, e nenhum outro.

## Out of Scope

- `og:image` no app, porque exigiria proxy ou Edge Function.
- Busca automática sem clique.
- Crédito ou licença na tela.
- Wikipedia em outros idiomas.
- Upload de imagem.
