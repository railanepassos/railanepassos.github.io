# Links Admin (`/p/a8f3k2/`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página secreta `/p/a8f3k2/` com links dinâmicos (Supabase), CRUD + reorder para editores autenticados, hub principal inalterado, e keepalive 2×/semana para evitar pausa do free tier.

**Architecture:** GitHub Pages serve HTML/CSS/`app.js` (bundle Vite). Browser chama Supabase Auth + Postgres via anon key + RLS. GitHub Actions faz build/test no CI e pinga `/auth/v1/health` segunda e quinta; falha gera job vermelho e e-mail.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright, `@supabase/supabase-js`, Supabase (Auth + Postgres), GitHub Actions

**Spec:** [docs/superpowers/specs/2026-07-11-links-admin-design.md](../specs/2026-07-11-links-admin-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `package.json` | Scripts build/test; deps Onda 2 |
| `vite.config.ts` | Bundle → `p/a8f3k2/app.js` |
| `tsconfig.json` | TS strict |
| `src/links/config.ts` | Lê `import.meta.env` Supabase |
| `src/links/validate.ts` | Valida URL `https://` |
| `src/links/icons.ts` | Resolve preset vs `icon_url` |
| `src/links/reorder.ts` | Recalcula `sort_order` após drag |
| `src/links/links-repo.ts` | CRUD Supabase |
| `src/links/auth.ts` | Login/logout/session |
| `src/links/render.ts` | DOM público (cards) |
| `src/links/admin-ui.ts` | Form, drag, modais |
| `src/links/main.ts` | Bootstrap |
| `supabase/migrations/001_links.sql` | Schema + RLS + seed |
| `p/a8f3k2/index.html` | Shell, CSP, mount points |
| `p/a8f3k2/app.js` | Artefato build (commitado) |
| `.github/workflows/supabase-keepalive.yml` | Ping 2×/semana |
| `.github/workflows/ci.yml` | + job build |
| `tests/unit/*.test.ts` | Vitest |
| `tests/e2e/links-page.spec.ts` | Playwright |
| `privacy-policy.html` | LGPD Supabase + localStorage |

---

## Pré-requisitos manuais (Railane)

Antes da Task 2, no [Supabase Dashboard](https://supabase.com/dashboard):

1. Criar projeto (free tier)
2. **Authentication → Providers → Email:** habilitar; **desabilitar** “Enable email signups”
3. **Authentication → Users → Add user:** criar sua conta editor
4. Copiar **Project URL** e **anon public key** (Settings → API)
5. GitHub repo → **Settings → Secrets → Actions:**
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. GitHub → **Settings → Notifications → Actions:** marcar falhas de workflow (e-mail)

---

### Task 1: Branch e issue

**Files:**
- Create: issue no GitHub (template feature)

- [ ] **Step 1:** Abrir issue `feat: admin de links em /p/a8f3k2/ com Supabase`
- [ ] **Step 2:** Criar branch `feat/links-admin-supabase`
- [ ] **Step 3:** Commit vazio ou doc-only não necessário ainda

```bash
git checkout -b feat/links-admin-supabase
```

---

### Task 2: Workflow keepalive Supabase (2×/semana)

**Files:**
- Create: `.github/workflows/supabase-keepalive.yml`

- [ ] **Step 1:** Criar workflow

```yaml
name: Supabase keepalive

on:
  schedule:
    # Segunda e quinta, 12:00 UTC (~09:00 BRT). Máx ~3,5 dias entre pings.
    - cron: "0 12 * * 1,4"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: supabase-keepalive
  cancel-in-progress: false

jobs:
  ping:
    name: Ping Supabase health
    runs-on: ubuntu-latest
    steps:
      - name: Verify secrets
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: |
          set -euo pipefail
          if [ -z "${SUPABASE_URL}" ] || [ -z "${SUPABASE_ANON_KEY}" ]; then
            echo "::error::Missing SUPABASE_URL or SUPABASE_ANON_KEY repository secret."
            exit 1
          fi

      - name: GET /auth/v1/health
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: |
          set -euo pipefail
          http_code=$(curl -sS -o /tmp/supabase-health.json -w "%{http_code}" \
            "${SUPABASE_URL}/auth/v1/health" \
            -H "apikey: ${SUPABASE_ANON_KEY}" \
            -H "Authorization: Bearer ${SUPABASE_ANON_KEY}")
          if [ "${http_code}" -lt 200 ] || [ "${http_code}" -ge 300 ]; then
            echo "::error::Supabase health check failed (HTTP ${http_code})"
            cat /tmp/supabase-health.json || true
            exit 1
          fi
          echo "Supabase is awake (HTTP ${http_code})"
```

- [ ] **Step 2:** Push branch; em GitHub → Actions → **Supabase keepalive** → **Run workflow** (`workflow_dispatch`)
- [ ] **Step 3:** Verificar job verde
- [ ] **Step 4:** Commit

```bash
git add .github/workflows/supabase-keepalive.yml
git commit -m "ci(supabase): add twice-weekly keepalive ping"
```

**Nota e-mail:** GitHub envia e-mail automaticamente quando o job falha (`exit 1`), se notificações de Actions estiverem ativas na conta.

---

### Task 3: Toolchain Onda 2 (`package.json`, Vite, Vitest)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore` (node_modules, coverage)
- Modify: `.gitignore` se existir

- [ ] **Step 1:** Criar `package.json`

```json
{
  "name": "railanepassos-site",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "vite build",
    "test:unit": "vitest run --coverage",
    "test:e2e": "playwright test",
    "lint": "echo \"use CI stylelint/html-validate\""
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.51.0",
    "@vitest/coverage-v8": "^3.0.9",
    "typescript": "^5.8.2",
    "vite": "^6.2.2",
    "vitest": "^3.0.9"
  }
}
```

- [ ] **Step 2:** Criar `vite.config.ts`

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "p/a8f3k2",
    emptyOutDir: false,
    rollupOptions: {
      input: "src/links/main.ts",
      output: {
        entryFileNames: "app.js",
        format: "iife",
        name: "LinksApp",
      },
    },
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL ?? ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? ""),
  },
});
```

- [ ] **Step 3:** Criar `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4:** `npm install`
- [ ] **Step 5:** Commit

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json .gitignore
git commit -m "chore(onda2): add vite vitest playwright toolchain"
```

---

### Task 4: Migration Supabase

**Files:**
- Create: `supabase/migrations/001_links.sql`

- [ ] **Step 1:** Escrever migration

```sql
-- Tabela de links externos
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url ~ '^https://'),
  label text not null check (char_length(label) between 1 and 200),
  description text check (description is null or char_length(description) <= 500),
  icon_preset text check (icon_preset is null or icon_preset in (
    'instagram', 'github', 'linkedin', 'youtube', 'external-link', 'arrow-left'
  )),
  icon_url text check (icon_url is null or icon_url ~ '^https://'),
  sort_order integer not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists links_sort_order_unique on public.links (sort_order);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists links_updated_at on public.links;
