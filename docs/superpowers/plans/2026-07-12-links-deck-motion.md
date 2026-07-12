# Deck Motion (Tinder fly-off) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tinder-style fly-off, snap-back, and next-card rise to the Deck UI so decisions feel kinetic instead of instantaneous.

**Architecture:** Small pure helper `deck-motion.ts` for reduced-motion detection and waiting on CSS `animationend`/`transitionend`. `deck-ui.ts` runs exit animation *before* handlers/queue advance. Keyframes and classes live in `styles.css`. No new dependencies.

**Tech Stack:** TypeScript, Vitest (jsdom), CSS animations/transitions, Pointer Events (existing).

**Spec:** `docs/superpowers/specs/2026-07-12-links-deck-motion-design.md`

## Global Constraints

- No animation libraries / CDN scripts.
- Respect `prefers-reduced-motion: reduce` → instant decision (no fly/snap/enter classes that matter).
- Do not change Deck business rules (priority, skip queue, mark done).
- Conventional Commits; do not push `main`.
- TDD: failing test before production code per task.

---

## File map

| File | Role |
|------|------|
| `src/links/deck-motion.ts` | `prefersDeckMotion()`, `waitForMotion(el, opts)` |
| `tests/unit/deck-motion.test.ts` | Unit tests for helper |
| `src/links/deck-ui.ts` | Snap / fly / busy / order: animate → handler → paint |
| `styles.css` | `--fly-*`, `--snap`, `--enter`, peek rise, reduced-motion |
| `tests/unit/deck-ui.test.ts` | Order of animation vs handler; snap does not decide |

---

### Task 1: `deck-motion` helper (TDD)

**Files:**
- Create: `src/links/deck-motion.ts`
- Create: `tests/unit/deck-motion.test.ts`

**Interfaces:**
- Produces:
  - `export type DeckFlyDirection = "left" | "right" | "up"`
  - `export function prefersDeckMotion(): boolean` — true only when `matchMedia("(prefers-reduced-motion: reduce)")` is **not** matched (and `matchMedia` exists).
  - `export function waitForMotion(el: HTMLElement, options: { className: string; timeoutMs?: number; event?: "animationend" | "transitionend" }): Promise<void>` — adds `className`, resolves on matching event (or timeout), then removes `className` unless `options.keepClass` is true. Default `timeoutMs = 500`, default `event = "animationend"`.

- [ ] **Step 1: Write failing tests**

```ts
/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefersDeckMotion, waitForMotion } from "../../src/links/deck-motion";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("prefersDeckMotion", () => {
  it("returns false when reduced motion is preferred", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({
        matches: q.includes("prefers-reduced-motion"),
        media: q,
      }))
    );
    expect(prefersDeckMotion()).toBe(false);
  });

  it("returns true when reduced motion is not preferred", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, media: "" })
    );
    expect(prefersDeckMotion()).toBe(true);
  });

  it("returns false when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersDeckMotion()).toBe(false);
  });
});

describe("waitForMotion", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("resolves when animationend fires on the element", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const done = waitForMotion(el, { className: "go" });
    expect(el.classList.contains("go")).toBe(true);
    el.dispatchEvent(new Event("animationend"));
    await done;
    expect(el.classList.contains("go")).toBe(false);
  });

  it("resolves on timeout if no event", async () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const done = waitForMotion(el, { className: "go", timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    await done;
    expect(el.classList.contains("go")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm run test:unit -- tests/unit/deck-motion.test.ts
```

Expected: fail (module / exports missing).

- [ ] **Step 3: Implement `src/links/deck-motion.ts`**

