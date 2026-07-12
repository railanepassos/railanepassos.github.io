# Design: Cola fácil / salvar mais rápido (quick-add)

**Date:** 2026-07-12
**Status:** Approved (Fase 1 + Fase 2)
**Surface:** `/p/a8f3k2/` admin autenticado

## Problem

Salvar uma experiência hoje exige: abrir o form, colar a URL manualmente
(long-press no celular), digitar um Nome obrigatório, e só então salvar.
O pedido é reduzir essa fricção — colar mais fácil, e no Android poder
compartilhar um link direto de outro app (Instagram, Maps, navegador) sem
nem abrir o site manualmente.

## Fase 1 — Colar + Nome opcional (todas as plataformas)

### Botão Colar

- Novo botão "Colar" (`.links-admin-button--ghost`, já existe no design
  system) ao lado do campo URL, dentro de uma nova row flex
  (`.links-admin-form__input-row`) que substitui o input solo no wrapper.
- Só renderiza se `navigator.clipboard?.readText` existir (progressive
  enhancement — navegadores antigos simplesmente não veem o botão).
- Clique → `await navigator.clipboard.readText()` → se não vazio, preenche
  `urlField.input.value` com o texto (trim).
- Falha (permissão negada, API bloqueada) → mostra o erro do form já
  existente: "Não foi possível colar automaticamente. Cole manualmente."
  Não bloqueia o resto do fluxo.

### Nome (Nome do lugar ou experiência) vira opcional

- Remove `labelField.input.required = true`.
- Label do campo ganha "(opcional)" no texto.
- Nova função pura `deriveLabelFromUrl(url: string): string` em
  `src/links/validate.ts`, ao lado de `isHttpsUrl`:
  ```ts
  export function deriveLabelFromUrl(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  ```
- Em `toCreateInput` / `toUpdatePatch` (admin-ui.ts): antes de chamar
  `assertFormValues`, computa
  `const label = values.label.trim() || deriveLabelFromUrl(values.url);`
  e usa esse `label` daqui pra frente (payload + validação). Como
  `assertFormValues` já valida a URL https antes do label, uma URL
  inválida continua barrada com a mensagem atual — o fallback só entra
  em jogo quando a URL é válida e o Nome ficou vazio.
- `assertFormValues` mantém o check de label vazio como rede de segurança
  (na prática nunca deve disparar depois do fallback).

## Fase 2 — Share target (Android, PWA instalado)

Não roda no iOS (Safari não implementa Web Share Target — limitação da
plataforma, sem workaround). Degrada graciosamente: quem não instalar o
PWA continua usando o form normal.

### Manifest

- Novo arquivo `p/a8f3k2/manifest.webmanifest`, referenciado só nessa
  página (`<link rel="manifest">` no `<head>` de `p/a8f3k2/index.html`) —
  o resto do site continua não-instalável.
- Ícone novo `assets/icons/app-icon.svg` (não existe nenhum ícone quadrado
  no repo hoje) — SVG simples, `"sizes": "any"`, evita depender de
  ferramenta de conversão de imagem pra gerar PNGs em múltiplas
  resoluções.
- Conteúdo:
  ```json
  {
    "name": "Experience Bucket List",
    "short_name": "Bucket List",
    "start_url": "/p/a8f3k2/",
    "scope": "/p/a8f3k2/",
    "display": "standalone",
    "background_color": "#f8fafb",
    "theme_color": "#1a365d",
    "icons": [
      { "src": "/assets/icons/app-icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
    ],
    "share_target": {
      "action": "/p/a8f3k2/",
      "method": "GET",
      "params": { "title": "title", "text": "text", "url": "url" }
    }
  }
  ```
- Sem service worker: `method: "GET"` de texto/URL não precisa dele (só
  entraria em jogo pra compartilhar arquivos).

### Deep-link handling (`main.ts`)

- Nova função pura `pickSharedUrl(params: URLSearchParams): string | null`
  (arquivo pequeno, ex. `src/links/share-target.ts`, testável isolado):
  1. Se `params.get("url")` for uma https URL válida, usa ela.
  2. Senão, procura a primeira `https://…` dentro de `text`, depois de
     `title`, via regex.
  3. Sem nada encontrado → `null` (não dispara auto-open).
- `bootDynamic` guarda `let pendingSharedUrl = pickSharedUrl(new URLSearchParams(location.search));`
  na inicialização.
- Sempre que `authenticated` vira `true` (no paint inicial e no
  `auth.onAuthStateChange`) e `pendingSharedUrl` não é `null`:
  - Abre `formModal.openCreate({ url: pendingSharedUrl })` — `openCreate`
    ganha um parâmetro opcional de prefill.
  - Zera `pendingSharedUrl` e limpa a query string
    (`history.replaceState(null, "", location.pathname)`) pra não reabrir
    num refresh.
- Se `pendingSharedUrl` existe e o usuário ainda **não** está autenticado,
  abre o modal de login proativamente (em vez de deixar o guest gate
  parado) — assim que logar, cai direto no fluxo acima.

## Testes

- `deriveLabelFromUrl`: casos com host simples, `www.`, URL inválida.
- `pickSharedUrl`: `url` direto, URL embutida em `text`, embutida em
  `title`, nenhum dos três com URL válida.
- Botão Colar: mock de `navigator.clipboard.readText` (sucesso e rejeição).
- Share target ponta a ponta (instalar o PWA, compartilhar de outro app
  no Android, confirmar que abre o form preenchido): **não é testável por
  unit test nem via ngrok sozinho** — precisa de verificação manual num
  Android real depois da implementação.

## Out of scope

- iOS share target (impossível na plataforma).
- Buscar título/imagem automaticamente da URL (exigiria backend de
  scraping — não faz parte deste escopo).
- Ícones PNG multi-resolução / maskable com safe-zone.
- Service worker / funcionamento offline do admin.
