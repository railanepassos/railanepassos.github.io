import { dedupePeople, normalizePerson, personKey } from "./people";

/**
 * Trip plan (Phase 4): the checklist and the shopping list of a place, stored
 * in links.plan_items (jsonb array of { text, list, who?, done }). Pure
 * helpers; the sheet edits drafts and the detail reads the stored value.
 *
 * `who` (the person in charge) is a name only: no phone, no account (LGPD).
 */

export type PlanList = "checklist" | "compras";

/** Stored item. `who` is omitted when empty. */
export type PlanItem = { text: string; list: PlanList; who?: string; done: boolean };

/** Editable sheet row. */
export type PlanDraft = { text: string; list: PlanList; who: string; done: boolean };

/** Mirror the DB check constraint of migration 013. */
export const MAX_PLAN_ITEMS = 60;
export const PLAN_TEXT_MAX = 200;
export const PLAN_WHO_MAX = 80;

/** Lists in on-screen order. */
export const PLAN_LISTS: ReadonlyArray<{ key: PlanList; title: string }> = [
  { key: "checklist", title: "Checklist" },
  { key: "compras", title: "Lanches e compras" },
];

function isPlanList(value: unknown): value is PlanList {
  return value === "checklist" || value === "compras";
}

/** Drafts -> payload. Trimmed, blank rows dropped, order kept; nothing left -> null. */
export function normalizePlan(drafts: readonly PlanDraft[]): PlanItem[] | null {
  const out: PlanItem[] = [];
  for (const d of drafts) {
    const text = d.text.trim();
    if (text === "") continue;
    const item: PlanItem = { text, list: d.list, done: d.done };
    const who = d.who.trim();
    if (who !== "") item.who = who;
    out.push(item);
  }
  return out.length > 0 ? out : null;
}

/** First problem found in the drafts (PT-BR, names the item), or null. */
export function planError(drafts: readonly PlanDraft[]): string | null {
  if ((normalizePlan(drafts) ?? []).length > MAX_PLAN_ITEMS) {
    return `Use no máximo ${MAX_PLAN_ITEMS} itens no plano.`;
  }
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    if (d.text.trim().length > PLAN_TEXT_MAX) {
      return `Item ${i + 1}: o texto deve ter no máximo ${PLAN_TEXT_MAX} caracteres.`;
    }
    if (d.who.trim().length > PLAN_WHO_MAX) {
      return `Item ${i + 1}: o responsável deve ter no máximo ${PLAN_WHO_MAX} caracteres.`;
    }
  }
  return null;
}

/**
 * Strict check of items about to be stored (blank text and unknown lists are
 * rejected, as the DB does). Sheet drafts use `planError`.
 */
export function storedPlanError(items: readonly PlanItem[]): string | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (!isPlanList(item.list)) return `Item ${i + 1}: lista inválida.`;
    if (item.text.trim() === "") return `Item ${i + 1}: o texto não pode ficar em branco.`;
  }
  return planError(items.map(planDraftFromItem));
}

/** Defensive read of the stored jsonb: only well-formed items survive. */
export function readPlanItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { text, list, who, done } = entry as Record<string, unknown>;
    if (typeof text !== "string" || text.trim() === "" || !isPlanList(list)) continue;
    const item: PlanItem = { text, list, done: done === true };
    if (typeof who === "string" && who.trim() !== "") item.who = who;
    out.push(item);
  }
  return out;
}

function planDraftFromItem(item: PlanItem): PlanDraft {
  return { text: item.text, list: item.list, who: item.who ?? "", done: item.done };
}

export function planDraftsFromItems(items: readonly PlanItem[]): PlanDraft[] {
  return items.map(planDraftFromItem);
}

export type PlanProgress = { done: number; total: number; label: string };

/** Progress of one list: "3 de 7". */
export function planProgress(items: readonly PlanItem[], list: PlanList): PlanProgress {
  const own = items.filter((i) => i.list === list);
  const done = own.filter((i) => i.done).length;
  return { done, total: own.length, label: `${done} de ${own.length}` };
}

/** Copy of the items with item `index` set to `done` (out of range: unchanged). */
export function togglePlanItem(items: readonly PlanItem[], index: number, done: boolean): PlanItem[] {
  return items.map((item, i) => (i === index ? { ...item, done } : { ...item }));
}

/** What the "Plano do passeio" sheet edits. */
export type PlanValues = { people: string[]; items: PlanDraft[] };

/** Sheet values of a link (defensive read of both columns). */
export function planFromLink(link: {
  people?: readonly string[] | null;
  plan_items?: unknown;
}): PlanValues {
  return {
    people: dedupePeople(link.people ?? []),
    items: planDraftsFromItems(readPlanItems(link.plan_items)),
  };
}

/** Columns written by the sheet (empty -> null). */
export type PlanPatch = { people: string[] | null; plan_items: PlanItem[] | null };

export function planToPatch(values: PlanValues): PlanPatch {
  const people = dedupePeople(values.people);
  return { people: people.length > 0 ? people : null, plan_items: normalizePlan(values.items) };
}

/**
 * Owner choices for an item: the participants, plus the stored owner when it
 * is not among them (so removing a participant never loses the name).
 */
export function ownerOptions(people: readonly string[], who: string): string[] {
  const options = dedupePeople(people);
  const current = normalizePerson(who);
  if (current !== "" && !options.some((p) => personKey(p) === personKey(current))) {
    options.push(current);
  }
  return options;
}

export type PlanPersonGroup = { who: string; items: PlanItem[]; done: number };

/** "Quem faz o quê": items grouped by owner (first appearance order); unowned items are left out. */
export function planByPerson(items: readonly PlanItem[]): PlanPersonGroup[] {
  const groups = new Map<string, PlanPersonGroup>();
  for (const item of items) {
    const who = normalizePerson(item.who ?? "");
    if (who === "") continue;
    const key = personKey(who);
    let group = groups.get(key);
    if (!group) {
      group = { who, items: [], done: 0 };
      groups.set(key, group);
    }
    group.items.push(item);
    if (item.done) group.done += 1;
  }
  return [...groups.values()];
}
