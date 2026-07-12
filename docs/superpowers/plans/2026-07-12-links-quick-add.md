# Links Quick-Add (Colar + Nome opcional + Share Target) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin reduce friction when saving a new experience — paste
the URL with one tap, save without typing a Nome, and (on Android) share a
link straight from another app into a pre-filled create form.

**Architecture:** Two independently testable phases, both client-side, no
DB schema changes. Fase 1 touches only `src/links/admin-ui.ts` +
`src/links/validate.ts` (the create/edit form). Fase 2 adds a PWA manifest
scoped to `/p/a8f3k2/` plus deep-link handling in `src/links/main.ts`,
backed by a new pure module `src/links/share-target.ts`.

**Tech Stack:** TypeScript, Vite (`vite build` bundles `src/links/main.ts`
→ `p/a8f3k2/app.js`), Vitest (`node` environment by default, `jsdom` via
`/** @vitest-environment jsdom */` for DOM tests), Supabase JS client.

**Spec:** `docs/superpowers/specs/2026-07-12-links-quick-add-design.md`

## Global Constraints

- No new Supabase migration / DB columns — everything here is client-side.
- `/p/a8f3k2/index.html` CSP stays exactly as-is: `default-src 'self'; style-src 'self'; img-src 'self' https: data:; font-src 'self'; connect-src 'self' https://*.supabase.co; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; script-src 'self'; upgrade-insecure-requests`. Do not loosen it for the manifest — same-origin manifest/icon requests are already covered by `default-src 'self'`.
- No service worker — Fase 2 uses `share_target.method: "GET"` for text/URL only, which needs none.
- The PWA manifest is scoped to `/p/a8f3k2/` only (`start_url`, `scope`, and the `<link rel="manifest">` all live there) — the rest of the portfolio site must stay non-installable.
- iOS Safari does not implement Web Share Target — Fase 2 must degrade silently there (no console errors, no broken UI), never block Fase 1 functionality.
- `npx tsc --noEmit -p tsconfig.json` and `npx vitest run` must stay green after every task, except the pre-existing unrelated error `src/links/deck-ui.ts(345,51): error TS18048` (not part of this work — do not fix it as a side effect).
- Run `npx vite build` after the last code task so `p/a8f3k2/app.js` reflects the changes (this is a checked-in build artifact, not gitignored).

---

### Task 1: `deriveLabelFromUrl` pure helper

**Files:**
- Modify: `src/links/validate.ts`
- Test: `tests/unit/validate.test.ts`

**Interfaces:**
- Produces: `export function deriveLabelFromUrl(url: string): string` — returns the URL's hostname with a leading `www.` stripped, or `""` if the URL can't be parsed. Task 2 imports this.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/validate.test.ts`:

```ts
import { deriveLabelFromUrl, isHttpsUrl } from "../../src/links/validate";