```ts
export type DeckFlyDirection = "left" | "right" | "up";

export function prefersDeckMotion(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function waitForMotion(
  el: HTMLElement,
  options: {
    className: string;
    timeoutMs?: number;
    event?: "animationend" | "transitionend";
    keepClass?: boolean;
  }
): Promise<void> {
  const eventName = options.event ?? "animationend";
  const timeoutMs = options.timeoutMs ?? 500;
  el.classList.add(options.className);

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener(eventName, onEnd);
      window.clearTimeout(timer);
      if (!options.keepClass) el.classList.remove(options.className);
      resolve();
    };
    const onEnd = (e: Event) => {
      if (e.target !== el) return;
      finish();
    };
    el.addEventListener(eventName, onEnd);
    const timer = window.setTimeout(finish, timeoutMs);
  });
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:unit -- tests/unit/deck-motion.test.ts
```

- [ ] **Step 5: Commit** (only if user asked to commit; otherwise leave staged work uncommitted)

```bash
git add src/links/deck-motion.ts tests/unit/deck-motion.test.ts
git commit -m "$(cat <<'EOF'
feat(links): add deck motion helper for CSS waits

EOF
)"
```

---

### Task 2: CSS keyframes (fly / snap / enter / peek)

**Files:**
- Modify: `styles.css` (Deck section near `.links-deck-screen__card`)

**Interfaces:**
- Consumes: class names from spec (`links-deck-screen__card--fly-left|right|up`, `--snap`, `--enter`; peek uses existing `.links-deck-screen__peek` + optional `--rising`).
- Produces: visual motion only; no JS API.

- [ ] **Step 1: Add keyframes and classes** after `.links-deck-screen__card--dragging` block:

```css
@keyframes links-deck-fly-right {
  to {
    transform: translateX(120vw) rotate(18deg);
    opacity: 0.85;
  }
}

@keyframes links-deck-fly-left {
  to {
    transform: translateX(-120vw) rotate(-18deg);
    opacity: 0.85;
  }
}

@keyframes links-deck-fly-up {
  to {
    transform: translateY(-120vh) rotate(-6deg);
    opacity: 0.85;
  }
}

@keyframes links-deck-enter {
  from {
    transform: scale(0.94);
    opacity: 0.65;
  }
  to {
    transform: none;
    opacity: 1;
  }
}

.links-deck-screen__card--fly-right {
  transition: none;
  animation: links-deck-fly-right 300ms ease-in forwards;
}

.links-deck-screen__card--fly-left {
  transition: none;
  animation: links-deck-fly-left 300ms ease-in forwards;
}

.links-deck-screen__card--fly-up {
  transition: none;
  animation: links-deck-fly-up 300ms ease-in forwards;
}

.links-deck-screen__card--snap {
  /* relies on existing transform transition 0.22s when --deck-drag-* cleared */
}

.links-deck-screen__card--enter {
  animation: links-deck-enter 180ms ease-out;
}

.links-deck-screen__peek {
  transition: transform 0.2s ease-out, opacity 0.2s ease-out;
  transform: scale(0.94);
  opacity: 0.7;
}

.links-deck-screen__peek--rising {
  transform: scale(1);
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .links-deck-screen__card,
  .links-deck-screen__card--fly-right,
  .links-deck-screen__card--fly-left,
  .links-deck-screen__card--fly-up,
  .links-deck-screen__card--enter,
  .links-deck-screen__peek {
    transition: none !important;
    animation: none !important;
  }
}
```

Adjust if existing `.links-deck-screen__peek` rules conflict — merge rather than duplicate selectors.

- [ ] **Step 2: Manual check** — open Deck; CSS alone should not break layout (peek slightly smaller until `--rising`).

- [ ] **Step 3: Commit** (if requested)

```bash
git add styles.css
git commit -m "$(cat <<'EOF'
feat(links): add deck fly-off and enter keyframes

EOF
)"
```

---

### Task 3: Wire fly-off + snap into `deck-ui` (TDD)

**Files:**
- Modify: `src/links/deck-ui.ts`
- Modify: `tests/unit/deck-ui.test.ts`

**Interfaces:**
- Consumes: `prefersDeckMotion`, `waitForMotion`, `DeckFlyDirection` from `./deck-motion`
- Produces: same public `DeckHandle`; behavior change only

