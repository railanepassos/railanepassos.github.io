import { draftPrefill, withoutEmptyProposals, type Draft, type DraftFields, type DraftPlanItem } from "./draft";

/**
 * Opens drafts through the app's usual forms and tells the caller how each one
 * ended (Phase 5 drafts and Phase 9 "Pedir ao Claude"). No DOM: the forms are
 * injected, so the chaining rules are unit tested.
 *
 * Rules:
 *  - closing, cancelling or skipping a draft never stops the chain: the next one opens;
 *  - `onDone` of `reviewDrafts` runs at the end of the chain only if at least one draft
 *    was saved (otherwise the request stays ready);
 *  - a missing item or an empty draft in the middle of a chain shows a notice and goes on.
 */

type Prefill = ReturnType<typeof draftPrefill>;
type PlanHooks = { onSaved: () => void; onSkipped: () => void };

export type DraftFlowDeps<L extends { id: string }> = {
  openCreate: (prefill: Prefill, title?: string) => void;
  openEdit: (link: L, prefill: Prefill) => void;
  openPlan: (link: L, items: readonly DraftPlanItem[], hooks: PlanHooks) => void;
  findLink: (id: string) => L | undefined;
  /** No form and no detail open: a queued item may open now. */
  isIdle: () => boolean;
  /** Why a draft was not opened (shown in the feed). */
  notify: (message: string) => void;
  listLoadFailed: () => boolean;
  /** Defers the next form until the current one has closed. */
  defer?: (fn: () => void) => void;
};

export type DraftFlow = {
  /** `onEnd(saved)` runs once when the draft is over (saved or not). */
  openDraft: (draft: Draft, onEnd?: (saved: boolean) => void) => void;
  /** Several drafts, one at a time; `onDone` after the last one if any was saved. */
  reviewDrafts: (drafts: Draft[], onDone: () => void) => void;
  /** The create/edit form was saved and closed. */
  formSaved: (editingId: string | null) => void;
  /** The create/edit form was dismissed without saving. */
  formDismissed: () => void;
  /** The form closed to show an existing duplicate: counts as skipped. */
  duplicateOpened: () => void;
  /** The detail closed: the next queued item may open. */
  resumeQueue: () => void;
  /** Drops everything in progress (sign-out). */
  reset: () => void;
};

export function createDraftFlow<L extends { id: string }>(deps: DraftFlowDeps<L>): DraftFlow {
  const defer = deps.defer ?? ((fn: () => void) => void setTimeout(fn, 0));
  let end: ((saved: boolean) => void) | null = null;
  let planAfterSave: { id: string; items: DraftPlanItem[] } | null = null;
  let queue: DraftFields[] = [];
  let queueTotal = 0;
  let queueActive = false;
  let queueSaved = 0;
  /** Bumped by reset(): callbacks of an older chain must not run. */
  let generation = 0;

  function endNow(saved: boolean): void {
    const cb = end;
    end = null;
    cb?.(saved);
  }

  function openNextQueued(): void {
    const next = queue.shift();
    if (!next) return;
    deps.openCreate(draftPrefill(next), `Nova experiência (${queueTotal - queue.length} de ${queueTotal})`);
  }

  function resumeQueue(): void {
    if (queue.length === 0) return;
    defer(() => {
      if (deps.isIdle()) openNextQueued();
    });
  }

  /** A create/edit form of the current draft is over. */
  function formClosed(saved: boolean): void {
    if (queueActive) {
      if (saved) queueSaved += 1;
      if (queue.length > 0) {
        resumeQueue();
        return;
      }
      queueActive = false;
      const count = queueSaved;
      queueSaved = 0;
      endNow(count > 0);
      return;
    }
    endNow(saved);
  }

  function openDraft(draft: Draft, onEnd?: (saved: boolean) => void): void {
    end = onEnd ?? null;
    planAfterSave = null;
    queueActive = false;
    queue = [];
    queueSaved = 0;
    if (draft.kind === "novo") {
      deps.openCreate(draftPrefill(draft.fields));
      return;
    }
    if (draft.kind === "fila") {
      queue = [...draft.items];
      queueTotal = queue.length;
      queueActive = true;
      openNextQueued();
      return;
    }
    const { id, plan } = draft;
    const fields = draft.fields ? draftPrefill(withoutEmptyProposals(draft.fields)) : undefined;
    const target = deps.findLink(id);
    if (!target) {
      deps.notify(
        deps.listLoadFailed()
          ? "Não foi possível abrir o rascunho: a lista de itens não carregou. Recarregue a página e tente de novo."
          : "Não foi possível abrir o rascunho: o item não existe mais ou o id está errado."
      );
      endNow(false);
      return;
    }
    const hasPlan = plan !== undefined && plan.length > 0;
    if (fields && Object.keys(fields).length > 0) {
      planAfterSave = hasPlan ? { id, items: plan } : null;
      deps.openEdit(target, fields);
    } else if (hasPlan) {
      const cb = end;
      end = null;
      deps.openPlan(target, plan, { onSaved: () => cb?.(true), onSkipped: () => cb?.(false) });
    } else {
      deps.notify("Este rascunho não propõe nada para o item. Pulei para o próximo.");
      endNow(false);
    }
  }

  function formSaved(editingId: string | null): void {
    const pending = planAfterSave;
    planAfterSave = null;
    const saved = pending && pending.id === editingId ? deps.findLink(pending.id) : undefined;
    if (!queueActive && pending && saved) {
      // The fields are saved: the plan sheet closing (saved or skipped) completes the draft.
      const cb = end;
      end = null;
      deps.openPlan(saved, pending.items, { onSaved: () => cb?.(true), onSkipped: () => cb?.(true) });
      return;
    }
    formClosed(true);
  }

  function formDismissed(): void {
    planAfterSave = null;
    formClosed(false);
  }

  function reviewDrafts(drafts: Draft[], onDone: () => void): void {
    const rest = [...drafts];
    const mine = ++generation;
    let anySaved = false;
    const next = (): void => {
      defer(() => {
        if (mine !== generation) return;
        const draft = rest.shift();
        if (!draft) return;
        openDraft(draft, (saved) => {
          if (mine !== generation) return;
          if (saved) anySaved = true;
          if (rest.length > 0) next();
          else if (anySaved) onDone();
        });
      });
    };
    next();
  }

  function reset(): void {
    generation += 1;
    end = null;
    planAfterSave = null;
    queue = [];
    queueActive = false;
    queueSaved = 0;
  }

  return {
    openDraft,
    reviewDrafts,
    formSaved,
    formDismissed,
    duplicateOpened: () => {
      planAfterSave = null;
      formClosed(false);
    },
    resumeQueue,
    reset,
  };
}