describe("deriveLabelFromUrl", () => {
  it("strips a leading www. from the hostname", () => {
    expect(deriveLabelFromUrl("https://www.example.com/path?x=1")).toBe("example.com");
  });

  it("returns the hostname as-is when there is no www.", () => {
    expect(deriveLabelFromUrl("https://instagram.com/p/xyz")).toBe("instagram.com");
  });

  it("returns an empty string for an unparsable url", () => {
    expect(deriveLabelFromUrl("not-a-url")).toBe("");
  });
});
```

(Update the existing top import line — it currently only imports `isHttpsUrl` — to import both names from `"../../src/links/validate"`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: FAIL — `deriveLabelFromUrl is not a function` (or similar import error).

- [ ] **Step 3: Implement `deriveLabelFromUrl`**

Append to `src/links/validate.ts`:

```ts
export function deriveLabelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: PASS (5 tests: the 2 existing `isHttpsUrl` ones + the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/links/validate.ts tests/unit/validate.test.ts
git commit -m "feat(links): add deriveLabelFromUrl helper for quick-add fallback"
```

---

### Task 2: Nome opcional with URL-hostname fallback

**Files:**
- Modify: `src/links/admin-ui.ts:1129-1131` (labelField), `src/links/admin-ui.ts:1738-1777` (`toCreateInput`, `toUpdatePatch`, `assertFormValues`)
- Test: `tests/unit/admin-ui.test.ts`

**Interfaces:**
- Consumes: `deriveLabelFromUrl(url: string): string` from Task 1 (`src/links/validate.ts`).
- Produces: `toCreateInput`/`toUpdatePatch` keep their existing exported signatures (`(values: LinkFormValues, sortOrder: number) => CreateLinkInput` / `(values: LinkFormValues) => UpdateLinkPatch`); behavior changes only — blank `label` now resolves to the URL hostname instead of throwing.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/admin-ui.test.ts` (add `toCreateInput, toUpdatePatch` to the existing import from `"../../src/links/admin-ui"`, and add a `LinkFormValues` import from the same module):

```ts
import {
  createScheduleSheet,
  createViewModal,
  renderAdminCard,
  toCreateInput,
  toUpdatePatch,
  type LinkFormValues,
} from "../../src/links/admin-ui";

function formValues(partial: Partial<LinkFormValues> = {}): LinkFormValues {
  return {
    url: "https://www.example.com/path",
    label: "",
    description: "",
    image_url: "",
    note: "",
    ...partial,
  };
}

describe("toCreateInput label fallback", () => {
  it("falls back to the URL hostname when label is blank", () => {
    const input = toCreateInput(formValues(), 0);
    expect(input.label).toBe("example.com");
  });

  it("keeps the provided label when present", () => {
    const input = toCreateInput(formValues({ label: "Museu" }), 0);
    expect(input.label).toBe("Museu");
  });

  it("still rejects an invalid URL even though label can fall back", () => {
    expect(() => toCreateInput(formValues({ url: "not-a-url" }), 0)).toThrow(
      /URL https/
    );
  });
});

describe("toUpdatePatch label fallback", () => {
  it("falls back to the URL hostname when label is blank", () => {
    const patch = toUpdatePatch(formValues());
    expect(patch.label).toBe("example.com");
  });
});

describe("createLinkFormModal Nome field", () => {
  it("is not required", async () => {
    const { createLinkFormModal } = await import("../../src/links/admin-ui");
    const modal = createLinkFormModal(() => undefined);
    document.body.appendChild(modal.element);
    modal.openCreate();
    const labelInput = modal.element.querySelector(
      "#links-form-label"
    ) as HTMLInputElement;
    expect(labelInput.required).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/admin-ui.test.ts`
Expected: FAIL — the fallback tests get `""` (or a thrown "O título é obrigatório." error) instead of `"example.com"`; the "is not required" test fails because `labelField.input.required` is still `true`.

- [ ] **Step 3: Remove the `required` flag and update the label copy**

In `src/links/admin-ui.ts`, replace:

```ts
  const labelField = labelledInput("links-form-label", "Nome do lugar ou experiência", "text");
  labelField.input.required = true;
  labelField.input.maxLength = 200;
```

with:

```ts
  const labelField = labelledInput("links-form-label", "Nome do lugar ou experiência (opcional)", "text");
  labelField.input.maxLength = 200;
```

- [ ] **Step 4: Apply the fallback in `toCreateInput` / `toUpdatePatch`**

Replace the block from `export function toCreateInput` through the end of
`assertFormValues` (currently `src/links/admin-ui.ts:1738-1777`) with:

```ts
export function toCreateInput(values: LinkFormValues, sortOrder: number): CreateLinkInput {
  const resolved = withResolvedLabel(values);
  assertFormValues(resolved);
  return {
    url: resolved.url,
    label: resolved.label,
    description: resolved.description.length > 0 ? resolved.description : null,
    icon_preset: inferIconPreset(resolved.url),
    icon_url: null,
    category: inferCategory(resolved),
    sort_order: sortOrder,
    image_url: resolved.image_url.length > 0 ? resolved.image_url : null,
    note: resolved.note.length > 0 ? resolved.note : null,
  };
}

export function toUpdatePatch(values: LinkFormValues): UpdateLinkPatch {
  const resolved = withResolvedLabel(values);
  assertFormValues(resolved);
  return {
    url: resolved.url,
    label: resolved.label,
    description: resolved.description.length > 0 ? resolved.description : null,
    icon_preset: inferIconPreset(resolved.url),
    icon_url: null,
    category: inferCategory(resolved),
    image_url: resolved.image_url.length > 0 ? resolved.image_url : null,
    note: resolved.note.length > 0 ? resolved.note : null,
  };
}

/** Blank Nome falls back to the URL's hostname so quick-add can skip typing one. */
function withResolvedLabel(values: LinkFormValues): LinkFormValues {
  const label = values.label.trim();
  if (label.length > 0) return { ...values, label };
  return { ...values, label: deriveLabelFromUrl(values.url) };
}

function assertFormValues(values: LinkFormValues): void {
  if (!isHttpsUrl(values.url)) {
    throw new Error("Informe uma URL https válida.");
  }
  if (values.label.length < 1) {
    throw new Error("O título é obrigatório.");
  }
  if (values.image_url.length > 0 && !isHttpsUrl(values.image_url)) {
    throw new Error("A foto precisa ser uma URL https válida.");
  }
}
```

(The `values.label.length < 1` check in `assertFormValues` is now unreachable
in practice — `withResolvedLabel` only produces an empty label when the URL
itself doesn't parse, and `isHttpsUrl` will already have thrown by then. It
stays as a defensive guard.)

- [ ] **Step 5: Import `deriveLabelFromUrl`**

In `src/links/admin-ui.ts`, update the existing import line:

```ts
import { isHttpsUrl } from "./validate";
```

to:

```ts
import { deriveLabelFromUrl, isHttpsUrl } from "./validate";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/admin-ui.test.ts`
Expected: PASS (all new tests green, existing `createScheduleSheet` /
`createViewModal` / `renderAdminCard` tests still passing).

- [ ] **Step 7: Typecheck and full suite**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: only the pre-existing `deck-ui.ts(345,51)` error.

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/links/admin-ui.ts tests/unit/admin-ui.test.ts
git commit -m "feat(links): make Nome optional, fall back to URL hostname"
```

---

### Task 3: "Colar" button on the URL field

**Files:**
- Modify: `src/links/admin-ui.ts` (add `attachPasteButton` helper near `attachCharCounter`, wire it into `createLinkFormModal`)
- Modify: `styles.css` (new `.links-admin-form__input-row` / `.links-admin-form__paste-btn` rules)
- Test: `tests/unit/admin-ui.test.ts`

**Interfaces:**
- Consumes: `LabelledInput` type (`{ wrapper: HTMLElement; input: HTMLInputElement }`), already defined in `admin-ui.ts`.
- Produces: `function attachPasteButton(field: LabelledInput, setError: (message: string | null) => void): void` — internal helper (not exported), used only inside `createLinkFormModal`. Renders a button with `data-action="paste-url"` only when `navigator.clipboard?.readText` exists.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/admin-ui.test.ts` (needs the `beforeEach`/`vi` already imported at the top of the file):

```ts
describe("createLinkFormModal paste button", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
  });

  it("fills the URL field from the clipboard on click", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue("https://pasted.example.com/x") },
      configurable: true,
    });

    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openCreate();

    const pasteBtn = modal.element.querySelector(
      '[data-action="paste-url"]'
    ) as HTMLButtonElement;
    expect(pasteBtn).toBeTruthy();
    pasteBtn.click();

    await vi.waitFor(() => {
      const urlInput = modal.element.querySelector(
        "#links-form-url"
      ) as HTMLInputElement;
      expect(urlInput.value).toBe("https://pasted.example.com/x");
    });
  });

  it("shows an error banner when the clipboard read is rejected", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openCreate();

    (
      modal.element.querySelector(
        '[data-action="paste-url"]'
      ) as HTMLButtonElement
    ).click();

    await vi.waitFor(() => {
      expect(modal.element.textContent).toContain(
        "Não foi possível colar automaticamente."
      );
    });
  });

  it("does not render the button when the Clipboard API is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openCreate();

    expect(
      modal.element.querySelector('[data-action="paste-url"]')
    ).toBeNull();
  });
});
```

Add `afterEach` to the existing `import { beforeEach, describe, expect, it, vi } from "vitest";` line at the top of the file (becomes `import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";`), and add `createLinkFormModal` to the existing named import from `"../../src/links/admin-ui"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/admin-ui.test.ts`
Expected: FAIL — no element matches `[data-action="paste-url"]` yet.

- [ ] **Step 3: Add the `attachPasteButton` helper**

In `src/links/admin-ui.ts`, right after the `attachCharCounter` function
(ends with `return update; }` around where `iconButton` starts), insert:

```ts
/**
 * Adds a "Colar" button beside a URL field that fills it from the
 * clipboard. Renders nothing if the Clipboard read API isn't available
 * (progressive enhancement — the field still works via normal paste).
 */
function attachPasteButton(
  field: LabelledInput,
  setError: (message: string | null) => void
): void {
  const clipboard = navigator.clipboard as
    | { readText?: () => Promise<string> }
    | undefined;
  if (!clipboard?.readText) return;

  const row = document.createElement("div");
  row.className = "links-admin-form__input-row";
  field.input.replaceWith(row);
  row.append(field.input);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "links-admin-button links-admin-button--ghost links-admin-form__paste-btn";
  btn.textContent = "Colar";
  btn.setAttribute("data-action", "paste-url");
  row.append(btn);

  btn.addEventListener("click", () => {
    void (async () => {
      try {
        const text = await clipboard.readText!();
        const trimmed = text.trim();
        if (trimmed.length > 0) {
          field.input.value = trimmed;
          setError(null);
        }
      } catch {
        setError("Não foi possível colar automaticamente. Cole manualmente.");
      }
    })();
  });
}
```

- [ ] **Step 4: Wire it into `createLinkFormModal`**

In `src/links/admin-ui.ts`, right after the existing block:

```ts
  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;
```

add:

```ts

  attachPasteButton(urlField, (message) => {
    if (message) {
      error.textContent = message;
      error.hidden = false;
    } else {
      clearError();
    }
  });
```

(`clearError` is a hoisted function declaration defined later in the same
`createLinkFormModal` body, so referencing it from this closure — which
only runs on a later click, after the whole function has finished setting
up — is safe.)

- [ ] **Step 5: Add the CSS**

In `styles.css`, right after the `.links-admin-form__counter` rule (ends
`line-height: 1; }` just before `.links-admin-form__email-row`), insert:

```css
.links-admin-form__input-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.links-admin-form__input-row .links-admin-form__control {
  flex: 1 1 auto;
  min-width: 0;
}

.links-admin-form__paste-btn {
  flex: 0 0 auto;
  padding: 0 16px;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/admin-ui.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck and full suite**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: only the pre-existing `deck-ui.ts(345,51)` error.

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/links/admin-ui.ts styles.css tests/unit/admin-ui.test.ts
git commit -m "feat(links): add Colar button to paste the URL from clipboard"
```

---

### Task 4: `pickSharedUrl` pure helper

**Files:**
- Create: `src/links/share-target.ts`
- Test: `tests/unit/share-target.test.ts`

**Interfaces:**
- Consumes: `isHttpsUrl(value: string): boolean` from `src/links/validate.ts`.
- Produces: `export function pickSharedUrl(params: URLSearchParams): string | null`. Task 6 imports this from `"./share-target"`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/share-target.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickSharedUrl } from "../../src/links/share-target";

