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
