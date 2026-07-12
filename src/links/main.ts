/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";
import { createAuth, type Auth } from "./auth";
import { createLinksRepo, type LinksRepo, type LinkRow } from "./links-repo";
import { applyReorder } from "./reorder";
import { FALLBACK_LINKS, renderPublicList } from "./render";
import {
  createLoginButton,
  createLoginModal,
  createToolbar,
  createLinkFormModal,
  renderAdminCard,
  toCreateInput,
  toUpdatePatch,
  type LoginModalHandle,
  type LinkFormHandle,
  type LinkFormValues,
} from "./admin-ui";

/**
 * Bootstrap for the dynamic links page.
 *
 * States:
 *   Carregando  -> #links-list shows a neutral loading message.
 *   Público     -> #links-list shows public cards; "Entrar" button in
 *                  #links-admin-root (only when Supabase is configured).
 *   Autenticado -> toolbar in #links-admin-root + admin cards in #links-list.
 *
 * Graceful degradation: if Supabase is not configured, or the initial
 * listLinks() throws, we render FALLBACK_LINKS and never show "Entrar" or any
 * admin affordance. This keeps the live page working before the Supabase
 * project exists.
 */

const LOADING_MESSAGE = "Carregando...";
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

function renderLoading(list: HTMLElement): void {
  list.replaceChildren();
  const msg = document.createElement("p");
  msg.className = "links-status";
  msg.textContent = LOADING_MESSAGE;
  list.appendChild(msg);
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
  initialLinks: LinkRow[]
): void {
  let links: LinkRow[] = sortLinks(initialLinks);
  let authenticated = false;
  let dragId: string | null = null;

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

  document.body.append(loginModal.element, formModal.element);

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
    if (!window.confirm(`Excluir "${link.label}"?`)) return;
    try {
      await repo.deleteLink(link.id);
      links = sortLinks(links.filter((l) => l.id !== link.id));
      renderList();
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
            await auth.signOut();
          }
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
      return;
    }
    links.forEach((link, index) => {
      els.list.appendChild(
        renderAdminCard(link, index, links.length, {
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
    const session = await auth.getSession();
    authenticated = session != null;
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

  renderLoading(els.list);

  const config = getSupabaseConfig();
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
    bootStatic(els);
    return;
  }

  bootDynamic(els, auth, repo, initialLinks);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void boot());
} else {
  void boot();
}