describe("pickSharedUrl", () => {
  it("uses the url param directly when it's a valid https URL", () => {
    const params = new URLSearchParams({ url: "https://example.com/post" });
    expect(pickSharedUrl(params)).toBe("https://example.com/post");
  });

  it("extracts a URL embedded in text when url is absent", () => {
    const params = new URLSearchParams({
      text: "Olha isso: https://instagram.com/p/abc123 incrível!",
    });
    expect(pickSharedUrl(params)).toBe("https://instagram.com/p/abc123");
  });

  it("falls back to title when text has no URL", () => {
    const params = new URLSearchParams({
      title: "Confira https://maps.example.com/place",
      text: "sem link aqui",
    });
    expect(pickSharedUrl(params)).toBe("https://maps.example.com/place");
  });

  it("returns null when nothing has a usable https URL", () => {
    const params = new URLSearchParams({
      text: "sem nenhum link",
      title: "também sem link",
    });
    expect(pickSharedUrl(params)).toBeNull();
  });

  it("ignores a non-https url param and still checks text", () => {
    const params = new URLSearchParams({
      url: "http://insecure.example.com",
      text: "mas tem https://secure.example.com aqui",
    });
    expect(pickSharedUrl(params)).toBe("https://secure.example.com");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/share-target.test.ts`
Expected: FAIL — `Cannot find module '../../src/links/share-target'`.

- [ ] **Step 3: Implement `pickSharedUrl`**

Create `src/links/share-target.ts`:

```ts
import { isHttpsUrl } from "./validate";

/**
 * Resolves the shared URL from a Web Share Target GET request
 * (`?title=&text=&url=`). Android share sheets often only populate
 * `text` (sometimes with surrounding text), so this falls back to
 * extracting the first https URL found in `text`, then `title`.
 */
export function pickSharedUrl(params: URLSearchParams): string | null {
  const direct = params.get("url");
  if (direct && isHttpsUrl(direct)) return direct;

  const fromText = extractHttpsUrl(params.get("text"));
  if (fromText) return fromText;

  const fromTitle = extractHttpsUrl(params.get("title"));
  if (fromTitle) return fromTitle;

  return null;
}

function extractHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/https:\/\/\S+/);
  if (!match) return null;
  return match[0].replace(/[.,;:!?)\]}]+$/, "");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/share-target.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: only the pre-existing `deck-ui.ts(345,51)` error.