- [ ] **Step 1: Failing tests** — append to `tests/unit/deck-ui.test.ts`:

```ts
describe("createDeckScreen motion", () => {
  function stubMotion(reduced: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({
        matches: reduced && q.includes("prefers-reduced-motion"),
        media: q,
      }))
    );
  }

  it("does not call onWant until fly animation ends", async () => {
    stubMotion(false);
    const onWant = vi.fn();
    const deck = createDeckScreen({
      onWant,
      onSkip: vi.fn(),
      onMarkDone: vi.fn(),
      onWantAgain: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(deck.element);
    deck.open([row({ id: "a" }), row({ id: "b", label: "B" })], "wishlist");

    const wantBtn = deck.element.querySelector(
      ".links-deck-screen__btn--want"
    ) as HTMLButtonElement;
    wantBtn.click();

    expect(onWant).not.toHaveBeenCalled();
    const card = deck.element.querySelector(
      ".links-deck-screen__card"
    ) as HTMLElement;
    expect(card.classList.contains("links-deck-screen__card--fly-right")).toBe(
      true
    );
    card.dispatchEvent(new Event("animationend"));
    await vi.waitFor(() => expect(onWant).toHaveBeenCalledTimes(1));
  });

  it("calls onWant immediately when reduced motion", async () => {
    stubMotion(true);
    const onWant = vi.fn();
    const deck = createDeckScreen({
      onWant,
      onSkip: vi.fn(),
      onMarkDone: vi.fn(),
      onWantAgain: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(deck.element);
    deck.open([row()], "wishlist");
    (
      deck.element.querySelector(
        ".links-deck-screen__btn--want"
      ) as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(onWant).toHaveBeenCalledTimes(1));
  });

  it("snap-back does not call onSkip or onWant", async () => {
    stubMotion(false);
    const onWant = vi.fn();
    const onSkip = vi.fn();
    const deck = createDeckScreen({
      onWant,
      onSkip,
      onMarkDone: vi.fn(),
      onWantAgain: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(deck.element);
    deck.open([row()], "wishlist");
    const card = deck.element.querySelector(
      ".links-deck-screen__card"
    ) as HTMLElement;
    card.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1, button: 0, clientX: 100 })
    );
    card.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientX: 120 })
    );
    card.dispatchEvent(
      new PointerEvent("pointerup", { pointerId: 1, clientX: 120 })
    );
    expect(onWant).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** on “does not call onWant until…”

```bash
npm run test:unit -- tests/unit/deck-ui.test.ts
```

- [ ] **Step 3: Implement wiring in `deck-ui.ts`**

Import:

```ts
import {
  prefersDeckMotion,
  waitForMotion,
  type DeckFlyDirection,
} from "./deck-motion";
```

Add helpers inside `createDeckScreen`:

```ts
const FLY_CLASS: Record<DeckFlyDirection, string> = {
  left: "links-deck-screen__card--fly-left",
  right: "links-deck-screen__card--fly-right",
  up: "links-deck-screen__card--fly-up",
};

async function playExit(direction: DeckFlyDirection): Promise<void> {
  if (!prefersDeckMotion()) return;
  stackPeek.classList.add("links-deck-screen__peek--rising");
  card.style.setProperty(
    direction === "left"
      ? "--deck-stamp-skip"
      : direction === "right"
        ? "--deck-stamp-want"
        : "--deck-stamp-want",
    "1"
  );
  if (direction === "up") {
    /* stamps optional; fly-up has no stamp requirement */
  }
  await waitForMotion(card, {
    className: FLY_CLASS[direction],
    timeoutMs: 500,
    event: "animationend",
  });
  stackPeek.classList.remove("links-deck-screen__peek--rising");
}