create trigger links_updated_at
  before update on public.links
  for each row execute function public.set_updated_at();

alter table public.links enable row level security;

drop policy if exists "links_select_public" on public.links;
create policy "links_select_public"
  on public.links for select
  to anon, authenticated
  using (true);

drop policy if exists "links_insert_auth" on public.links;
create policy "links_insert_auth"
  on public.links for insert
  to authenticated
  with check (true);

drop policy if exists "links_update_auth" on public.links;
create policy "links_update_auth"
  on public.links for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "links_delete_auth" on public.links;
create policy "links_delete_auth"
  on public.links for delete
  to authenticated
  using (true);

-- Seed (link existente)
insert into public.links (url, label, description, icon_preset, sort_order)
values (
  'https://www.instagram.com/museudomar.aleixobelov/',
  'Museu do Mar',
  'Aleixobelov, AL',
  'instagram',
  0
)
on conflict do nothing;
```

- [ ] **Step 2:** Colar no Supabase → SQL Editor → Run
- [ ] **Step 3:** Commit arquivo migration

```bash
git add supabase/migrations/001_links.sql
git commit -m "feat(links): add supabase schema rls and seed"
```

---

### Task 5: `validate.ts` + testes (TDD)

**Files:**
- Create: `src/links/validate.ts`, `tests/unit/validate.test.ts`

- [ ] **Step 1:** Teste vermelho

```typescript
import { describe, expect, it } from "vitest";
import { isHttpsUrl } from "../../src/links/validate";