- [ ] **Step 6: Commit**

```bash
git add src/links/share-target.ts tests/unit/share-target.test.ts
git commit -m "feat(links): add pickSharedUrl for Web Share Target params"
```

---

### Task 5: PWA manifest + icon (Android install/share-target eligibility)

**Files:**
- Create: `assets/icons/app-icon.svg`
- Create: `p/a8f3k2/manifest.json`
- Modify: `p/a8f3k2/index.html:11` (add manifest link)
- Test: `tests/unit/manifest.test.ts`

**Interfaces:**
- Produces: a static `p/a8f3k2/manifest.json` whose `share_target.params` (`title`, `text`, `url`) match exactly what Task 4's `pickSharedUrl` and Task 6 read from `location.search`.

Note: the design doc names this file `manifest.webmanifest`. Using
`manifest.json` instead here — `.json` has an unambiguous, universally
recognized MIME type everywhere this site can be hosted (GitHub Pages,
`python -m http.server` locally), whereas `.webmanifest` mime mapping is
less consistently configured across static hosts. Content and behavior are
identical to the spec; only the filename differs.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/manifest.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifestPath = fileURLToPath(
  new URL("../../p/a8f3k2/manifest.json", import.meta.url)
);
const indexHtmlPath = fileURLToPath(
  new URL("../../p/a8f3k2/index.html", import.meta.url)
);

