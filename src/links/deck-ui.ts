import type { LinkRow } from "./links-repo";
import { categoryLabel, resolveCategory } from "./category";
import { linksForDeck, skipFront, type DeckTab } from "./deck-queue";
import { syncBodyScreenLock } from "./screen-lock";

export type DeckHandlers = {
  onWant: (link: LinkRow) => void | Promise<void>;
  onSkip: () => void;
  onMarkDone: (link: LinkRow) => void | Promise<void>;
  onWantAgain: (link: LinkRow) => void | Promise<void>;
  onClose: () => void;
};

export type DeckHandle = {
  element: HTMLElement;
  open: (links: readonly LinkRow[], tab?: DeckTab) => void;
  close: () => void;
  setBusy: (busy: boolean) => void;
  /** Refresh queue from latest links without closing. */
  refresh: (links: readonly LinkRow[]) => void;
};

const SWIPE_THRESHOLD = 80;

export function createDeckScreen(handlers: DeckHandlers): DeckHandle {
  let tab: DeckTab = "wishlist";
  let allLinks: LinkRow[] = [];
  let queue: LinkRow[] = [];
  let busy = false;
  let dragX = 0;
  let pointerId: number | null = null;
  let startX = 0;

  const overlay = document.createElement("div");
  overlay.className = "links-admin-modal links-deck-screen";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "links-deck-title");

  const dialog = document.createElement("div");
  dialog.className = "links-admin-modal__dialog links-deck-screen__dialog";

  const header = document.createElement("div");
  header.className = "links-admin-modal__header";

  const title = document.createElement("h2");
  title.id = "links-deck-title";
  title.className = "links-admin-modal__title";
  title.textContent = "Deck";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "links-admin-modal__back";
  closeBtn.textContent = "Fechar";

  header.append(title, closeBtn);

  const tabs = document.createElement("div");
  tabs.className = "links-deck-screen__tabs";
  tabs.setAttribute("role", "tablist");

  const wishTab = document.createElement("button");
  wishTab.type = "button";
  wishTab.className = "links-deck-screen__tab";
  wishTab.setAttribute("role", "tab");
  wishTab.textContent = "Wishlist";

  const doneTab = document.createElement("button");
  doneTab.type = "button";
  doneTab.className = "links-deck-screen__tab";
  doneTab.setAttribute("role", "tab");
  doneTab.textContent = "Já feitas";

  tabs.append(wishTab, doneTab);

  const stage = document.createElement("div");
  stage.className = "links-deck-screen__stage";

  const card = document.createElement("div");
  card.className = "links-deck-screen__card";
  card.setAttribute("aria-live", "polite");

  const empty = document.createElement("p");
  empty.className = "links-deck-screen__empty";
  empty.hidden = true;

  stage.append(card, empty);

  const controls = document.createElement("div");
  controls.className = "links-deck-screen__controls";

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "links-deck-screen__btn links-deck-screen__btn--skip";
  skipBtn.setAttribute("aria-label", "Agora não");
  skipBtn.textContent = "✕";

  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "links-deck-screen__btn links-deck-screen__btn--done";
  doneBtn.textContent = "Já fiz";

  const wantBtn = document.createElement("button");
  wantBtn.type = "button";
  wantBtn.className = "links-deck-screen__btn links-deck-screen__btn--want";
  wantBtn.setAttribute("aria-label", "Quero");
  wantBtn.textContent = "♥";

  controls.append(skipBtn, doneBtn, wantBtn);

  const hint = document.createElement("p");
  hint.className = "links-deck-screen__hint";

  dialog.append(header, tabs, stage, controls, hint);
  overlay.appendChild(dialog);

  function current(): LinkRow | null {
    return queue[0] ?? null;
  }

  function syncTabs(): void {
    wishTab.classList.toggle("links-deck-screen__tab--active", tab === "wishlist");
    doneTab.classList.toggle("links-deck-screen__tab--active", tab === "done");
    wishTab.setAttribute("aria-selected", String(tab === "wishlist"));
    doneTab.setAttribute("aria-selected", String(tab === "done"));
    doneBtn.hidden = tab !== "wishlist";
    hint.textContent =
      tab === "wishlist"
        ? "← Agora não · Quero → · Já fiz"
        : "← Passar · Quer repetir →";
    skipBtn.setAttribute(
      "aria-label",
      tab === "wishlist" ? "Agora não" : "Só passar"
    );
    wantBtn.setAttribute(
      "aria-label",
      tab === "wishlist" ? "Quero" : "Quer repetir"
    );
  }

  function paintCard(): void {
    const link = current();
    card.replaceChildren();
    card.classList.remove("links-deck-screen__card--dragging");
    card.style.removeProperty("--deck-drag-x");
    card.style.removeProperty("--deck-drag-rot");

    if (!link) {
      card.hidden = true;
      empty.hidden = false;
      empty.textContent =
        tab === "wishlist"
          ? "Nada na wishlist."
          : "Nenhuma experiência marcada como feita.";
      controls.hidden = true;
      return;
    }

    empty.hidden = true;
    card.hidden = false;
    controls.hidden = false;

    const media = document.createElement("div");
    media.className = "links-deck-screen__media";
    if (link.image_url) {
      const img = document.createElement("img");
      img.className = "links-deck-screen__img";
      img.src = link.image_url;
      img.alt = "";
      media.appendChild(img);
    } else {
      media.classList.add("links-deck-screen__media--fallback");
    }

    const meta = document.createElement("div");
    meta.className = "links-deck-screen__meta";

    const cat = document.createElement("p");
    cat.className = "links-deck-screen__category";
    cat.textContent = categoryLabel(resolveCategory(link));

    const name = document.createElement("h3");
    name.className = "links-deck-screen__name";
    name.textContent = link.label;

    const blurb = document.createElement("p");
    blurb.className = "links-deck-screen__blurb";
    const text = (link.note || link.description || "").trim();
    if (text) blurb.textContent = text;
    else blurb.hidden = true;

    meta.append(cat, name, blurb);
    card.append(media, meta);
  }

  function rebuildQueue(): void {
    queue = linksForDeck(allLinks, tab);
    syncTabs();
    paintCard();
  }

  /** Keep session order; drop items that left this tab. */
  function softRefresh(links: readonly LinkRow[]): void {
    allLinks = [...links];
    const byId = new Map(allLinks.map((l) => [l.id, l]));
    queue = queue
      .map((q) => byId.get(q.id))
      .filter((l): l is LinkRow => Boolean(l) && (l.status ?? "wishlist") === tab);
    syncTabs();
    paintCard();
  }

  function advancePast(id: string): void {
    queue = queue.filter((l) => l.id !== id);
    paintCard();
  }

  function close(): void {
    overlay.hidden = true;
    queue = [];
    allLinks = [];
    syncBodyScreenLock();
    handlers.onClose();
  }

  function open(links: readonly LinkRow[], nextTab: DeckTab = "wishlist"): void {
    allLinks = [...links];
    tab = nextTab;
    rebuildQueue();
    overlay.hidden = false;
    syncBodyScreenLock();
    closeBtn.focus();
  }

  function refresh(links: readonly LinkRow[]): void {
    softRefresh(links);
  }

  function setBusy(next: boolean): void {
    busy = next;
    dialog.classList.toggle("links-admin-modal__dialog--busy", busy);
    skipBtn.disabled = busy;
    doneBtn.disabled = busy;
    wantBtn.disabled = busy;
  }

  async function actWant(): Promise<void> {
    const link = current();
    if (!link || busy) return;
    if (tab === "wishlist") await handlers.onWant(link);
    else await handlers.onWantAgain(link);
    advancePast(link.id);
  }

  async function actDone(): Promise<void> {
    const link = current();
    if (!link || busy || tab !== "wishlist") return;
    await handlers.onMarkDone(link);
    advancePast(link.id);
  }

  function actSkip(): void {
    if (!current() || busy) return;
    queue = skipFront(queue);
    paintCard();
    handlers.onSkip();
  }

  function applyDragVisual(): void {
    card.classList.add("links-deck-screen__card--dragging");
    card.style.setProperty("--deck-drag-x", `${dragX}px`);
    card.style.setProperty("--deck-drag-rot", `${dragX / 20}deg`);
  }

  function endDrag(): void {
    card.classList.remove("links-deck-screen__card--dragging");
    card.style.removeProperty("--deck-drag-x");
    card.style.removeProperty("--deck-drag-rot");
    const dx = dragX;
    dragX = 0;
    pointerId = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD) {
      paintCard();
      return;
    }
    if (dx > 0) void actWant();
    else actSkip();
  }

  card.addEventListener("pointerdown", (e) => {
    if (busy || !current() || e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    dragX = 0;
    card.setPointerCapture(e.pointerId);
  });

  card.addEventListener("pointermove", (e) => {
    if (pointerId !== e.pointerId) return;
    dragX = e.clientX - startX;
    applyDragVisual();
  });

  card.addEventListener("pointerup", (e) => {
    if (pointerId !== e.pointerId) return;
    endDrag();
  });

  card.addEventListener("pointercancel", (e) => {
    if (pointerId !== e.pointerId) return;
    dragX = 0;
    pointerId = null;
    paintCard();
  });

  wishTab.addEventListener("click", () => {
    if (tab === "wishlist") return;
    tab = "wishlist";
    rebuildQueue();
  });
  doneTab.addEventListener("click", () => {
    if (tab === "done") return;
    tab = "done";
    rebuildQueue();
  });

  skipBtn.addEventListener("click", () => actSkip());
  doneBtn.addEventListener("click", () => void actDone());
  wantBtn.addEventListener("click", () => void actWant());
  closeBtn.addEventListener("click", close);

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (busy) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      actSkip();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      void actWant();
    } else if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      void actDone();
    }
  });

  return { element: overlay, open, close, setBusy, refresh };
}
