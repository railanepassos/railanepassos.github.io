/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig, isSupabaseConfigured, isBrowserSafeAnonKey } from "./config";
import { createAuth, type Auth } from "./auth";
import { createAuthStorage, setRememberMe } from "./session-storage";
import { PLAN_STALE_NOTICE, isPlanShareFragment } from "./plan-share";
import { bootSharedPlan } from "./shared-plan-boot";
import {
  draftPrefill,
  isDraftFragment,
  parseDraft,
  withoutEmptyProposals,
  type DraftFields,
  type DraftPlanItem,
  type ParseDraftResult,
} from "./draft";
import { StaleLinkError, createLinksRepo, type LinksRepo, type LinkRow, type UpdateLinkPatch } from "./links-repo";
import { renderGuestGate } from "./render";
import { collectTags } from "./tags";
import { collectLessons } from "./lesson-suggestions";
import { collectPeople } from "./people";
import { matches, parseQuery, removeChip, setMinRating, toggleFilter } from "./query";
import { renderDoneToolbar } from "./done-toolbar";
import { renderMemoriesSwitch, renderMemoriesTimeline } from "./memories-ui";
import { rankDone, filterDone } from "./ranking";
import { renderLinksSkeleton, renderToolbarSkeleton } from "./skeleton";
import {
  createLoginButton,
  createLoginModal,
  createLinkFormModal,
  createDeleteConfirmSheet,
  createViewModal,
  createDrawResultSheet,
  createScheduleSheet,
  renderAdminCard,
  toCreateInput,
  toUpdatePatch,
  type LoginModalHandle,
  type LinkFormHandle,
  type LinkFormValues,
  type DeleteSheetHandle,
  type ViewModalHandle,
  type DrawSheetHandle,
  type ScheduleSheetHandle,
} from "./admin-ui";
import { filterLinksByCategory, type Category } from "./category";
import { pickRandomItem } from "./pick-random";
import { applyDrawFilters, hasActiveDrawFilters } from "./draw-filters";
import { createDrawFilterSheet } from "./draw-sheet";
import { nextSortOrder, sortLinksForDisplay, visibleListLinks } from "./sort-links";
import { findDuplicate } from "./duplicates";
import {
  categoryCounts,
  displayTitle,
  linksForSection,
  sectionCounts,
  toggleCategory,
  type Section,
} from "./feed";
import {
  SECTION_TITLES,
  createAppBarActions,
  renderChips,
  renderSideNav,
  renderTabBar,
  type ShellHandlers,
  type ShellState,
} from "./app-shell";
import { buildIcs, downloadIcs } from "./ics";
import { createReviewSheet, type ReviewSheetHandle } from "./review-sheet";
import { UNMARK_DONE_PATCH, reviewError, reviewFromLink, reviewToPatch } from "./review";
import { createPlanSheet, type PlanSheetHandle } from "./plan-sheet";
import type { PlanItem } from "./plan";
import { renderTodayBanner } from "./today-banner";
import { createVisitMode, type VisitModeHandle } from "./visit-ui";
import { isVisitFragment, parseVisitFragment, pendingVisitAction, visitFragment } from "./visit";
import { createKeyedQueue } from "./keyed-queue";
import { mergeProposedPlanItems, planError, planFromLink, planToPatch } from "./plan";
import { createDeckScreen, type DeckHandle } from "./deck-ui";
import { nextPriority } from "./deck-queue";
import { pickSharedUrl } from "./share-target";
import {
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  buildScheduleIso,
  splitScheduleLocal,
  validateScheduleRange,
} from "./schedule";

/**
 * Bootstrap for the dynamic links page.
 *
 * States:
 *   Carregando  -> skeleton na toolbar + lista (#links-admin-root / #links-list).
 *   Visitante   -> gate na lista (“Entre para ver…”); "Entrar" in
 *                  #links-admin-root (only when Supabase is configured).
 *   Autenticado -> toolbar in #links-admin-root + admin cards in #links-list.
 *
 * Graceful degradation: if Supabase is not configured, or the initial
 * listLinks() throws for an anonymous session (expected after RLS), we keep
 * the login affordance and never show experience cards to guests.
 */

const PLAN_SAVE_ERROR = "Não foi possível salvar o plano. Tente de novo.";
const GENERIC_ERROR = "Algo deu errado. Tente novamente.";

type Els = {
  adminRoot: HTMLElement;
  list: HTMLElement;
  appBar: HTMLElement | null;
  sideNav: HTMLElement | null;
  chips: HTMLElement | null;
  heading: HTMLElement | null;
  tabBar: HTMLElement | null;
};

function getEls(): Els | null {
  const adminRoot = document.getElementById("links-admin-root");
  const list = document.getElementById("links-list");
  if (!adminRoot || !list) return null;
  return {
    adminRoot,
    list,
    appBar: document.getElementById("links-appbar"),
    sideNav: document.getElementById("links-sidenav"),
    chips: document.getElementById("links-chips"),
    heading: document.getElementById("links-heading"),
    tabBar: document.getElementById("links-tabbar"),
  };
}

