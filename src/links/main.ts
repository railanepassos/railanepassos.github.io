/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig, isSupabaseConfigured, isBrowserSafeAnonKey } from "./config";
import { createAuth, type Auth } from "./auth";
import { createLinksRepo, type LinksRepo, type LinkRow } from "./links-repo";
import { renderGuestGate } from "./render";
import { renderLinksSkeleton, renderToolbarSkeleton } from "./skeleton";
import {
  createLoginButton,
  createLoginModal,
  createToolbar,
  createLinkFormModal,
  createDeleteConfirmSheet,
  createViewModal,
  createCategoryFilterSheet,
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
  type CategoryFilterHandle,
  type DrawSheetHandle,
  type ScheduleSheetHandle,
} from "./admin-ui";
import { filterLinksByCategory, type Category } from "./category";
import { pickRandomItem } from "./pick-random";
import { sortLinksForDisplay, visibleListLinks } from "./sort-links";
import { buildIcs, downloadIcs } from "./ics";
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

const GENERIC_ERROR = "Algo deu errado. Tente novamente.";

type Els = {
  adminRoot: HTMLElement;
  list: HTMLElement;
};

function getEls(): Els | null {
  const adminRoot = document.getElementById("links-admin-root");
  const list = document.getElementById("links-list");
  if (!adminRoot || !list) return null;
  return { adminRoot, list };
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
  let categoryFilter: Category[] = [];
  let pendingSharedUrl: string | null = pickSharedUrl(
    new URLSearchParams(location.search)
  );

  // --- modals (created once, appended to <body>) ---
  const loginModal: LoginModalHandle = createLoginModal(async (email, password) => {
    loginModal.setBusy(true);
    try {
      await auth.signIn(email, password);
      loginModal.close();
    } catch (err) {
      loginModal.setError(messageOf(err, "E-mail ou senha inválidos."));
    } finally {
      loginModal.setBusy(false);
    }
  });

  const formModal: LinkFormHandle = createLinkFormModal(async (values, editingId) => {
    formModal.setBusy(true);
    try {
      if (editingId) {
        await submitEdit(editingId, values);
      } else {
        await submitCreate(values);
      }
      formModal.close();
    } catch (err) {
      formModal.setError(messageOf(err, GENERIC_ERROR));
    } finally {
      formModal.setBusy(false);
    }
  });

  const deleteSheet: DeleteSheetHandle = createDeleteConfirmSheet();
  const scheduleSheet: ScheduleSheetHandle = createScheduleSheet();
  const viewModal: ViewModalHandle = createViewModal({
    onEdit: (l) => formModal.openEdit(l),
    onSchedule: (l) => openSchedule(l),
    onMarkDone: (l) => void markDone(l),
  });
  const filterSheet: CategoryFilterHandle = createCategoryFilterSheet((cats) => {
    categoryFilter = cats;
    render();
  });

  const drawSheet: DrawSheetHandle = createDrawResultSheet({
    onView: (l) => viewModal.open(l),
    onRedraw: () => runDraw(),
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
    scheduleSheet.element,
    filterSheet.element,
    drawSheet.element,
    deckScreen.element
  );

  function runDraw(): void {
    const pool = filterLinksByCategory(visibleListLinks(links), categoryFilter);
    if (pool.length === 0) {
      drawSheet.openEmpty(
        categoryFilter.length > 0
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
    const nextOrder = links.length;
    const created = await repo.createLink(toCreateInput(values, nextOrder));
    links = sortLinks([...links, created]);
    renderList();
    deckScreen.refresh(links);
  }

  async function submitEdit(id: string, values: LinkFormValues): Promise<void> {
    const patch = toUpdatePatch(values);
    await repo.updateLink(id, patch);
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
      await repo.updateLink(link.id, { status: "done", completed_at });
      links = sortLinks(
        links.map((row) =>
          row.id === link.id
            ? { ...row, status: "done" as const, completed_at }
            : row
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

  async function wantLink(link: LinkRow): Promise<void> {
    deckScreen.setBusy(true);
    try {
      const priority = nextPriority(links.filter((l) => l.status !== "done"));
      await repo.updateLink(link.id, { priority });
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
      await repo.updateLink(link.id, { want_again: true });
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
          await repo.updateLink(link.id, {
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

          await repo.updateLink(link.id, {
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
              await repo.updateLink(link.id, {
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
  function renderAdminRoot(): void {
    els.adminRoot.replaceChildren();
    if (authenticated) {
      els.adminRoot.appendChild(
        createToolbar(
          () => formModal.openCreate(),
          async () => {
            try {
              await auth.signOut();
            } catch (err) {
              renderMessage(els.list, messageOf(err, "Não foi possível sair. Tente novamente."));
            }
          },
          () => filterSheet.open(categoryFilter),
          () => runDraw(),
          () => deckScreen.open(links, "wishlist"),
          categoryFilter
        )
      );
    } else {
      els.adminRoot.appendChild(createLoginButton(() => loginModal.open()));
    }
  }

  function renderList(): void {
    els.list.replaceChildren();
    if (!authenticated) {
      renderGuestGate(els.list);
      if (notice) {
        renderMessage(els.list, notice);
      }
      return;
    }
    const listLinks = visibleListLinks(links);
    const visible = filterLinksByCategory(listLinks, categoryFilter);
    if (visible.length === 0) {
      const empty = document.createElement("p");
      empty.className = "links-status";
      empty.textContent =
        categoryFilter.length > 0
          ? "Nenhuma experiência nas categorias selecionadas."
          : "Nenhuma experiência ainda.";
      els.list.appendChild(empty);
    } else {
      visible.forEach((link) => {
        els.list.appendChild(
          renderAdminCard(link, {
            onView: (l) => viewModal.open(l),
            onEdit: (l) => formModal.openEdit(l),
            onDelete: (l) => void deleteLink(l),
          })
        );
      });
    }
    if (notice) {
      renderMessage(els.list, notice);
    }
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

  // --- auth wiring: reload private list on every session change ---
  auth.onAuthStateChange((_event, session) => {
    void (async () => {
      authenticated = session != null;
      if (authenticated) {
        try {
          links = sortLinks(await repo.listLinks());
          notice = null;
        } catch {
          links = [];
          notice =
            "Não foi possível carregar links do Supabase. Confira a migration e a chave anon.";
        }
      } else {
        links = [];
      }
      render();
      handlePendingShare();
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
        } catch {
          links = [];
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
    handlePendingShare();
  })();

  // Paint immediately with guest gate while the session check resolves.
  render();
}

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

async function boot(): Promise<void> {
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

  const client = createClient(config.url, config.anonKey);
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
