import type { LinkRow } from "./links-repo";
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  resolveCategory,
} from "./category";
import { categoryBackdropSrc, categoryCardClass } from "./card-theme";
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

const SWIPE_THRESHOLD = 88;

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

  const header = document.createElement("header");
  header.className = "links-admin-screen__header";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "links-admin-screen__back";
  closeBtn.textContent = "Voltar";

  const title = document.createElement("h2");
  title.id = "links-deck-title";
  title.className = "links-admin-modal__title links-admin-screen__title";
  title.textContent = "Deck";

  header.append(closeBtn, title);

  const tabs = document.createElement("div");
  tabs.className = "links-deck-screen__tabs";
  tabs.setAttribute("role", "tablist");

  const wishTab = document.createElement("button");
  wishTab.type = "button";
  wishTab.className = "links-deck-screen__tab";
  wishTab.setAttribute("role", "tab");
  wishTab.innerHTML = ""; // filled in syncTabs via textContent parts

  const wishTabLabel = document.createElement("span");
  wishTabLabel.textContent = "Wishlist";
  const wishCount = document.createElement("span");
  wishCount.className = "links-deck-screen__tab-count";
  wishTab.append(wishTabLabel, wishCount);

  const doneTab = document.createElement("button");
  doneTab.type = "button";
  doneTab.className = "links-deck-screen__tab";
  doneTab.setAttribute("role", "tab");
  const doneTabLabel = document.createElement("span");
  doneTabLabel.textContent = "Já feitas";
  const doneCount = document.createElement("span");
  doneCount.className = "links-deck-screen__tab-count";
  doneTab.append(doneTabLabel, doneCount);

  tabs.append(wishTab, doneTab);

  const progress = document.createElement("p");
  progress.className = "links-deck-screen__progress";
  progress.setAttribute("aria-live", "polite");

  const stage = document.createElement("div");
  stage.className = "links-deck-screen__stage";

  const stackPeek = document.createElement("div");
  stackPeek.className = "links-deck-screen__peek";
  stackPeek.setAttribute("aria-hidden", "true");

  const card = document.createElement("div");
  card.className = "links-deck-screen__card";
  card.setAttribute("aria-live", "polite");

  const stampSkip = document.createElement("span");
  stampSkip.className =
    "links-deck-screen__stamp links-deck-screen__stamp--skip";
  stampSkip.textContent = "Agora não";
  stampSkip.setAttribute("aria-hidden", "true");

  const stampWant = document.createElement("span");
  stampWant.className =
    "links-deck-screen__stamp links-deck-screen__stamp--want";
  stampWant.textContent = "Quero";
  stampWant.setAttribute("aria-hidden", "true");

  const cardBody = document.createElement("div");
  cardBody.className = "links-deck-screen__card-body";

  card.append(stampSkip, stampWant, cardBody);

  const empty = document.createElement("div");
  empty.className = "links-deck-screen__empty";
  empty.hidden = true;
  const emptyTitle = document.createElement("p");
  emptyTitle.className = "links-deck-screen__empty-title";
  const emptyHint = document.createElement("p");
  emptyHint.className = "links-deck-screen__empty-hint";
  empty.append(emptyTitle, emptyHint);

  stage.append(stackPeek, card, empty);

  const controls = document.createElement("div");
  controls.className = "links-deck-screen__controls";

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "links-deck-screen__btn links-deck-screen__btn--skip";
  const skipIcon = document.createElement("span");
  skipIcon.className = "links-deck-screen__btn-icon";
  skipIcon.textContent = "✕";
  const skipCaption = document.createElement("span");
  skipCaption.className = "links-deck-screen__btn-caption";
  skipCaption.textContent = "Agora não";
  skipBtn.append(skipIcon, skipCaption);
  skipBtn.setAttribute("aria-label", "Agora não");

  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "links-deck-screen__btn links-deck-screen__btn--done";
  const doneIcon = document.createElement("span");
  doneIcon.className = "links-deck-screen__btn-icon";
  doneIcon.textContent = "✓";
  const doneCaption = document.createElement("span");
  doneCaption.className = "links-deck-screen__btn-caption";
  doneCaption.textContent = "Já fiz";
  doneBtn.append(doneIcon, doneCaption);
  doneBtn.setAttribute("aria-label", "Marcar como feita");

  const wantBtn = document.createElement("button");
  wantBtn.type = "button";
  wantBtn.className = "links-deck-screen__btn links-deck-screen__btn--want";
  const wantIcon = document.createElement("span");
  wantIcon.className = "links-deck-screen__btn-icon";
  wantIcon.textContent = "♥";
  const wantCaption = document.createElement("span");
  wantCaption.className = "links-deck-screen__btn-caption";
  wantCaption.textContent = "Quero";
  wantBtn.append(wantIcon, wantCaption);
  wantBtn.setAttribute("aria-label", "Quero");

  controls.append(skipBtn, doneBtn, wantBtn);

  const hint = document.createElement("p");
  hint.className = "links-deck-screen__hint";

  dialog.append(header, tabs, progress, stage, controls, hint);
  overlay.appendChild(dialog);

  function current(): LinkRow | null {
    return queue[0] ?? null;
  }

  function tabTotal(next: DeckTab): number {
    return linksForDeck(allLinks, next).length;
  }

  function prefersKeyboardHints(): boolean {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: fine)").matches
    );
  }

  function syncTabs(): void {
    wishTab.classList.toggle("links-deck-screen__tab--active", tab === "wishlist");
    doneTab.classList.toggle("links-deck-screen__tab--active", tab === "done");
    wishTab.setAttribute("aria-selected", String(tab === "wishlist"));
    doneTab.setAttribute("aria-selected", String(tab === "done"));
    wishCount.textContent = String(tabTotal("wishlist"));
    doneCount.textContent = String(tabTotal("done"));
    doneBtn.hidden = tab !== "wishlist";
    stampWant.textContent = tab === "wishlist" ? "Quero" : "Repetir";
    wantCaption.textContent = tab === "wishlist" ? "Quero" : "Repetir";
    skipCaption.textContent = tab === "wishlist" ? "Agora não" : "Passar";
    if (prefersKeyboardHints()) {
      hint.textContent =
        tab === "wishlist"
          ? "Use as setas. D marca como feita."
          : "Use as setas ou deslize o card.";
    } else {
      hint.textContent = "Deslize o card ou use os botões.";
    }
    skipBtn.setAttribute(
      "aria-label",
      tab === "wishlist" ? "Agora não" : "Só passar"
    );
    wantBtn.setAttribute(
      "aria-label",
      tab === "wishlist" ? "Quero" : "Quer repetir"
    );
  }

  function syncProgress(): void {
    const total = tabTotal(tab);
    const left = queue.length;
    if (total === 0 || left === 0) {
      progress.textContent = "";
      progress.hidden = true;
      return;
    }
    progress.hidden = false;
    const seen = total - left + 1;
    progress.textContent = `${seen} de ${total}`;
  }

  function syncPeek(): void {
    stackPeek.hidden = queue.length < 2;
  }

  function paintCard(): void {
    cardBody.replaceChildren();
    card.classList.remove(
      "links-deck-screen__card--dragging",
      "links-deck-screen__card--lean-left",
      "links-deck-screen__card--lean-right"
    );
    card.style.removeProperty("--deck-drag-x");
    card.style.removeProperty("--deck-drag-rot");
    card.style.removeProperty("--deck-stamp-skip");
    card.style.removeProperty("--deck-stamp-want");
    for (const cat of CATEGORY_OPTIONS) {
      card.classList.remove(categoryCardClass(cat));
    }

    if (!current()) {
      card.hidden = true;
      empty.hidden = false;
      emptyTitle.textContent =
        tab === "wishlist" ? "Wishlist vazia" : "Nenhuma memória ainda";
      emptyHint.textContent =
        tab === "wishlist"
          ? "Adicione experiências na lista ou marque alguma como feita depois."
          : "Quando marcar uma experiência como feita, ela aparece aqui.";
      controls.hidden = true;
      syncProgress();
      syncPeek();
      return;
    }

    const link = current()!;
    empty.hidden = true;
    card.hidden = false;
    controls.hidden = false;

    const category = resolveCategory(link);
    card.classList.add(categoryCardClass(category));

    const media = document.createElement("div");
    media.className = "links-deck-screen__media";
    media.classList.add(categoryCardClass(category));

    const backdropSrc = categoryBackdropSrc(category, link.image_url);
    if (backdropSrc) {
      const img = document.createElement("img");
      img.className = "links-deck-screen__img";
      img.src = backdropSrc;
      img.alt = "";
      media.appendChild(img);
    } else {
      media.classList.add("links-deck-screen__media--fallback");
    }

    const scrim = document.createElement("span");
    scrim.className = "links-deck-screen__scrim";
    scrim.setAttribute("aria-hidden", "true");

    const meta = document.createElement("div");
    meta.className = "links-deck-screen__meta";

    const cat = document.createElement("p");
    cat.className = "links-deck-screen__category";
    cat.textContent = categoryLabel(category);

    const name = document.createElement("h3");
    name.className = "links-deck-screen__name";
    name.textContent = link.label;

    const blurb = document.createElement("p");
    blurb.className = "links-deck-screen__blurb";
    const text = (link.note || link.description || "").trim();
    if (text) blurb.textContent = text;
    else blurb.hidden = true;

    meta.append(cat, name, blurb);
    cardBody.append(media, scrim, meta);
    syncProgress();
    syncPeek();
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
    card.style.setProperty("--deck-drag-rot", `${dragX / 18}deg`);
    const want = Math.min(1, Math.max(0, dragX / SWIPE_THRESHOLD));
    const skip = Math.min(1, Math.max(0, -dragX / SWIPE_THRESHOLD));
    card.style.setProperty("--deck-stamp-want", String(want));
    card.style.setProperty("--deck-stamp-skip", String(skip));
    card.classList.toggle("links-deck-screen__card--lean-right", want > 0.35);
    card.classList.toggle("links-deck-screen__card--lean-left", skip > 0.35);
  }

  function endDrag(): void {
    card.classList.remove(
      "links-deck-screen__card--dragging",
      "links-deck-screen__card--lean-left",
      "links-deck-screen__card--lean-right"
    );
    card.style.removeProperty("--deck-drag-x");
    card.style.removeProperty("--deck-drag-rot");
    card.style.removeProperty("--deck-stamp-skip");
    card.style.removeProperty("--deck-stamp-want");
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