async function afterExit(direction: DeckFlyDirection, commit: () => void | Promise<void>): Promise<void> {
  if (busy) return;
  setBusy(true);
  try {
    await playExit(direction);
    await commit();
    if (prefersDeckMotion() && current()) {
      void waitForMotion(card, {
        className: "links-deck-screen__card--enter",
        timeoutMs: 400,
        event: "animationend",
      });
    }
  } finally {
    setBusy(false);
  }
}
```

Refactor acts:

```ts
async function actWant(): Promise<void> {
  const link = current();
  if (!link || busy) return;
  await afterExit("right", async () => {
    if (tab === "wishlist") await handlers.onWant(link);
    else await handlers.onWantAgain(link);
    advancePast(link.id);
  });
}

async function actDone(): Promise<void> {
  const link = current();
  if (!link || busy || tab !== "wishlist") return;
  await afterExit("up", async () => {
    await handlers.onMarkDone(link);
    advancePast(link.id);
  });
}

async function actSkip(): Promise<void> {
  if (!current() || busy) return;
  await afterExit("left", () => {
    queue = skipFront(queue);
    paintCard();
    handlers.onSkip();
  });
}
```

Snap-back in `endDrag` when under threshold:

```ts
if (Math.abs(dx) < SWIPE_THRESHOLD) {
  if (prefersDeckMotion()) {
    // keep last --deck-drag-* briefly then clear so CSS transition snaps
    card.classList.add("links-deck-screen__card--snap");
    requestAnimationFrame(() => {
      card.style.removeProperty("--deck-drag-x");
      card.style.removeProperty("--deck-drag-rot");
      card.style.removeProperty("--deck-stamp-skip");
      card.style.removeProperty("--deck-stamp-want");
    });
    void waitForMotion(card, {
      className: "links-deck-screen__card--snap",
      event: "transitionend",
      timeoutMs: 400,
      keepClass: false,
    }).then(() => {
      card.classList.remove("links-deck-screen__card--snap");
    });
  } else {
    paintCard();
  }
  return;
}
```

Note: when under threshold, do **not** strip drag vars synchronously before the rAF clear (adjust `endDrag` so clearing of transform vars happens in the snap path as above; for fly path, leave lean/stamp until `playExit`).

Update click handlers: `skipBtn` → `() => void actSkip()`.

Clear fly/enter/snap classes at start of `paintCard`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:unit -- tests/unit/deck-ui.test.ts tests/unit/deck-motion.test.ts
```

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: `p/a8f3k2/app.js` rebuilt.

- [ ] **Step 6: Commit** (if requested)

```bash
git add src/links/deck-ui.ts tests/unit/deck-ui.test.ts styles.css
git commit -m "$(cat <<'EOF'
feat(links): animate deck fly-off, snap-back, and enter

EOF
)"
```

---

### Task 4: Manual verification checklist

**Files:** none (QA)

- [ ] **Step 1:** `npm run build && npm run serve` (or use existing serve); open `/p/a8f3k2/`, login, open Deck.

- [ ] **Step 2: Checklist**

- [ ] Quero / → voa para a direita; handler persiste.
- [ ] Agora não / ← voa para a esquerda; card volta ao fim da fila.
- [ ] Já fiz / D voa para cima.
- [ ] Soltar cedo: snap-back; sem decisão.
- [ ] Peek sobe durante o voo; próximo card entra.
- [ ] Reduced motion (OS): decisões instantâneas.
- [ ] Sem double-tap durante animação.

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Snap-back | Task 3 |
| Fly left/right/up | Task 2 + 3 |
| Peek rise + enter | Task 2 + 3 |
| Buttons/keyboard same as swipe | Task 3 (shared `act*`) |
| Reduced motion | Task 1 + 3 |
| Busy during motion | Task 3 `afterExit` |
| Animate then handler | Task 3 tests + impl |
| No libs | Global |
| Unit tests | Task 1 + 3 |

**Placeholder scan:** none.  
**Type consistency:** `DeckFlyDirection` = `"left" | "right" | "up"` throughout.