function renderLoading(els: Els): void {
  renderToolbarSkeleton(els.adminRoot);
  renderLinksSkeleton(els.list);
}

function renderMessage(container: HTMLElement, text: string): void {
  const msg = document.createElement("p");
  msg.className = "links-status links-status--error";
  msg.setAttribute("role", "alert");
  msg.textContent = text;
  container.appendChild(msg);
}

function sortLinks(links: LinkRow[]): LinkRow[] {
  return sortLinksForDisplay(links);
}

function icsFilename(link: LinkRow): string {
  const slug = link.label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "experiencia"}.ics`;
}

/**
 * Offline / misconfigured mode: no experience cards for anyone.
 */
function bootStatic(els: Els): void {
  els.adminRoot.replaceChildren();
  renderGuestGate(els.list);
  if (pendingDraft) {
    // No editor login in this mode, so the draft cannot be opened: say so instead of dropping it silently.
    pendingDraft = null;
    renderMessage(
      els.list,
      "Não foi possível abrir o rascunho: rascunhos precisam do login de editor, que não está disponível agora."
    );
  }
}

/**
 * Item draft read from `#rascunho=` (Phase 5), held until the editor is
 * logged in (same idea as `pendingSharedUrl`). It only pre-fills a form.
 */
let pendingDraft: ParseDraftResult | null = null;

/** Reads the draft from the fragment and takes the fragment out of the URL right away. */
function takeDraftFromUrl(): void {
  if (!isDraftFragment(window.location.hash)) return;
  pendingDraft = parseDraft(window.location.hash);
  history.replaceState(null, "", location.pathname + location.search);
}

/**
 * Dynamic mode: Supabase configured and reachable.
 */
