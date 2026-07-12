# Links Schedule + ICS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated editors schedule an experience (date + editable 09:00–17:00 defaults), persist it on the link row, show a chip on list cards, and download a single `.ics` event for the phone calendar.

**Architecture:** Pure helpers (`schedule.ts`, `ics.ts`) + two nullable `timestamptz` columns on `public.links`. Native date/time inputs in a full-screen sheet from the view modal. ICS built client-side (Blob download). UI uses existing design tokens (`--green`, `--navy`, `--surface`). Timezone: wall clock `America/Sao_Paulo` via fixed offset `-03:00` (Brazil without DST since 2019) and `TZID=America/Sao_Paulo` in ICS.

**Tech Stack:** TypeScript, Vitest (jsdom where DOM needed), Supabase JS, Vite IIFE bundle, no new runtime deps.

**Spec:** `docs/superpowers/specs/2026-07-12-links-schedule-design.md`

**Branch:** create `feat/links-schedule` from updated `main` before Task 1 (do not commit schedule feature directly on `main`).

---

## File map

| File | Role |
|------|------|
| `supabase/migrations/004_links_schedule.sql` | Add `scheduled_start` / `scheduled_end` + check |
| `supabase/migrations/001_links.sql` | Same columns for greenfield |
| `src/links/schedule.ts` | Defaults, ISO build/split, validate, format chip/label |
| `src/links/ics.ts` | `buildIcs` + `downloadIcs` |
| `src/links/links-repo.ts` | Types + patches include schedule fields |
| `src/links/admin-ui.ts` | Schedule sheet; view actions; chip on admin card |
| `src/links/render.ts` | Chip on public card; FALLBACK types |
| `src/links/main.ts` | Wire save/clear/download + refresh |
| `styles.css` | Sheet helpers + schedule chip (tokens only) |
| `tests/unit/schedule.test.ts` | Unit |
| `tests/unit/ics.test.ts` | Unit |

---

### Task 1: Migration `004` + greenfield `001`

**Files:**
- Create: `supabase/migrations/004_links_schedule.sql`
- Modify: `supabase/migrations/001_links.sql`

- [ ] **Step 1: Write migration 004**

```sql
-- Planned visit window for an experience (editor-set).
alter table public.links
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz;

alter table public.links drop constraint if exists links_schedule_order;

alter table public.links
  add constraint links_schedule_order
  check (
    (scheduled_start is null and scheduled_end is null)
    or (
      scheduled_start is not null
      and scheduled_end is not null
      and scheduled_end > scheduled_start
    )
  );
```

- [ ] **Step 2: Mirror columns on `001_links.sql`**

After `category` (or after `icon_url` if category block differs), add:

```sql
  scheduled_start timestamptz,
  scheduled_end timestamptz,
```

And after other checks, add the same `links_schedule_order` check (inline on create table **or** as a separate `alter` at the bottom of `001` — prefer separate `alter` at bottom so create-table stays readable):

```sql
alter table public.links drop constraint if exists links_schedule_order;
alter table public.links
  add constraint links_schedule_order
  check (
    (scheduled_start is null and scheduled_end is null)
    or (
      scheduled_start is not null
      and scheduled_end is not null
      and scheduled_end > scheduled_start
    )
  );
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_links_schedule.sql supabase/migrations/001_links.sql
git commit -m "$(cat <<'EOF'
feat(links): add scheduled_start/end columns

EOF
)"
```

---

### Task 2: `schedule.ts` (TDD)