describe("isHttpsUrl", () => {
  it("accepts https URLs", () => {
    expect(isHttpsUrl("https://example.com")).toBe(true);
  });

  it("rejects http and garbage", () => {
    expect(isHttpsUrl("http://example.com")).toBe(false);
    expect(isHttpsUrl("not-a-url")).toBe(false);
    expect(isHttpsUrl("")).toBe(false);
  });
});
```

- [ ] **Step 2:** `npm run test:unit` → FAIL
- [ ] **Step 3:** Implementar

```typescript
export function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}
```

- [ ] **Step 4:** `npm run test:unit` → PASS
- [ ] **Step 5:** Commit

```bash
git add src/links/validate.ts tests/unit/validate.test.ts
git commit -m "test(links): add https url validation"
```

---

### Task 6: `icons.ts` + testes

**Files:**
- Create: `src/links/icons.ts`, `tests/unit/icons.test.ts`

- [ ] **Step 1:** Teste

```typescript
import { describe, expect, it } from "vitest";
import { resolveIconSrc } from "../../src/links/icons";

describe("resolveIconSrc", () => {
  it("prefers icon_url over preset", () => {
    expect(
      resolveIconSrc({ icon_url: "https://cdn.example.com/i.svg", icon_preset: "github" })
    ).toBe("https://cdn.example.com/i.svg");
  });

  it("uses preset path when no icon_url", () => {
    expect(resolveIconSrc({ icon_preset: "instagram" })).toBe("/assets/icons/instagram.svg");
  });

  it("falls back to external-link", () => {
    expect(resolveIconSrc({})).toBe("/assets/icons/external-link.svg");
  });
});
```

- [ ] **Step 2:** Implementar

```typescript
const PRESETS = new Set([
  "instagram",
  "github",
  "linkedin",
  "youtube",
  "external-link",
  "arrow-left",
]);

type IconFields = { icon_url?: string | null; icon_preset?: string | null };

export function resolveIconSrc(fields: IconFields): string {
  if (fields.icon_url) return fields.icon_url;
  const preset = fields.icon_preset ?? "external-link";
  const name = PRESETS.has(preset) ? preset : "external-link";
  return `/assets/icons/${name}.svg`;
}

export const ICON_PRESET_OPTIONS = [...PRESETS];
```

- [ ] **Step 3:** Testes verdes; commit

```bash
git add src/links/icons.ts tests/unit/icons.test.ts
git commit -m "feat(links): resolve icon preset or custom url"
```

---

### Task 7: `reorder.ts` + testes

**Files:**
- Create: `src/links/reorder.ts`, `tests/unit/reorder.test.ts`

- [ ] **Step 1:** Teste

```typescript
import { describe, expect, it } from "vitest";
import { applyReorder } from "../../src/links/reorder";

