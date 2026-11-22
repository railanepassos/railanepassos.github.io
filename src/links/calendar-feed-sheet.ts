import { createScreenChrome } from "./admin-ui";
import {
  calendarFeedUrl,
  googleSubscribeUrl,
  type CalendarFeedState,
} from "./calendar-feed";
import { syncBodyScreenLock } from "./screen-lock";
import { setScreenBusy } from "./skeleton";

/**
 * "Agenda no Google" sheet (Phase 10): the editor turns the subscription feed on,
 * copies its link, opens Google Agenda's "add by URL" page, rotates or turns it
 * off. Same pattern as the plan share link: the token comes from the server, the
 * sheet only shows and copies it. Pure DOM, no innerHTML (CSP).
 */

export type CalendarFeedSheetDeps = {
  supabaseUrl: string;
  load: () => Promise<CalendarFeedState>;
  /** Turn on or rotate; resolves with the new token. */
  enable: () => Promise<string>;
  disable: () => Promise<void>;
};

export type CalendarFeedSheetHandle = {
  element: HTMLElement;
  open: () => void;
  close: () => void;
};

const OFF_HINT =
  "Desligada: o Google Agenda não vê seus passeios. Ligue para assinar a agenda e ver as datas atualizadas sozinhas.";
const ON_HINT =
  "Ligada: quem tiver este link vê nomes, datas, endereços e links dos lugares agendados, sem login. O Google Agenda atualiza a cada poucas horas. Se o link vazar, use Trocar link.";

export function createCalendarFeedSheet(deps: CalendarFeedSheetDeps): CalendarFeedSheetHandle {
  let previouslyFocused: HTMLElement | null = null;
  let state: CalendarFeedState = { enabled: false, token: null };
  let loaded = false;

  const { overlay, dialog, backBtn } = createScreenChrome(
    "links-feed-title",
    "Agenda no Google",
    "dialog"
  );
  overlay.hidden = true;

  const body = document.createElement("div");
  body.className = "links-feed";

  const hint = document.createElement("p");
  hint.className = "links-admin-modal__body";

  const input = document.createElement("input");
  input.type = "text";
  input.readOnly = true;
  input.className = "links-feed__url";
  input.setAttribute("aria-label", "Link da agenda");
  input.addEventListener("focus", () => input.select());

  const actions = document.createElement("div");
  actions.className = "links-feed__actions";

  function actionButton(action: string, text: string, primary = false): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "links-admin-button links-admin-button--block " +
      (primary ? "links-admin-button--primary" : "links-admin-button--ghost");
    b.dataset.action = action;
    b.textContent = text;
    actions.appendChild(b);
    return b;
  }

  const enableBtn = actionButton("feed-enable", "Ligar", true);
  const copyBtn = actionButton("feed-copy", "Copiar link", true);
  const googleLink = document.createElement("a");
  googleLink.className = "links-admin-button links-admin-button--ghost links-admin-button--block";
  googleLink.dataset.action = "feed-open-google";
  googleLink.target = "_blank";
  googleLink.rel = "noopener noreferrer";
  googleLink.textContent = "Abrir no Google Agenda";
  actions.appendChild(googleLink);
  const rotateBtn = actionButton("feed-rotate", "Trocar link");
  const disableBtn = actionButton("feed-disable", "Desligar");

  const status = document.createElement("p");
  status.className = "links-admin-form__hint";
  status.setAttribute("role", "status");

  body.append(hint, input, actions, status);
  dialog.appendChild(body);

  function setStatus(text: string): void {
    status.textContent = text;
  }

  function render(): void {
    const on = state.enabled && state.token !== null;
    hint.textContent = loaded ? (on ? ON_HINT : OFF_HINT) : "Carregando…";
    input.hidden = !on;
    input.value = on ? calendarFeedUrl(deps.supabaseUrl, state.token!) : "";
    enableBtn.hidden = on || !loaded;
    copyBtn.hidden = !on;
    googleLink.hidden = !on;
    if (on) googleLink.href = googleSubscribeUrl(deps.supabaseUrl, state.token!);
    else googleLink.removeAttribute("href");
    rotateBtn.hidden = !on;
    disableBtn.hidden = !on;
  }

  function setBusy(busy: boolean): void {
    for (const b of [enableBtn, copyBtn, rotateBtn, disableBtn]) b.disabled = busy;
    backBtn.disabled = busy;
    setScreenBusy(dialog, busy);
  }

  async function turnOn(): Promise<void> {
    setStatus("");
    setBusy(true);
    try {
      const token = await deps.enable();
      state = { enabled: true, token };
      render();
      setStatus("Agenda ligada");
    } catch {
      setStatus("Não foi possível gerar o link. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(): Promise<void> {
    setStatus("");
    setBusy(true);
    try {
      await deps.disable();
      state = { enabled: false, token: null };
      render();
      setStatus("Agenda desligada");
    } catch {
      setStatus("Não foi possível desligar o link. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(): Promise<void> {
    const url = input.value;
    if (url === "") return;
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      setStatus("Link copiado");
    } catch {
      input.select();
      setStatus("Selecione o link e copie");
    }
  }

  enableBtn.addEventListener("click", () => void turnOn());
  rotateBtn.addEventListener("click", () => {
    if (
      window.confirm(
        "Trocar o link? O link atual deixa de funcionar e o Google Agenda precisará assinar o novo."
      )
    ) {
      void turnOn();
    }
  });
  disableBtn.addEventListener("click", () => {
    if (window.confirm("Desligar a agenda? O Google Agenda deixa de receber seus passeios.")) {
      void turnOff();
    }
  });
  copyBtn.addEventListener("click", () => void copy());

  function close(): void {
    overlay.hidden = true;
    syncBodyScreenLock();
    if (previouslyFocused) {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
  }

  function open(): void {
    previouslyFocused = document.activeElement as HTMLElement | null;
    loaded = false;
    state = { enabled: false, token: null };
    setStatus("");
    render();
    overlay.hidden = false;
    syncBodyScreenLock();
    setBusy(true);
    void deps
      .load()
      .then((next) => {
        state = next;
        loaded = true;
        render();
      })
      .catch(() => {
        setStatus("Não foi possível carregar. Tente de novo.");
      })
      .finally(() => setBusy(false));
  }

  backBtn.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return { element: overlay, open, close };
}
