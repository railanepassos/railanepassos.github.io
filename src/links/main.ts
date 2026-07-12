/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig, isSupabaseConfigured, isBrowserSafeAnonKey } from "./config";
import { createAuth, type Auth } from "./auth";
import { createLinksRepo, type LinksRepo, type LinkRow } from "./links-repo";
import { applyReorder } from "./reorder";
import { FALLBACK_LINKS, renderPublicList } from "./render";
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
import { buildIcs, downloadIcs } from "./ics";
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
 *   Público     -> #links-list shows public cards; "Entrar" button in
 *                  #links-admin-root (only when Supabase is configured).
 *   Autenticado -> toolbar in #links-admin-root + admin cards in #links-list.
 *
 * Graceful degradation: if Supabase is not configured, or the initial
 * listLinks() throws, we render FALLBACK_LINKS and never show "Entrar" or any
 * admin affordance. This keeps the live page working before the Supabase
 * project exists.
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
  return [...links].sort((a, b) => a.sort_order - b.sort_order);
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
 * Static-only mode: no Supabase, or initial load failed. Renders the fallback
 * list and nothing else.
 */
function bootStatic(els: Els): void {
  els.adminRoot.replaceChildren();
  renderPublicList(els.list, FALLBACK_LINKS);
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
  let dragId: string | null = null;
  let notice = warning ?? null;
  let categoryFilter: Category[] = [];

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
      downloadIcs(icsFilename(l), ics);
    },
    onClearSchedule: (l) => void clearSchedule(l),
  });
  const filterSheet: CategoryFilterHandle = createCategoryFilterSheet((cats) => {
    categoryFilter = cats;
    render();
  });

  const drawSheet: DrawSheetHandle = createDrawResultSheet({
    onView: (l) => viewModal.open(l),
    onRedraw: () => runDraw(),
  });

  document.body.append(
    loginModal.element,
    formModal.element,
    deleteSheet.element,
    viewModal.element,
    scheduleSheet.element,
    filterSheet.element,
    drawSheet.element
  );

  function runDraw(): void {
    const pool = filterLinksByCategory(links, categoryFilter);
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
  }

  async function submitEdit(id: string, values: LinkFormValues): Promise<void> {
    const patch = toUpdatePatch(values);
    await repo.updateLink(id, patch);
    links = links.map((l) => (l.id === id ? { ...l, ...patch } : l));
    renderList();
  }

  async function deleteLink(link: LinkRow): Promise<void> {
    deleteSheet.open(link.label, async () => {
      try {
        await repo.deleteLink(link.id);
        links = sortLinks(links.filter((l) => l.id !== link.id));
        renderList();
      } catch (err) {
        await reloadFromServer(messageOf(err, GENERIC_ERROR));
      }
    });
  }

  function findLink(id: string): LinkRow | undefined {
    return links.find((l) => l.id === id);
  }

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
      title: "Agendar experiência",
      initial,
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
          const updated = findLink(link.id);
          if (updated) viewModal.open(updated);
        } catch (err) {
          scheduleSheet.setError(messageOf(err, GENERIC_ERROR));
        } finally {
          scheduleSheet.setBusy(false);
        }
      },
    });
  }

  async function clearSchedule(link: LinkRow): Promise<void> {
    try {
      await repo.updateLink(link.id, {
        scheduled_start: null,
        scheduled_end: null,
      });
      links = links.map((row) =>
        row.id === link.id
          ? { ...row, scheduled_start: null, scheduled_end: null }
          : row
      );
      renderList();
      const updated = findLink(link.id);
      if (updated) viewModal.open(updated);
    } catch (err) {
      await reloadFromServer(messageOf(err, GENERIC_ERROR));
    }
  }

  async function move(link: LinkRow, direction: -1 | 1): Promise<void> {
    const current = links.findIndex((l) => l.id === link.id);
    if (current === -1) return;
    const target = current + direction;
    if (target < 0 || target >= links.length) return;
    await reorderTo(link.id, target);
  }

  async function reorderTo(movedId: string, targetIndex: number): Promise<void> {
    const previous = links;
    const reordered = applyReorder(links, movedId, targetIndex);
    links = sortLinks(reordered); // optimistic
    renderList();
    try {
      await repo.saveOrder(reordered.map((l) => ({ id: l.id, sort_order: l.sort_order })));
    } catch (err) {
      links = previous;
      await reloadFromServer(messageOf(err, "Não foi possível salvar a ordem."));
    }
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
      renderPublicList(els.list, links);
    } else {
      const visible = filterLinksByCategory(links, categoryFilter);
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
          const fullIndex = links.findIndex((l) => l.id === link.id);
          els.list.appendChild(
            renderAdminCard(link, fullIndex, links.length, {
              onView: (l) => viewModal.open(l),
              onEdit: (l) => formModal.openEdit(l),
              onDelete: (l) => void deleteLink(l),
              onMoveUp: (l) => void move(l, -1),
              onMoveDown: (l) => void move(l, 1),
              onDragStart: (l, ev) => {
                dragId = l.id;
                ev.dataTransfer?.setData("text/plain", l.id);
              },
              onDrop: (l) => {
                if (!dragId || dragId === l.id) return;
                const targetIndex = links.findIndex((x) => x.id === l.id);
                const moved = dragId;
                dragId = null;
                if (targetIndex !== -1) void reorderTo(moved, targetIndex);
              },
            })
          );
        });
      }
    }
    if (notice) {
      renderMessage(els.list, notice);
    }
  }

  function render(): void {
    renderAdminRoot();
    renderList();
  }

  // --- auth wiring: re-render affordances on every change ---
  auth.onAuthStateChange((_event, session) => {
    authenticated = session != null;
    render();
  });

  // Initial paint reflects whatever session may already be restored.
  void (async () => {
    try {
      const session = await auth.getSession();
      authenticated = session != null;
    } catch {
      authenticated = false;
    }
    render();
  })();

  // Paint immediately with public state while the session check resolves.
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
    bootDynamic(
      els,
      auth,
      repo,
      FALLBACK_LINKS,
      "Não foi possível carregar links do Supabase. Confira a migration e a chave anon."
    );
    return;
  }

  bootDynamic(els, auth, repo, initialLinks);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void boot());
} else {
  void boot();
}