describe("links admin PWA manifest", () => {
  it("declares a GET share_target scoped to the admin page", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.start_url).toBe("/p/a8f3k2/");
    expect(manifest.scope).toBe("/p/a8f3k2/");
    expect(manifest.share_target).toEqual({
      action: "/p/a8f3k2/",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    });
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("is linked from the admin page head", () => {
    const html = readFileSync(indexHtmlPath, "utf8");
    expect(html).toContain(
      '<link rel="manifest" href="/p/a8f3k2/manifest.json">'
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/manifest.test.ts`
Expected: FAIL — `ENOENT` reading `manifest.json` (file doesn't exist yet).

- [ ] **Step 3: Create the icon**

Create `assets/icons/app-icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1a365d"/>
  <text x="256" y="330" font-family="system-ui, -apple-system, sans-serif" font-size="260" font-weight="700" fill="#ffffff" text-anchor="middle">B</text>
</svg>
```

- [ ] **Step 4: Create the manifest**

Create `p/a8f3k2/manifest.json`:

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
    {
      "src": "/assets/icons/app-icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    }
  ],
  "share_target": {
    "action": "/p/a8f3k2/",
    "method": "GET",
    "params": { "title": "title", "text": "text", "url": "url" }
  }
}
```

- [ ] **Step 5: Link the manifest from the admin page**

In `p/a8f3k2/index.html`, replace:

```html
    <link rel="stylesheet" href="/styles.css">
    <title>Experience Bucket List</title>
```

with:

```html
    <link rel="stylesheet" href="/styles.css">
    <link rel="manifest" href="/p/a8f3k2/manifest.json">
    <title>Experience Bucket List</title>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/manifest.test.ts`
Expected: PASS.

- [ ] **Step 7: HTML validation**

`html-validate` isn't a local devDependency — CI installs it on demand
(see `.github/workflows/ci.yml:53`). Match that exact invocation:

Run: `npx -y html-validate@9.4.0 --config .htmlvalidate.json p/a8f3k2/index.html`
Expected: no errors (a `<link rel="manifest">` is valid HTML5, and the
project's `.htmlvalidate.json` already extends `html-validate:recommended`).

- [ ] **Step 8: Commit**

```bash
git add assets/icons/app-icon.svg p/a8f3k2/manifest.json p/a8f3k2/index.html tests/unit/manifest.test.ts
git commit -m "feat(links): add PWA manifest with share_target for Android"
```

---

### Task 6: Deep-link handling in `main.ts`

**Files:**
- Modify: `src/links/admin-ui.ts` (extend `openCreate` with an optional prefill; update `LinkFormHandle` type)
- Modify: `src/links/main.ts:110-121` (state), `src/links/main.ts:504-546` (auth wiring)

**Interfaces:**
- Consumes: `pickSharedUrl(params: URLSearchParams): string | null` from Task 4 (`src/links/share-target.ts`).
- Produces: `LinkFormHandle.openCreate` becomes `(prefill?: { url?: string }) => void` (backward compatible — the sole existing call site `formModal.openCreate()` in `main.ts:445` keeps working unchanged).

No dedicated unit test for this task: `main.ts` is the DOM/auth composition
root and isn't unit-tested anywhere else in this codebase (it's excluded
from coverage in `vite.config.ts`). It's exercised by Task 7's manual
Android walkthrough, which is the only way to observe the real
install → share → auto-open flow end-to-end.

- [ ] **Step 1: Extend `openCreate` to accept a URL prefill**

In `src/links/admin-ui.ts`, update the `LinkFormHandle` type:

```ts
export type LinkFormHandle = {
  element: HTMLElement;
  openCreate: (prefill?: { url?: string }) => void;
  openEdit: (link: LinkRow) => void;
  close: () => void;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
};
```

and the `openCreate` implementation inside `createLinkFormModal`:

```ts
  function openCreate(prefill?: { url?: string }): void {
    editingId = null;
    title.textContent = "Nova experiência";
    form.reset();
    if (prefill?.url) {
      urlField.input.value = prefill.url;
    }
    descField.syncHeight();
    updateLabelCounter();
    updateDescCounter();
    updateMemoryCounter();
    afterOpen();
  }
```

- [ ] **Step 2: Run the existing suite to confirm nothing broke**

Run: `npx vitest run`
Expected: all tests still pass (the change is additive/optional).

- [ ] **Step 3: Track the pending shared URL in `main.ts`**

Add the import at the top of `src/links/main.ts` (next to the other
`./`-relative imports):

```ts
import { pickSharedUrl } from "./share-target";
```

In `bootDynamic`, change:

```ts
  let links: LinkRow[] = sortLinks(initialLinks);
  let authenticated = false;
  let notice = warning ?? null;
  let categoryFilter: Category[] = [];
```

to:

```ts
  let links: LinkRow[] = sortLinks(initialLinks);
  let authenticated = false;
  let notice = warning ?? null;
  let categoryFilter: Category[] = [];
  let pendingSharedUrl: string | null = pickSharedUrl(
    new URLSearchParams(location.search)
  );
```

- [ ] **Step 4: Open the create form (or the login modal) when a share is pending**

Still in `bootDynamic`, add this function near `render()` (right after its
closing brace, i.e. right before the `// --- auth wiring` comment):

```ts

  function handlePendingShare(): void {
    if (!pendingSharedUrl) return;
    if (authenticated) {
      const url = pendingSharedUrl;
      pendingSharedUrl = null;
      history.replaceState(null, "", location.pathname);
      formModal.openCreate({ url });
    } else {
      loginModal.open();
    }
  }
```

- [ ] **Step 5: Call it from both auth entry points**

In the `auth.onAuthStateChange` callback, change:

```ts
      } else {
        links = [];
      }
      render();
    })();
  });
```

(the one inside `auth.onAuthStateChange`, currently ending the block that
starts `auth.onAuthStateChange((_event, session) => {`) to:

```ts
      } else {
        links = [];
      }
      render();
      handlePendingShare();
    })();
  });
```

And in the initial-paint IIFE, change its final two lines from:

```ts
    } catch {
      authenticated = false;
      links = [];
    }
    render();
  })();
```

to:

```ts
    } catch {
      authenticated = false;
      links = [];
    }
    render();
    handlePendingShare();
  })();
```

- [ ] **Step 6: Typecheck and full suite**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: only the pre-existing `deck-ui.ts(345,51)` error.

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Build**

Run: `npx vite build`
Expected: succeeds, `p/a8f3k2/app.js` updated.

- [ ] **Step 8: Commit**

```bash
git add src/links/admin-ui.ts src/links/main.ts p/a8f3k2/app.js
git commit -m "feat(links): auto-open create form from shared URL, prompt login first if needed"
```

---

### Task 7: Manual Android verification (share target end-to-end)

This cannot be automated — it depends on a real device's OS share sheet
and PWA install flow, which no unit test, Playwright run, or ngrok curl can
exercise. Do this after Task 6 is committed and the ngrok tunnel points at
the freshly built app.

**Steps:**

- [ ] Confirm the local server + ngrok tunnel are serving the latest build (`curl -sS -H "ngrok-skip-browser-warning: true" -o /dev/null -w "%{http_code}\n" <ngrok-url>/p/a8f3k2/manifest.json` → expect `200`).
- [ ] On an Android phone with Chrome, open the ngrok URL's `/p/a8f3k2/` page.
- [ ] Open Chrome's menu → "Adicionar à tela inicial" / "Instalar app". Confirm it offers to install (this requires the manifest + icon + HTTPS to all be valid — if it doesn't offer installation, check `chrome://inspect` or the Chrome DevTools "Application" → "Manifest" panel for errors).
- [ ] After installing, open any other app (e.g. Chrome itself on a random page, or Instagram) and use its "Compartilhar" / "Share" action.
- [ ] Confirm "Bucket List" (or "Experience Bucket List") appears in the share sheet.
- [ ] Share a link. Confirm the app opens:
  - If not logged in: the login modal should appear first.
  - After logging in (or if already logged in): "Nova experiência" should open automatically with the URL field already filled from the shared link.
- [ ] Save the experience and confirm it appears in the list.
- [ ] Report back what happened — if the share sheet entry doesn't appear, or the URL doesn't land in the field, that's the signal to debug `manifest.json` (Task 5) or the param names in `pickSharedUrl` (Task 4) against what Android/Chrome actually sent.

---

## Post-plan cleanup

- [ ] Confirm `git log --oneline -8` shows all 6 code commits (Tasks 1–6; Task 7 has no commit, it's verification only).
- [ ] Ask the user whether to push to `origin/main` (per this session's established pattern — commits are made per-task, but pushing is a separate explicit confirmation).