describe("applyReorder", () => {
  it("moves item and reindexes sort_order", () => {
    const items = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ];
    const result = applyReorder(items, "c", 0);
    expect(result.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(result.map((r) => r.sort_order)).toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 2:** Implementar `applyReorder` (splice + map index)
- [ ] **Step 3:** Testes verdes; commit

---

### Task 8: `config.ts`, `links-repo.ts`, `auth.ts`

**Files:**
- Create: `src/links/config.ts`, `src/links/links-repo.ts`, `src/links/auth.ts`

- [ ] **Step 1:** `config.ts` — lê env injetado pelo Vite
- [ ] **Step 2:** `auth.ts` — `signInWithPassword`, `signOut`, `getSession`, `onAuthStateChange`
- [ ] **Step 3:** `links-repo.ts` — `listLinks`, `createLink`, `updateLink`, `deleteLink`, `saveOrder` (batch update `sort_order`)
- [ ] **Step 4:** Testes unitários com Supabase mockado (injetar client fake) para `saveOrder` e validação de payload
- [ ] **Step 5:** Commit

---

### Task 9: `render.ts` + `admin-ui.ts` + `main.ts`

**Files:**
- Create: `src/links/render.ts`, `src/links/admin-ui.ts`, `src/links/main.ts`
- Modify: `p/a8f3k2/index.html`

- [ ] **Step 1:** Atualizar `index.html`:
  - CSP com `script-src 'self'` e `connect-src 'self' https://*.supabase.co`
  - Remover link hardcoded do `<nav>`; adicionar `<div id="links-admin-root">` e `<nav id="links-list" class="sub-list">`
  - `<script src="app.js" defer></script>`
  - **Não** alterar `index.html` raiz

- [ ] **Step 2:** `render.ts` — monta `.link-card` igual CSS atual
- [ ] **Step 3:** `admin-ui.ts` — login modal, toolbar, form, drag HTML5, botões ↑↓
- [ ] **Step 4:** `main.ts` — boot: load links, wire auth, render states
- [ ] **Step 5:** Build local

```bash
VITE_SUPABASE_URL="https://YOUR.ref.supabase.co" \
VITE_SUPABASE_ANON_KEY="your-anon-key" \
npm run build
```

- [ ] **Step 6:** Commit `index.html` + `app.js` + `src/links/*`

```bash
git add p/a8f3k2/index.html p/a8f3k2/app.js src/links/
git commit -m "feat(links): dynamic admin page with supabase crud"
```

---

### Task 10: CI — build job + secrets

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1:** Adicionar job `build-links` antes de `lint-html` (ou integrado):

```yaml
  build-links:
    name: Build links bundle
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - name: Build app.js
        env:
          VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: npm run build
      - name: Verify app.js exists
        run: test -f p/a8f3k2/app.js
```

- [ ] **Step 2:** Garantir `lint-html` ainda valida `p/a8f3k2/index.html` com `script` tag
- [ ] **Step 3:** Push; CI verde
- [ ] **Step 4:** Commit

```bash
git add .github/workflows/ci.yml
git commit -m "ci(links): build bundle in pipeline"
```

---

### Task 11: Playwright e2e smoke

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/links-page.spec.ts`

- [ ] **Step 1:** Config servir site em `http://127.0.0.1:8080`
- [ ] **Step 2:** Teste: página carrega, `#links-list` existe, botão "Entrar" visível, meta CSP presente
- [ ] **Step 3:** `npm run test:e2e` local
- [ ] **Step 4:** Commit

```bash
git add playwright.config.ts tests/e2e/links-page.spec.ts
git commit -m "test(e2e): smoke links admin page shell"
```

---

### Task 12: LGPD — `privacy-policy.html`

**Files:**
- Modify: `privacy-policy.html`

- [ ] **Step 1:** Adicionar Supabase como operador (§4–§5)
- [ ] **Step 2:** Descrever login de editores e `localStorage` de sessão (§3, §6)
- [ ] **Step 3:** Bump "Última atualização"
- [ ] **Step 4:** Commit

```bash
git add privacy-policy.html
git commit -m "docs(lgpd): document supabase auth for links editors"
```

**PR:** label `lgpd-reviewed` ou `LGPD-OK` no corpo.

---

### Task 13: Estilos admin (se necessário)

**Files:**
- Modify: `styles.css`

- [ ] **Step 1:** Classes mínimas: `.links-admin-toolbar`, `.links-admin-modal`, `.link-card__drag-handle`, `.link-card__actions`
- [ ] **Step 2:** `npx stylelint` + Pa11y
- [ ] **Step 3:** Commit

---

### Task 14: Verificação final

- [ ] **Step 1:** `npm run test:unit` — verde
- [ ] **Step 2:** `npm run test:e2e` — verde
- [ ] **Step 3:** Confirmar `index.html` **não** linka `/p/a8f3k2/`
- [ ] **Step 4:** Login manual em produção; CRUD + drag
- [ ] **Step 5:** Actions → keepalive manual → verde
- [ ] **Step 6:** Abrir PR `feat/links-admin-supabase` com template + checklist LGPD

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| RF-01–08 CRUD + página oculta | 8–9, 14 |
| RNF-01 GitHub Pages | 9–10 |
| RNF-02 CSP | 9 |
| RNF-03 TDD | 5–8, 11 |
| RNF-04 LGPD | 12 |
| RNF-05 noindex / sem link hub | 9, 14 |
| RNF-06 a11y reorder | 9, 13 |
| RNF-07 keepalive 2×/semana | 2 |
| Seed Museu do Mar | 4 |
| Multi-editor invite-only | Pré-requisitos + 4 (RLS) |

---

## Ordem sugerida de merge

1. Task 2 (keepalive) — pode ir cedo, assim que secrets existirem
2. Tasks 3–14 — feature completa em um PR ou dois (keepalive separado + feature)