**Files:**
- Create: `tests/unit/schedule.test.ts`
- Create: `src/links/schedule.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  SCHEDULE_OFFSET,
  buildScheduleIso,
  formatScheduleChip,
  formatScheduleLabel,
  splitScheduleLocal,
  validateScheduleRange,
} from "../../src/links/schedule";

describe("schedule defaults", () => {
  it("uses 09:00–17:00", () => {
    expect(DEFAULT_START_TIME).toBe("09:00");
    expect(DEFAULT_END_TIME).toBe("17:00");
    expect(SCHEDULE_OFFSET).toBe("-03:00");
  });
});

describe("buildScheduleIso", () => {
  it("builds offset ISO for wall time in Sao Paulo", () => {
    expect(buildScheduleIso("2026-07-20", "09:00")).toBe(
      "2026-07-20T09:00:00-03:00"
    );
    expect(buildScheduleIso("2026-07-20", "17:00")).toBe(
      "2026-07-20T17:00:00-03:00"
    );
  });
});

describe("validateScheduleRange", () => {
  it("returns null when end is after start", () => {
    expect(
      validateScheduleRange(
        "2026-07-20T09:00:00-03:00",
        "2026-07-20T17:00:00-03:00"
      )
    ).toBeNull();
  });

  it("rejects empty or inverted range", () => {
    expect(validateScheduleRange("", "2026-07-20T17:00:00-03:00")).toMatch(
      /data/i
    );
    expect(
      validateScheduleRange(
        "2026-07-20T17:00:00-03:00",
        "2026-07-20T09:00:00-03:00"
      )
    ).toMatch(/depois|fim|início|inicio/i);
  });
});

describe("splitScheduleLocal", () => {
  it("splits ISO back to date and HH:MM", () => {
    expect(splitScheduleLocal("2026-07-20T09:00:00-03:00")).toEqual({
      date: "2026-07-20",
      time: "09:00",
    });
  });
});

describe("formatters", () => {
  it("formats chip and label", () => {
    expect(
      formatScheduleChip(
        "2026-07-20T09:00:00-03:00",
        "2026-07-20T17:00:00-03:00"
      )
    ).toBe("20 jul · 9–17");
    expect(
      formatScheduleLabel(
        "2026-07-20T09:00:00-03:00",
        "2026-07-20T17:00:00-03:00"
      )
    ).toMatch(/20 jul 2026/);
    expect(
      formatScheduleLabel(
        "2026-07-20T09:00:00-03:00",
        "2026-07-20T17:00:00-03:00"
      )
    ).toMatch(/09:00/);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm run test:unit -- tests/unit/schedule.test.ts
```

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `src/links/schedule.ts`**

```typescript
export const DEFAULT_START_TIME = "09:00";
export const DEFAULT_END_TIME = "17:00";
/** Brazil (America/Sao_Paulo) has no DST since 2019. */
export const SCHEDULE_OFFSET = "-03:00";
export const SCHEDULE_TZID = "America/Sao_Paulo";

const MONTHS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
] as const;

export function buildScheduleIso(dateYmd: string, timeHm: string): string {
  const date = dateYmd.trim();
  const time = timeHm.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("invalid date");
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("invalid time");
  }
  return `${date}T${time}:00${SCHEDULE_OFFSET}`;
}

export function validateScheduleRange(
  startIso: string,
  endIso: string
): string | null {
  if (!startIso.trim() || !endIso.trim()) {
    return "Informe data e horários.";
  }
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "Data ou horário inválido.";
  }
  if (end <= start) {
    return "O fim deve ser depois do início.";
  }
  return null;
}

export function splitScheduleLocal(iso: string): { date: string; time: string } {
  // Expect ...YYYY-MM-DDTHH:MM:SS±HH:MM
  const m = iso.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/
  );
  if (!m) throw new Error("invalid schedule iso");
  return { date: m[1], time: m[2] };
}

function parts(iso: string): { day: number; monthIdx: number; year: number; hour: number; minute: number } {
  const { date, time } = splitScheduleLocal(iso);
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return { day: d, monthIdx: mo - 1, year: y, hour: h, minute: mi };
}

function hourLabel(h: number): string {
  return String(h); // chip uses 9 not 09
}

export function formatScheduleChip(startIso: string, endIso: string): string {
  const s = parts(startIso);
  const e = parts(endIso);
  return `${s.day} ${MONTHS_PT[s.monthIdx]} · ${hourLabel(s.hour)}–${hourLabel(e.hour)}`;
}

export function formatScheduleLabel(startIso: string, endIso: string): string {
  const s = parts(startIso);
  const e = parts(endIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${s.day} ${MONTHS_PT[s.monthIdx]} ${s.year} · ${pad(s.hour)}:${pad(s.minute)}–${pad(e.hour)}:${pad(e.minute)}`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:unit -- tests/unit/schedule.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/links/schedule.ts tests/unit/schedule.test.ts