function bootDynamic(
  els: Els,
  auth: Auth,
  repo: LinksRepo,
  initialLinks: LinkRow[],
  warning?: string
): void {
  let links: LinkRow[] = sortLinks(initialLinks);
  let authenticated = false;
  let notice = warning ?? null;
  /** Why a draft was not opened; kept so later re-renders do not drop it. */
  let draftNotice: string | null = null;
  /** The last list load failed: an unknown draft id then says that, not "item gone". */
  let listLoadFailed = false;
  let categoryFilter: Category[] = [];
  let section: Section = "feed";
  /**
   * Text of the search box, the single source of truth for every search filter
   * (`#tag`, `@pessoa`, `cidade:`, `custo<`, free text; see query.ts). Chip taps
   * and chip removal edit this text and the input, so typing == tapping.
   */
  let query = "";
  /** Feitos: ranking order and "Voltaria" filter (min rating lives in `query`). */
  let doneRanking = false;
  let doneWantAgain = false;
  let pendingSharedUrl: string | null = pickSharedUrl(
    new URLSearchParams(location.search)
  );

  // --- modals (created once, appended to <body>) ---
  const loginModal: LoginModalHandle = createLoginModal(async (email, password, remember) => {
    loginModal.setBusy(true);
    try {
      setRememberMe(remember);
      await auth.signIn(email, password);
      loginModal.close();
    } catch (err) {
      loginModal.setError(messageOf(err, "E-mail ou senha inválidos."));
    } finally {
      loginModal.setBusy(false);
    }
  });

  /** Update draft with fields + plan: the plan sheet opens once the item is saved. */
  let planAfterSave: { id: string; items: DraftPlanItem[] } | null = null;
  /** `fila` draft: new items still to open, one by one (memory only). */
  let draftQueue: DraftFields[] = [];
  let draftQueueTotal = 0;

  function openNextQueued(): void {
    const next = draftQueue.shift();
    if (!next) return;
    const position = draftQueueTotal - draftQueue.length;
    formModal.openCreate(draftPrefill(next), `Nova experiência (${position} de ${draftQueueTotal})`);
  }

  /** Opens the next queued item once the form and the detail are both closed. */
  function resumeQueue(): void {
    if (draftQueue.length === 0) return;
    setTimeout(() => {
      if (formModal.element.hidden && viewModal.currentId() === null) openNextQueued();
    }, 0);
  }

  const formModal: LinkFormHandle = createLinkFormModal(
    async (values, editingId) => {
      formModal.setBusy(true);
      try {
        if (editingId) {
          await submitEdit(editingId, values);
        } else {
          await submitCreate(values);
        }
        formModal.close();
        resumeQueue();
        const next = planAfterSave;
        planAfterSave = null;
        const saved = next && next.id === editingId ? findLink(next.id) : undefined;
        if (next && saved) openPlan(saved, next.items);
      } catch (err) {
        formModal.setError(messageOf(err, GENERIC_ERROR));
      } finally {
        formModal.setBusy(false);
      }
    },
    {
      getTagSuggestions: () => collectTags(links),
      getPeopleSuggestions: () => collectPeople(links),
      onDismiss: () => {
        planAfterSave = null;
        resumeQueue();
      },
      findDuplicate: (url, source_url) => findDuplicate(links, { url, source_url }),
      onOpenDuplicate: (l) => {
        planAfterSave = null;
        viewModal.open(l);
      },
    }
  );

  const deleteSheet: DeleteSheetHandle = createDeleteConfirmSheet();
  const scheduleSheet: ScheduleSheetHandle = createScheduleSheet();
  const reviewSheet: ReviewSheetHandle = createReviewSheet();
  const planSheet: PlanSheetHandle = createPlanSheet({
    getPeopleSuggestions: () => collectPeople(links),
    getLessonCandidates: () => collectLessons(links),
  });
  // One queue per place for the detail and the visit mode alike, so a save started in one
  // never races the conditional save of the other (self-inflicted StaleLinkError).
  const planSaveQueue = createKeyedQueue();
  const savePlanItems = (l: LinkRow, items: PlanItem[]): Promise<void> =>
    planSaveQueue(l.id, () => writePlanItems(l, items));
  const writePlanItems = async (l: LinkRow, items: PlanItem[]): Promise<void> => {
    // Each save is conditioned on the updated_at we last saw; queued saves run one after
    // another, so each one picks up the previous result.
    const loaded = findLink(l.id) ?? l;
    const saved = await repo.updateLinkIfUnchanged(l.id, { plan_items: items }, loaded.updated_at);
    if (saved === null) throw new StaleLinkError(await adoptServerRow(l.id));
    links = links.map((row) =>
      row.id === l.id ? { ...row, plan_items: items, updated_at: saved.updated_at ?? row.updated_at } : row
    );
    renderList();
    deckScreen.refresh(links);
  };

  const viewModal: ViewModalHandle = createViewModal({
    onEdit: (l) => formModal.openEdit(l),
    onSchedule: (l) => openSchedule(l),
    onMarkDone: (l) => void markDone(l),
    onUnmarkDone: (l) => void unmarkDone(l),
    onEditReview: (l) => openReview(l, "edit"),
    onEditPlan: (l) => openPlan(l),
    onSavePlanItems: savePlanItems,
    onVisit: (l) => openVisit(l),
    onPlanShareEnable: async (l) => {
      const token = await repo.enablePlanShare(l.id);
      links = links.map((row) => (row.id === l.id ? { ...row, plan_share_token: token } : row));
      await resyncAfterShareChange(l.id);
      return token;
    },
    onPlanShareDisable: async (l) => {
      if (!(await repo.disablePlanShare(l.id))) throw new Error("plan share was not disabled");
      links = links.map((row) => (row.id === l.id ? { ...row, plan_share_token: null } : row));
      await resyncAfterShareChange(l.id);
    },
    onDelete: (l) => void deleteLink(l),
    onTag: (tag) => toggleTagFilter(tag),
    onPerson: (person) => togglePeopleFilter(person),
    onOpenChange: (id) => {
      syncSelectedCard();
      if (id === null) resumeQueue();
    },
  });

  const visitMode: VisitModeHandle = createVisitMode({
    onSavePlanItems: savePlanItems,
    onMarkDone: (l) => void markDone(l),
    onClose: () => {
      if (isVisitFragment(window.location.hash)) {
        history.replaceState(null, "", location.pathname + location.search);
      }
    },
  });

  /** Opens the visit mode (the detail already closed) and keeps the URL shareable. */
  function openVisit(link: LinkRow): void {
    visitMode.open(link);
    history.replaceState(null, "", `${location.pathname}${location.search}${visitFragment(link.id)}`);
  }

  /** `#visita/<id>` on boot: open it once the editor is logged in and the list is loaded. */
  let visitFragmentPending = isVisitFragment(window.location.hash);
  function handlePendingVisit(): void {
    if (!visitFragmentPending) return;
    const id = parseVisitFragment(window.location.hash);
    const target = id ? findLink(id) : undefined;
    const targetOpenable = !!target && (target.status ?? "wishlist") !== "done";
    const action = pendingVisitAction({ authenticated, listLoadFailed, targetOpenable });
    // "wait" keeps the fragment (and the pending flag) so a later successful load reopens the mode.
    if (action === "wait") return;
    visitFragmentPending = false;
    if (action === "open" && target) {
      openVisit(target);
    } else {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  const shellHandlers: ShellHandlers = {
    onSection: (next) => {
      section = next;
      renderList();
      window.scrollTo({ top: 0 });
    },
    onToggleCategory: (c) => {
      categoryFilter = toggleCategory(categoryFilter, c);
      renderList();
    },
    onClearCategories: () => {
      categoryFilter = [];
      renderList();
    },
    onQuery: (q) => setQuery(q),
    onAdd: () => formModal.openCreate(),
    onDeck: () => deckScreen.open(links, "wishlist"),
    onDraw: () => drawFilterSheet.open(),
    onSignOut: () => {
      void (async () => {
        try {
          await auth.signOut();
        } catch (err) {
          renderMessage(els.list, messageOf(err, "Não foi possível sair. Tente novamente."));
        }
      })();
    },
  };

  const drawSheet: DrawSheetHandle = createDrawResultSheet({
    onView: (l) => viewModal.open(l),
    onRedraw: () => runDraw(),
  });

  const drawFilterSheet = createDrawFilterSheet({
    getPool: () => filterLinksByCategory(visibleListLinks(links), categoryFilter),
    onDraw: () => runDraw(),
  });

  const deckScreen: DeckHandle = createDeckScreen({
    onWant: (l) => void wantLink(l),
    onSkip: () => undefined,
    onMarkDone: (l) => void markDone(l),
    onWantAgain: (l) => void wantAgain(l),
    onClose: () => undefined,
  });

  document.body.append(
    loginModal.element,
    formModal.element,
    deleteSheet.element,
    viewModal.element,
    visitMode.element,
    scheduleSheet.element,
    reviewSheet.element,
    planSheet.element,
    drawFilterSheet.element,
    drawSheet.element,
    deckScreen.element
  );

  function runDraw(): void {
    const categoryPool = filterLinksByCategory(visibleListLinks(links), categoryFilter);
    const pool = applyDrawFilters(categoryPool, drawFilterSheet.getFilters());
    if (pool.length === 0) {
      drawSheet.openEmpty(
        hasActiveDrawFilters(drawFilterSheet.getFilters())
          ? "Nenhuma experiência com esses filtros para sortear."
          : categoryFilter.length > 0
            ? "Nenhuma experiência nas categorias filtradas para sortear."
            : "Cadastre ao menos uma experiência para sortear."
      );
      return;
    }
    const picked = pickRandomItem(pool);
    if (!picked) {
      drawSheet.openEmpty("Não foi possível sortear. Tente de novo.");
      return;
    }
    drawSheet.open(picked, pool);
  }

  // --- persistence helpers ---
  async function submitCreate(values: LinkFormValues): Promise<void> {
    const nextOrder = nextSortOrder(links);
    const created = await repo.createLink(toCreateInput(values, nextOrder));
    links = sortLinks([...links, created]);
    renderList();
    deckScreen.refresh(links);
  }

  async function submitEdit(id: string, values: LinkFormValues): Promise<void> {
    const patch = toUpdatePatch(values);
    await saveLink(id, patch);
    links = links.map((l) => (l.id === id ? { ...l, ...patch } : l));
    links = sortLinks(links);
    renderList();
    deckScreen.refresh(links);
  }

  async function deleteLink(link: LinkRow): Promise<void> {
    deleteSheet.open(link.label, async () => {
      try {
        await repo.deleteLink(link.id);
        links = sortLinks(links.filter((l) => l.id !== link.id));
        renderList();
        deckScreen.refresh(links);
      } catch (err) {
        await reloadFromServer(messageOf(err, GENERIC_ERROR));
      }
    });
  }

  async function markDone(link: LinkRow): Promise<void> {
    deckScreen.setBusy(true);
    try {
      const completed_at = new Date().toISOString();
      await saveLink(link.id, { status: "done", completed_at });
      links = sortLinks(
        links.map((row) =>
          row.id === link.id
            ? { ...row, status: "done" as const, completed_at }
            : row
        )
      );
      renderList();
      deckScreen.refresh(links);
      const done = findLink(link.id);
      if (done) openReview(done, "after-done");
    } catch (err) {
      await reloadFromServer(messageOf(err, GENERIC_ERROR));
    } finally {
      deckScreen.setBusy(false);
    }
  }

  /** Back to the wishlist. Only status/completed_at change: "Como foi" is kept. */
  async function unmarkDone(link: LinkRow): Promise<void> {
    deckScreen.setBusy(true);
    try {
      await saveLink(link.id, { ...UNMARK_DONE_PATCH });
      links = sortLinks(
        links.map((row) => (row.id === link.id ? { ...row, ...UNMARK_DONE_PATCH } : row))
      );
      renderList();
      deckScreen.refresh(links);
    } catch (err) {
      await reloadFromServer(messageOf(err, GENERIC_ERROR));
    } finally {
      deckScreen.setBusy(false);
    }
  }

  /**
   * "Como foi" sheet. After marking done it can be skipped (nothing is saved);
   * from the detail ("edit") the detail comes back when the sheet closes.
   */
  function openReview(link: LinkRow, mode: "after-done" | "edit"): void {
    const reopenDetail = (): void => {
      if (mode !== "edit") return;
      const current = findLink(link.id);
      if (current) viewModal.open(current);
    };
    reviewSheet.open({
      label: displayTitle(link),
      mode,
      initial: reviewFromLink(link),
      onSkip: reopenDetail,
      onSave: async (values) => {
        const problem = reviewError(values);
        if (problem) {
          reviewSheet.setError(problem);
          return;
        }
        reviewSheet.setBusy(true);
        try {
          const patch = reviewToPatch(values);
          await saveLink(link.id, patch);
          links = sortLinks(links.map((row) => (row.id === link.id ? { ...row, ...patch } : row)));
          renderList();
          deckScreen.refresh(links);
          reviewSheet.close();
          reopenDetail();
        } catch (err) {
          reviewSheet.setError(messageOf(err, GENERIC_ERROR));
        } finally {
          reviewSheet.setBusy(false);
        }
      },
    });
  }

  /** "Plano do passeio" sheet, opened from the detail; the detail comes back when it closes. */
  function openPlan(link: LinkRow, proposed?: readonly DraftPlanItem[]): void {
    const reopenDetail = (): void => {
      const current = findLink(link.id);
      if (current) viewModal.open(current);
    };
    const current = planFromLink(link);
    planSheet.open({
      label: displayTitle(link),
      initial: proposed
        ? { ...current, items: mergeProposedPlanItems(current.items, proposed) }
        : current,
      onSkip: proposed ? () => undefined : reopenDetail,
      onSave: async (values) => {
        const problem = planError(values.items);
        if (problem) {
          planSheet.setError(problem);
          return;
        }
        planSheet.setBusy(true);
        try {
          const patch = planToPatch(values);
          // Conditioned on the updated_at we loaded: a participant may have ticked meanwhile.
          const loaded = findLink(link.id) ?? link;
          const saved = await repo.updateLinkIfUnchanged(link.id, patch, loaded.updated_at);
          if (saved === null) {
            // Nothing is overwritten: show the fresh plan (the editor's edits in the sheet are replaced, and told so).
            const fresh = await adoptServerRow(link.id);
            if (fresh) {
              renderList();
              deckScreen.refresh(links);
              openPlan(fresh);
              planSheet.setError(PLAN_STALE_NOTICE);
            } else {
              planSheet.setError(PLAN_SAVE_ERROR);
            }
            return;
          }
          links = sortLinks(
            links.map((row) =>
              row.id === link.id ? { ...row, ...patch, updated_at: saved.updated_at ?? row.updated_at } : row
            )
          );
          renderList();
          deckScreen.refresh(links);
          planSheet.close();
          reopenDetail();
        } catch {
          planSheet.setError(PLAN_SAVE_ERROR);
        } finally {
          planSheet.setBusy(false);
        }
      },
    });
  }

  async function wantLink(link: LinkRow): Promise<void> {
    deckScreen.setBusy(true);
    try {
      const priority = nextPriority(links.filter((l) => l.status !== "done"));
      await saveLink(link.id, { priority });
      links = sortLinks(
        links.map((row) => (row.id === link.id ? { ...row, priority } : row))
      );
      renderList();
      deckScreen.refresh(links);
    } catch (err) {
      await reloadFromServer(messageOf(err, GENERIC_ERROR));
    } finally {
      deckScreen.setBusy(false);
    }
  }

  async function wantAgain(link: LinkRow): Promise<void> {
    deckScreen.setBusy(true);
    try {
      await saveLink(link.id, { want_again: true });
      links = sortLinks(
        links.map((row) =>
          row.id === link.id ? { ...row, want_again: true } : row
        )
      );
      renderList();
      deckScreen.refresh(links);
    } catch (err) {
      await reloadFromServer(messageOf(err, GENERIC_ERROR));
    } finally {
      deckScreen.setBusy(false);
    }
  }

  /** Same as repo.updateLink, and keeps the loaded updated_at in step with the server. */
  async function saveLink(id: string, patch: UpdateLinkPatch): Promise<void> {
    const updatedAt = await repo.updateLink(id, patch);
    if (updatedAt) links = links.map((row) => (row.id === id ? { ...row, updated_at: updatedAt } : row));
  }

  /** Refetches one row and replaces it in `links`; null when it no longer exists. */
  async function adoptServerRow(id: string): Promise<LinkRow | null> {
    const fresh = await repo.getLink(id);
    if (fresh) links = sortLinks(links.map((row) => (row.id === id ? fresh : row)));
    return fresh;
  }

  /**
   * Turning the link on/off/rotating it updates the row, so its updated_at moved. Take the
   * fresh row (and show it) so the next tick is checked against what the server really has.
   */
  async function resyncAfterShareChange(id: string): Promise<void> {
    try {
      const fresh = await adoptServerRow(id);
      if (fresh) {
        viewModal.refresh(fresh);
        visitMode.refresh(fresh);
      }
    } catch {
      // the next plan save will notice the difference and reload
    }
  }

  /**
   * Back on the page (tab visible again / restored from cache): the open detail
   * shows what participants ticked through the plan link meanwhile.
   */
  async function refreshOpenDetail(): Promise<void> {
    const id = viewModal.currentId() ?? visitMode.currentId();
    if (!authenticated || !id) return;
    try {
      const fresh = await adoptServerRow(id);
      if (fresh && (viewModal.currentId() === id || visitMode.currentId() === id)) {
        viewModal.refresh(fresh);
        visitMode.refresh(fresh);
        renderList();
        deckScreen.refresh(links);
      }
    } catch {
      // keep what is on screen
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshOpenDetail();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void refreshOpenDetail();
  });

  function findLink(id: string): LinkRow | undefined {
    return links.find((l) => l.id === id);
  }

  function downloadScheduleIcs(link: LinkRow): void {
    if (!link.scheduled_start || !link.scheduled_end) return;
    const ics = buildIcs({
      uid: `${link.id}@railanepassos.tec.br`,
      title: link.label,
      description: link.description,
      url: link.url,
      startIso: link.scheduled_start,
      endIso: link.scheduled_end,
    });
    downloadIcs(icsFilename(link), ics);
  }

  function openSchedule(link: LinkRow): void {
    const previousStart = link.scheduled_start;
    const previousEnd = link.scheduled_end;
    const hasSchedule = Boolean(previousStart && previousEnd);
    const initial = hasSchedule
      ? {
          date: splitScheduleLocal(previousStart!).date,
          startTime: splitScheduleLocal(previousStart!).time,
          endTime: splitScheduleLocal(previousEnd!).time,
        }
      : {
          date: "",
          startTime: DEFAULT_START_TIME,
          endTime: DEFAULT_END_TIME,
        };

    scheduleSheet.open({
      title: "Agendar experiência",
      initial,
      hasSchedule,
      onDownloadIcs: () => {
        const current = findLink(link.id) ?? link;
        downloadScheduleIcs(current);
      },
      onRemove: async () => {
        scheduleSheet.setBusy(true);
        try {
          await saveLink(link.id, {
            scheduled_start: null,
            scheduled_end: null,
          });
          links = sortLinks(
            links.map((row) =>
              row.id === link.id
                ? { ...row, scheduled_start: null, scheduled_end: null }
                : row
            )
          );
          renderList();
          scheduleSheet.close();
          const updated = findLink(link.id);
          if (updated) viewModal.open(updated);
        } catch (err) {
          scheduleSheet.setError(messageOf(err, GENERIC_ERROR));
        } finally {
          scheduleSheet.setBusy(false);
        }
      },
      onSave: async (values) => {
        scheduleSheet.setBusy(true);
        try {
          let startIso: string;
          let endIso: string;
          try {
            startIso = buildScheduleIso(values.date, values.startTime);
            endIso = buildScheduleIso(values.date, values.endTime);
          } catch {
            scheduleSheet.setError("Data ou horário inválido.");
            return;
          }
          const scheduleError = validateScheduleRange(startIso, endIso);
          if (scheduleError) {
            scheduleSheet.setError(scheduleError);
            return;
          }
          const undoStart = findLink(link.id)?.scheduled_start ?? previousStart;
          const undoEnd = findLink(link.id)?.scheduled_end ?? previousEnd;

          await saveLink(link.id, {
            scheduled_start: startIso,
            scheduled_end: endIso,
          });
          links = sortLinks(
            links.map((row) =>
              row.id === link.id
                ? { ...row, scheduled_start: startIso, scheduled_end: endIso }
                : row
            )
          );
          renderList();
          scheduleSheet.setHasSchedule(true);
          scheduleSheet.showSuccess("Agendamento salvo.", async () => {
            scheduleSheet.setBusy(true);
            try {
              await saveLink(link.id, {
                scheduled_start: undoStart,
                scheduled_end: undoEnd,
              });
              links = sortLinks(
                links.map((row) =>
                  row.id === link.id
                    ? {
                        ...row,
                        scheduled_start: undoStart,
                        scheduled_end: undoEnd,
                      }
                    : row
                )
              );
              renderList();
              openSchedule(findLink(link.id) ?? {
                ...link,
                scheduled_start: undoStart,
                scheduled_end: undoEnd,
              });
            } catch (err) {
              scheduleSheet.setError(messageOf(err, GENERIC_ERROR));
            } finally {
              scheduleSheet.setBusy(false);
            }
          });
        } catch (err) {
          scheduleSheet.setError(messageOf(err, GENERIC_ERROR));
        } finally {
          scheduleSheet.setBusy(false);
        }
      },
    });
  }

  async function reloadFromServer(errorText: string): Promise<void> {
    try {
      links = sortLinks(await repo.listLinks());
    } catch {
      // keep last known state
    }
    renderList();
    renderMessage(els.list, errorText);
  }

  // --- rendering ---
  function setShellVisible(visible: boolean): void {
    document.body.classList.toggle("links-authed", visible);
    for (const el of [els.sideNav, els.chips, els.heading, els.tabBar]) {
      if (el) el.hidden = !visible;
    }
  }

  function renderAdminRoot(): void {
    els.adminRoot.replaceChildren();
    if (authenticated) {
      els.adminRoot.appendChild(createAppBarActions(shellHandlers, els.appBar));
    } else {
      query = "";
      els.appBar?.classList.remove("links-appbar--searching");
      els.adminRoot.appendChild(createLoginButton(() => loginModal.open()));
    }
  }

  function syncSelectedCard(): void {
    const selected = viewModal.currentId();
    for (const card of els.list.querySelectorAll<HTMLElement>(".feed-card")) {
      card.classList.toggle("feed-card--selected", card.dataset.id === selected);
    }
  }

  function renderChrome(sectionLinks: LinkRow[], visibleCount: number): void {
    const state: ShellState = {
      section,
      categories: categoryFilter,
      sectionCounts: sectionCounts(links),
      categoryCounts: categoryCounts(sectionLinks),
    };
    if (els.chips) renderChips(els.chips, state, shellHandlers);
    if (els.sideNav) renderSideNav(els.sideNav, state, shellHandlers);
    if (els.tabBar) renderTabBar(els.tabBar, state, shellHandlers);
    if (els.heading) {
      els.heading.replaceChildren();
      const h = document.createElement("h2");
      h.className = "links-app__heading-title";
      h.textContent = SECTION_TITLES[section];
      const count = document.createElement("span");
      count.className = "links-app__heading-count";
      count.textContent = `${visibleCount} ${visibleCount === 1 ? "lugar" : "lugares"}`;
      els.heading.append(h, count);
    }
  }

  /** Sets the search text, mirrors it into the search input and re-renders. */
  function setQuery(next: string, scrollTop = false): void {
    query = next;
    const input = document.getElementById("links-search-input");
    if (input instanceof HTMLInputElement && input.value !== next) input.value = next;
    renderList();
    if (scrollTop) window.scrollTo({ top: 0 });
  }

  function toggleTagFilter(tag: string): void {
    setQuery(toggleFilter(query, "tag", tag), true);
  }

  function togglePeopleFilter(person: string): void {
    setQuery(toggleFilter(query, "person", person), true);
  }

  /** Active structured filters (#tag, @pessoa, cidade:, custo<) as removable chips (null when none). */
  function renderFilterBar(): HTMLElement | null {
    const chips = parseQuery(query).chips;
    if (chips.length === 0) return null;
    const bar = document.createElement("div");
    bar.className = "links-tagfilter";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Filtros ativos");
    for (const filter of chips) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "links-chip links-chip--active links-tagfilter__chip";
      chip.setAttribute("aria-label", `Remover filtro ${filter.label}`);
      chip.textContent = `${filter.label} ×`;
      chip.addEventListener("click", () => setQuery(removeChip(query, filter)));
      bar.appendChild(chip);
    }
    return bar;
  }

  function emptyText(): string {
    if (query.trim().length > 0) return "Nada encontrado para essa busca.";
    if (categoryFilter.length > 0) return "Nenhuma experiência nas categorias selecionadas.";
    if (section === "agenda") return "Nada agendado ainda. Use Agendar em um card.";
    if (section === "done") return "Nenhuma experiência marcada como feita ainda.";
    if (section === "memories") return "Nenhuma memória ainda.";
    return "Nenhuma experiência ainda.";
  }

  /**
   * The draft notice survives the automatic re-renders of boot (the session is
   * loaded twice) but not the editor's next action: the first interaction
   * clears it, so the render that follows starts clean.
   */
  let draftNoticeArmed = false;
  const NOTICE_CLEAR_EVENTS = ["pointerdown", "keydown", "input"];
  function clearDraftNotice(): void {
    draftNotice = null;
    draftNoticeArmed = false;
    for (const type of NOTICE_CLEAR_EVENTS) document.removeEventListener(type, clearDraftNotice, true);
  }
  function showDraftNotice(): void {
    if (!draftNotice) return;
    renderMessage(els.list, draftNotice);
    if (draftNoticeArmed) return;
    draftNoticeArmed = true;
    for (const type of NOTICE_CLEAR_EVENTS) document.addEventListener(type, clearDraftNotice, true);
  }

  function renderList(): void {
    els.list.replaceChildren();
    if (!authenticated) {
      setShellVisible(false);
      renderGuestGate(els.list);
      if (notice) {
        renderMessage(els.list, notice);
      }
      showDraftNotice();
      return;
    }
    setShellVisible(true);
    const parsed = parseQuery(query);
    let sectionLinks = linksForSection(links, section).filter((l) => matches(l, parsed));
    let doneToolbar: HTMLElement | null = null;
    if (section === "done") {
      sectionLinks = filterDone(sectionLinks, { wantAgain: doneWantAgain });
      if (doneRanking) sectionLinks = rankDone(sectionLinks);
      doneToolbar =
        renderDoneToolbar(
          { ranking: doneRanking, wantAgain: doneWantAgain, minRating: parsed.minRating },
          {
            onRanking: (on) => {
              doneRanking = on;
              renderList();
            },
            onWantAgain: (on) => {
              doneWantAgain = on;
              renderList();
            },
            onMinRating: (min) => setQuery(setMinRating(query, min)),
          }
        );
    }
    const visible = filterLinksByCategory(sectionLinks, categoryFilter);
    renderChrome(sectionLinks, visible.length);
    const selected = viewModal.currentId();
    if (section === "done" || section === "memories") {
      els.list.appendChild(
        renderMemoriesSwitch(section, {
          onList: () => shellHandlers.onSection("done"),
          onMemories: () => shellHandlers.onSection("memories"),
        })
      );
    }
    if (doneToolbar) els.list.appendChild(doneToolbar);
    if (section !== "done" && section !== "memories") {
      const today = renderTodayBanner(links, new Date(), { onOpen: (l) => openVisit(l) });
      if (today) els.list.appendChild(today);
    }
    const filterBar = renderFilterBar();
    if (filterBar) els.list.appendChild(filterBar);
    const filtering = query.trim().length > 0 || categoryFilter.length > 0;
    if (section === "memories" && (visible.length > 0 || !filtering)) {
      els.list.appendChild(renderMemoriesTimeline(
          visible,
          { onView: (l) => viewModal.open(l) },
          new Date(),
          linksForSection(links, "done")
        ));
    } else if (visible.length === 0) {
      const empty = document.createElement("p");
      empty.className = "links-status";
      empty.textContent = emptyText();
      els.list.appendChild(empty);
    } else {
      visible.forEach((link) => {
        els.list.appendChild(
          renderAdminCard(
            link,
            {
              onView: (l) => viewModal.open(l),
              onEdit: (l) => formModal.openEdit(l),
              onDelete: (l) => void deleteLink(l),
              onMarkDone: (l) => void markDone(l),
              onUnmarkDone: (l) => void unmarkDone(l),
              onSchedule: (l) => openSchedule(l),
              onTag: (tag) => toggleTagFilter(tag),
              onPerson: (person) => togglePeopleFilter(person),
            },
            { selected: link.id === selected }
          )
        );
      });
    }
    if (notice) {
      renderMessage(els.list, notice);
    }
    showDraftNotice();
  }

  function render(): void {
    renderAdminRoot();
    renderList();
  }

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

  function handlePendingDraft(): void {
    const result = pendingDraft;
    if (!result) return;
    if (!result.ok) {
      pendingDraft = null;
      draftNotice = `Não foi possível abrir o rascunho: ${result.reason}`;
      renderList();
      return;
    }
    if (!authenticated) {
      loginModal.open();
      return;
    }
    pendingDraft = null;
    if (result.draft.kind === "novo") {
      formModal.openCreate(draftPrefill(result.draft.fields));
      return;
    }
    if (result.draft.kind === "fila") {
      draftQueue = [...result.draft.items];
      draftQueueTotal = draftQueue.length;
      openNextQueued();
      return;
    }
    const { id, plan } = result.draft;
    const fields = result.draft.fields ? draftPrefill(withoutEmptyProposals(result.draft.fields)) : undefined;
    const target = findLink(id);
    if (!target) {
      draftNotice = listLoadFailed
        ? "Não foi possível abrir o rascunho: a lista de itens não carregou. Recarregue a página e tente de novo."
        : "Não foi possível abrir o rascunho: o item não existe mais ou o id está errado.";
      renderList();
      return;
    }
    const hasPlan = plan !== undefined && plan.length > 0;
    if (fields && Object.keys(fields).length > 0) {
      planAfterSave = hasPlan ? { id, items: plan } : null;
      formModal.openEdit(target, fields);
    } else if (hasPlan) {
      openPlan(target, plan);
    }
  }

  // --- auth wiring: reload private list on every session change ---
  auth.onAuthStateChange((_event, session) => {
    void (async () => {
      authenticated = session != null;
      if (authenticated) {
        try {
          links = sortLinks(await repo.listLinks());
          notice = null;
          listLoadFailed = false;
        } catch {
          links = [];
          listLoadFailed = true;
          notice =
            "Não foi possível carregar links do Supabase. Confira a migration e a chave anon.";
        }
      } else {
        links = [];
        // Private data must not stay on screen after sign-out (also clears #visita/<id>).
        visitMode.close();
      }
      render();
      handlePendingDraft();
      handlePendingShare();
      handlePendingVisit();
    })();
  });

  // Initial paint reflects whatever session may already be restored.
  void (async () => {
    try {
      const session = await auth.getSession();
      authenticated = session != null;
      if (authenticated) {
        try {
          links = sortLinks(await repo.listLinks());
          notice = null;
          listLoadFailed = false;
        } catch {
          links = [];
          listLoadFailed = true;
          notice =
            "Não foi possível carregar links do Supabase. Confira a migration e a chave anon.";
        }
      } else {
        links = [];
      }
    } catch {
      authenticated = false;
      links = [];
    }
    render();
    handlePendingDraft();
    handlePendingShare();
    handlePendingVisit();
  })();

  // Paint immediately with guest gate while the session check resolves.
  render();
}

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

async function boot(): Promise<void> {
  // Public plan link: decided FIRST, before any auth/session code below runs.
  // That path never creates a supabase client nor reads the auth storage.
  if (isPlanShareFragment(window.location.hash)) {
    await bootSharedPlan(window.location.hash);
    return;
  }

  takeDraftFromUrl();

  const els = getEls();
  if (!els) return;

  renderLoading(els);

  const config = getSupabaseConfig();
  const hasUrl = config.url.trim().length > 0;
  const hasKey = config.anonKey.trim().length > 0;

  if (hasUrl && hasKey && !isBrowserSafeAnonKey(config.anonKey)) {
    bootStatic(els);
    renderMessage(
      els.list,
      "Config inválida: use a chave anon/publishable no .env — não use sb_secret."
    );
    return;
  }

  if (!isSupabaseConfigured(config)) {
    bootStatic(els);
    return;
  }

  const client = createClient(config.url, config.anonKey, {
    auth: { storage: createAuthStorage() },
  });
  const auth = createAuth(client);
  const repo = createLinksRepo(client);

  let initialLinks: LinkRow[];
  try {
    initialLinks = await repo.listLinks();
  } catch {
    // Anonymous SELECT is denied by RLS — empty list until login.
    initialLinks = [];
  }

  bootDynamic(els, auth, repo, initialLinks);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void boot());
} else {
  void boot();
}