git commit -m "$(cat <<'EOF'
feat(links): add schedule helpers for SP wall time

EOF
)"
```

---

### Task 3: `ics.ts` (TDD)

**Files:**
- Create: `tests/unit/ics.test.ts`
- Create: `src/links/ics.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { buildIcs, icsUtcStamp } from "../../src/links/ics";

describe("buildIcs", () => {
  it("emits a VEVENT with summary, url, and local DTSTART/DTEND", () => {
    const ics = buildIcs({
      uid: "abc@railanepassos.tec.br",
      title: "Museu do Mar",
      description: "Aleixobelov",
      url: "https://www.instagram.com/museudomar.aleixobelov/",
      startIso: "2026-07-20T09:00:00-03:00",
      endIso: "2026-07-20T17:00:00-03:00",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Museu do Mar");
    expect(ics).toContain("UID:abc@railanepassos.tec.br");
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20260720T090000");
    expect(ics).toContain("DTEND;TZID=America/Sao_Paulo:20260720T170000");
    expect(ics).toContain("URL:https://www.instagram.com/museudomar.aleixobelov/");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("escapes commas and semicolons in text", () => {
    const ics = buildIcs({
      uid: "x@railanepassos.tec.br",
      title: "A, B; C",
      description: null,
      url: "https://example.com/a",
      startIso: "2026-07-20T09:00:00-03:00",
      endIso: "2026-07-20T17:00:00-03:00",
    });
    expect(ics).toContain("SUMMARY:A\\, B\\; C");
  });
});

describe("icsUtcStamp", () => {
  it("formats Date as YYYYMMDDTHHMMSSZ", () => {
    expect(icsUtcStamp(new Date("2026-07-20T12:00:00.000Z"))).toBe(
      "20260720T120000Z"
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test:unit -- tests/unit/ics.test.ts
```

- [ ] **Step 3: Implement `src/links/ics.ts`**

```typescript
import { SCHEDULE_TZID, splitScheduleLocal } from "./schedule";

export type IcsInput = {
  uid: string;
  title: string;
  description: string | null;
  url: string;
  startIso: string;
  endIso: string;
};

export function icsUtcStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toLocalIcsStamp(iso: string): string {
  const { date, time } = splitScheduleLocal(iso);
  const [y, m, d] = date.split("-");
  const [hh, mm] = time.split(":");
  return `${y}${m}${d}T${hh}${mm}00`;
}

export function buildIcs(input: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Railane Passos//Experience Bucket List//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(input.uid)}`,
    `DTSTAMP:${icsUtcStamp(new Date())}`,
    `DTSTART;TZID=${SCHEDULE_TZID}:${toLocalIcsStamp(input.startIso)}`,
    `DTEND;TZID=${SCHEDULE_TZID}:${toLocalIcsStamp(input.endIso)}`,
    `SUMMARY:${escapeText(input.title)}`,
  ];
  const descParts = [
    input.description?.trim() || "",
    input.url,
  ].filter(Boolean);
  if (descParts.length) {
    lines.push(`DESCRIPTION:${escapeText(descParts.join("\n"))}`);
  }
  lines.push(`URL:${input.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR", "");
  return lines.join("\r\n");
}

/** Trigger a file download in the browser (no-op friendly for unit tests if unused). */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test:unit -- tests/unit/ics.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/links/ics.ts tests/unit/ics.test.ts
git commit -m "$(cat <<'EOF'
feat(links): generate downloadable ICS events

EOF
)"
```

---

### Task 4: Repo types for schedule fields

**Files:**
- Modify: `src/links/links-repo.ts`
- Modify: `src/links/render.ts` (FALLBACK_LINKS — optional nulls already via missing fields; add explicit `scheduled_start: null, scheduled_end: null` if TypeScript requires)
- Modify: `tests/unit/links-repo.test.ts` only if fixtures break

- [ ] **Step 1: Extend types**

In `LinkRow`, `CreateLinkInput`, and `UpdateLinkPatch` add:

```typescript
scheduled_start?: string | null;
scheduled_end?: string | null;
```

Prefer **required keys on `LinkRow`** as `string | null` so callers always see them:

```typescript
// LinkRow
scheduled_start: string | null;
scheduled_end: string | null;
```

```typescript
// UpdateLinkPatch — allow clear
scheduled_start?: string | null;
scheduled_end?: string | null;
```

- [ ] **Step 2: Update FALLBACK_LINKS and any test fixtures** with `scheduled_start: null, scheduled_end: null`.

- [ ] **Step 3: Run unit suite**

```bash
npm run test:unit
```

Expected: PASS (fix fixture type errors if any)

- [ ] **Step 4: Commit**

```bash
git add src/links/links-repo.ts src/links/render.ts tests/unit
git commit -m "$(cat <<'EOF'
feat(links): type scheduled_start and scheduled_end on rows

EOF
)"
```

---

### Task 5: Schedule sheet UI + view wiring

**Files:**
- Modify: `src/links/admin-ui.ts`
- Modify: `styles.css`

- [ ] **Step 1: Add `createScheduleSheet`**

Pattern: same as other full-screen chrome (`createScreenChrome`).

```typescript
export type ScheduleSheetValues = {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;
};

export type ScheduleSheetHandle = {
  element: HTMLElement;
  open: (opts: {
    title?: string;
    initial: ScheduleSheetValues;
    onSave: (values: ScheduleSheetValues) => void | Promise<void>;
  }) => void;
  close: () => void;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
};
```

Fields: `input[type=date]`, two `input[type=time]`, help text, sticky **Salvar agendamento**. On submit, call `onSave` with trimmed values. Use `setScreenBusy(dialog, busy)` like login/form. No autofocus.

- [ ] **Step 2: Extend `createViewModal`**

Change signature to accept callbacks:

```typescript
export type ViewModalCallbacks = {
  onEdit: (link: LinkRow) => void;
  onSchedule: (link: LinkRow) => void;
  onDownloadIcs: (link: LinkRow) => void;
  onClearSchedule: (link: LinkRow) => void;
};

export function createViewModal(cb: ViewModalCallbacks): ViewModalHandle
```

UI rules:
- Always show **Editar**
- If `!link.scheduled_start || !link.scheduled_end`: show **Agendar** (primary) above Editar
- Else: show label “Agendado” + `formatScheduleLabel(...)`; buttons **Baixar ICS** (primary), **Alterar data**, **Remover agendamento**, then **Editar**
- `open(link)` refreshes these controls from `link`

- [ ] **Step 3: Chip on `renderAdminCard`**

After category (or after description), if both schedule fields set:

```typescript
const chip = document.createElement("span");
chip.className = "link-card__schedule";
chip.textContent = formatScheduleChip(link.scheduled_start, link.scheduled_end);
textEl.appendChild(chip);
```

- [ ] **Step 4: CSS (tokens only)**

```css
.link-card__schedule {
  display: inline-block;
  align-self: flex-start;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--green-light);
  color: var(--green-dark);
  font-size: 0.75rem;
  font-weight: 600;
}

.links-admin-form__hint {
  margin: 0 0 16px;
  font-size: 0.82rem;
  color: var(--text-muted);
}
```

Reuse existing button/modal classes — no new purple/cream palette.

- [ ] **Step 5: Manual sanity** — `npm run build` succeeds (types).

- [ ] **Step 6: Commit**

```bash
git add src/links/admin-ui.ts styles.css
git commit -m "$(cat <<'EOF'
feat(links): add schedule sheet and view actions

EOF
)"
```

---

### Task 6: Public list chip + `main.ts` wire

**Files:**
- Modify: `src/links/render.ts`
- Modify: `src/links/main.ts`

- [ ] **Step 1: Chip in `renderPublicCard`** (same class as admin).

- [ ] **Step 2: Wire in `main.ts`**

```typescript
const scheduleSheet = createScheduleSheet();
// append scheduleSheet.element to body

const viewModal = createViewModal({
  onEdit: (l) => formModal.openEdit(l),
  onSchedule: (l) => openSchedule(l),
  onDownloadIcs: (l) => {
    if (!l.scheduled_start || !l.scheduled_end) return;
    const ics = buildIcs({
      uid: `${l.id}@railanepassos.tec.br`,
      title: l.label,
      description: l.description,
      url: l.url,
      startIso: l.scheduled_start,
      endIso: l.scheduled_end,
    });
    downloadIcs(`${slugify(l.label)}.ics`, ics);
  },
  onClearSchedule: async (l) => {
    try {
      await repo.updateLink(l.id, {
        scheduled_start: null,
        scheduled_end: null,
      });
      links = links.map((row) =>
        row.id === l.id
          ? { ...row, scheduled_start: null, scheduled_end: null }
          : row
      );
      renderList();
      viewModal.open(links.find((r) => r.id === l.id)!);
    } catch (err) {
      /* optional: reopen with error — view has no setError; reload */
      await reloadFromServer(messageOf(err, GENERIC_ERROR));
    }
  },
});

function openSchedule(link: LinkRow): void {
  const initial =
    link.scheduled_start && link.scheduled_end
      ? {
          date: splitScheduleLocal(link.scheduled_start).date,
          startTime: splitScheduleLocal(link.scheduled_start).time,
          endTime: splitScheduleLocal(link.scheduled_end).time,
        }
      : {
          date: "",
          startTime: DEFAULT_START_TIME,
          endTime: DEFAULT_END_TIME,
        };

  scheduleSheet.open({
    title: "Agendar",
    initial,
    onSave: async (values) => {
      try {
        scheduleSheet.setBusy(true);
        const startIso = buildScheduleIso(values.date, values.startTime);
        const endIso = buildScheduleIso(values.date, values.endTime);
        const err = validateScheduleRange(startIso, endIso);
        if (err) {
          scheduleSheet.setError(err);
          return;
        }
        await repo.updateLink(link.id, {
          scheduled_start: startIso,
          scheduled_end: endIso,
        });
        links = links.map((row) =>
          row.id === link.id
            ? { ...row, scheduled_start: startIso, scheduled_end: endIso }
            : row
        );
        renderList();
        scheduleSheet.close();
        viewModal.open(links.find((r) => r.id === link.id)!);
      } catch (e) {
        scheduleSheet.setError(messageOf(e, GENERIC_ERROR));
      } finally {
        scheduleSheet.setBusy(false);
      }
    },
  });
}
```

Add a tiny local `slugify` (or inline filename `experiencia.ics`) — keep ASCII-safe:

```typescript
function icsFilename(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "experiencia"}.ics`;
}
```

- [ ] **Step 3: Build + unit**

```bash
npm run test:unit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/links/main.ts src/links/render.ts p/a8f3k2/app.js
git commit -m "$(cat <<'EOF'
feat(links): persist schedule and download ICS from view

EOF
)"
```

---

### Task 7: Manual verification + ops note

- [ ] **Step 1: Apply SQL** in Supabase SQL Editor (`004_links_schedule.sql`). Without this, updates fail at runtime.

- [ ] **Step 2: Local check** (`npm run build && npm run serve`)

1. Login as editor  
2. Open view → **Agendar** → pick date, keep 09:00–17:00 → Salvar  
3. See chip on list + “Agendado” on view  
4. **Baixar ICS** → import on phone / Calendar.app  
5. **Remover agendamento** → chip gone  
6. Logged out: no Agendar button; chip still visible if date public  

- [ ] **Step 3: Push branch + open PR** with LGPD N/A (unless privacy-policy updated), mention migration 004 for the titular.

---

## Self-review (plan vs spec)

| Spec item | Task |
|-----------|------|
| Editor-only schedule | Task 5–6 (buttons only in authenticated view flow) |
| Defaults 9–17, editable | Task 2 + 5 |
| Single ICS 9–17 block | Task 3 |
| Save ≠ download | Task 5–6 |
| Chip on list | Task 5–6 |
| Columns + constraint | Task 1 |
| Tokens / no new libs | Tasks 3, 5 |
| Unit tests schedule + ICS | Tasks 2–3 |
| LGPD N/A / no CSP change | Task 7 PR notes |

No TBD placeholders. Types use `scheduled_start` / `scheduled_end` consistently.
