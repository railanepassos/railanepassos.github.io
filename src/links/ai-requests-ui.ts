import { createScreenChrome } from "./admin-ui";
import {
  REFINE_OPTIONS,
  defaultAgendaRange,
  formatLastRun,
  hasActive,
  parseAiResult,
  statusLabel,
  validateAiPayload,
  type AgendaProposal,
  type AiRequestKind,
  type AiRequestRow,
} from "./ai-requests";
import type { createAiRequestsRepo } from "./ai-requests-repo";
import type { Draft } from "./draft";
import { formatScheduleLabel } from "./schedule";
import { syncBodyScreenLock } from "./screen-lock";
import { setScreenBusy } from "./skeleton";
import { uiIcon } from "./ui-icons";

/**
 * "Pedir ao Claude" (Phase 9, part b). Two sheets: one to queue requests (Instagram,
 * Refinar, Agenda) and one that lists the requests and their suggestions. Deps are
 * injected (no supabase here); the review and the schedule save belong to main.ts.
 * Pure DOM, textContent only (CSP, user data).
 */

export type AiRequestsRepoLike = Pick<
  ReturnType<typeof createAiRequestsRepo>,
  "list" | "create" | "discard" | "markApplied" | "lastRun"
>;

export type AiRequestsUiDeps = {
  repo: AiRequestsRepoLike;
  /** Places the editor can refine, and the names shown for ids in results. */
  getLinks: () => { id: string; label: string }[];
  /** Open the drafts one at a time; `onDone` runs when the last one is saved. */
  onReviewDrafts: (drafts: Draft[], onDone: () => void) => void;
  /** Save one agenda proposal (same save as the schedule sheet); rejects on failure. */
  onApplyProposal: (proposal: AgendaProposal) => Promise<void>;
  /** The list changed (badge count). */
  onRowsChange?: (rows: AiRequestRow[]) => void;
  now?: () => Date;
};

export type AskTab = "instagram" | "refinar" | "agenda";

export type AiRequestsUiHandle = {
  askElement: HTMLElement;
  requestsElement: HTMLElement;
  openAsk: (opts?: { tab?: AskTab; linkIds?: string[] }) => void;
  openRequests: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Sign-out: forget rows and stop polling. */
  reset: () => void;
};

export const POLL_MS = 60_000;

const NOTICE =
  "Os pedidos são processados no Mac da Railane, de hora em hora (8h–23h), com o Claude. Nada é salvo sem você revisar.";
const SEND_ERROR = "Não foi possível enviar o pedido. Tente de novo.";
const APPLY_ERROR = "Não foi possível aplicar. Tente de novo.";
const ACTION_ERROR = "Não foi possível concluir. Tente de novo.";

const KIND_LABELS: Record<AiRequestKind, string> = {
  instagram: "Instagram",
  refinar: "Refinar",
  agenda: "Agenda",
};
const OPTION_LABELS: Record<(typeof REFINE_OPTIONS)[number], string> = {
  dossie: "Dossiê",
  roteiro: "Roteiro",
  lanches: "Lanches/checklist",
  imagem: "Imagem",
};
const TAB_ORDER: AskTab[] = ["instagram", "refinar", "agenda"];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(action: string, text: string, kind: "primary" | "ghost" = "ghost"): HTMLButtonElement {
  const b = el("button", `links-admin-button links-admin-button--${kind}`, text);
  b.type = "button";
  b.dataset.action = action;
  return b;
}

function checkRow(label: string): { row: HTMLLabelElement; input: HTMLInputElement } {
  const row = el("label", "links-ai__check");
  const input = el("input");
  input.type = "checkbox";
  row.append(input, el("span", undefined, label));
  return { row, input };
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function brDate(ymd: unknown): string {
  const m = typeof ymd === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "?";
}

/** "Sugestões prontas (N)" chip for the top of the feed; null when nothing is ready. */
export function renderReadyBadge(count: number, onOpen: () => void): HTMLElement | null {
  if (count <= 0) return null;
  const bar = el("div", "links-agendabar");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Sugestões do Claude");
  const btn = el("button", "links-chip links-agendabar__btn");
  btn.type = "button";
  btn.dataset.action = "ai-ready";
  btn.append(uiIcon("sparkle", 16), el("span", undefined, `Sugestões prontas (${count})`));
  btn.addEventListener("click", onOpen);
  bar.appendChild(btn);
  return bar;
}

export function createAiRequestsUi(deps: AiRequestsUiDeps): AiRequestsUiHandle {
  const now = deps.now ?? (() => new Date());
  let rows: AiRequestRow[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;
  /** Agenda proposals decided in this session: request id -> index -> outcome. */
  const decided = new Map<string, Map<number, "applied" | "ignored">>();
  const itemErrors = new Map<string, string>();

  // ---------------------------------------------------------------- data
  function syncPolling(): void {
    if (hasActive(rows)) {
      if (timer === null) timer = setInterval(() => void refresh().catch(() => undefined), POLL_MS);
    } else if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function refresh(): Promise<void> {
    rows = await deps.repo.list();
    syncPolling();
    renderRequests();
    deps.onRowsChange?.(rows);
  }

  function reset(): void {
    rows = [];
    decided.clear();
    itemErrors.clear();
    syncPolling();
    askOverlay.hidden = true;
    reqOverlay.hidden = true;
    syncBodyScreenLock();
    renderRequests();
    deps.onRowsChange?.(rows);
  }

  // ------------------------------------------------------------ ask sheet
  const ask = createScreenChrome("links-ai-ask-title", "Pedir ao Claude", "dialog");
  const askOverlay = ask.overlay;
  askOverlay.hidden = true;
  askOverlay.dataset.sheet = "ai-ask";

  const askBody = el("div", "links-ai");
  const notice = el("p", "links-admin-form__hint");
  const lastRunLine = el("p", "links-admin-form__hint");
  lastRunLine.dataset.role = "ai-last-run";
  const tabs = el("div", "links-ai__tabs");
  tabs.setAttribute("role", "tablist");
  notice.textContent = NOTICE;

  const tabButtons = new Map<AskTab, HTMLButtonElement>();
  const panels = new Map<AskTab, HTMLElement>();
  for (const tab of TAB_ORDER) {
    const b = el("button", "links-chip", KIND_LABELS[tab]);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.dataset.tab = tab;
    b.addEventListener("click", () => selectTab(tab));
    tabs.appendChild(b);
    tabButtons.set(tab, b);
    const panel = el("div", "links-ai__panel");
    panel.dataset.panel = tab;
    panel.setAttribute("role", "tabpanel");
    panels.set(tab, panel);
  }
  let currentTab: AskTab = "instagram";

  // Instagram panel
  const urlsLabel = el("label", "links-admin-form__label", "Links de posts do Instagram (um por linha, até 10)");
  const urlsInput = el("textarea", "links-admin-form__control links-admin-form__control--textarea");
  urlsInput.rows = 5;
  urlsInput.dataset.field = "post-urls";
  urlsInput.id = "links-ai-post-urls";
  urlsLabel.htmlFor = urlsInput.id;
  urlsInput.placeholder = "https://www.instagram.com/p/...";
  urlsInput.setAttribute("spellcheck", "false");
  const dms = checkRow("Posts que me mandaram nas DMs");
  dms.input.dataset.field = "from-dms";
  panels.get("instagram")!.append(urlsLabel, urlsInput, dms.row);

  // Refinar panel
  const refinarHint = el("p", "links-admin-form__hint", "Escolha de 1 a 10 lugares e o que o Claude deve preparar.");
  const placesBox = el("div", "links-ai__list");
  placesBox.setAttribute("role", "group");
  placesBox.setAttribute("aria-label", "Lugares");
  const optionsBox = el("div", "links-ai__list");
  optionsBox.setAttribute("role", "group");
  optionsBox.setAttribute("aria-label", "O que preparar");
  for (const option of REFINE_OPTIONS) {
    const c = checkRow(OPTION_LABELS[option]);
    c.input.dataset.option = option;
    optionsBox.appendChild(c.row);
  }
  panels.get("refinar")!.append(refinarHint, placesBox, optionsBox);

  // Agenda panel
  const startLabel = el("label", "links-admin-form__label", "De");
  const startInput = el("input", "links-admin-form__control");
  startInput.type = "date";
  startInput.dataset.field = "range-start";
  startInput.id = "links-ai-range-start";
  startLabel.htmlFor = startInput.id;
  const endLabel = el("label", "links-admin-form__label", "Até");
  const endInput = el("input", "links-admin-form__control");
  endInput.type = "date";
  endInput.dataset.field = "range-end";
  endInput.id = "links-ai-range-end";
  endLabel.htmlFor = endInput.id;
  panels
    .get("agenda")!
    .append(
      el("p", "links-admin-form__hint", "O Claude lê o Google Agenda no período e propõe agendar os lugares da lista."),
      startLabel,
      startInput,
      endLabel,
      endInput
    );

  const askError = el("p", "links-admin-form__hint links-ai__error");
  askError.dataset.role = "ai-error";
  askError.setAttribute("role", "alert");
  const askOk = el("p", "links-admin-form__hint");
  askOk.dataset.role = "ai-ok";
  askOk.setAttribute("role", "status");
  const submit = button("ai-submit", "Enviar pedido", "primary");
  submit.classList.add("links-admin-button--block");
  const seeRequests = button("ai-open-requests", "Pedidos e sugestões");
  seeRequests.classList.add("links-admin-button--block");

  askBody.append(notice, lastRunLine, tabs);
  for (const tab of TAB_ORDER) askBody.appendChild(panels.get(tab)!);
  askBody.append(askError, askOk, submit, seeRequests);
  ask.dialog.appendChild(askBody);

  function selectTab(tab: AskTab): void {
    currentTab = tab;
    for (const t of TAB_ORDER) {
      const active = t === tab;
      panels.get(t)!.hidden = !active;
      const b = tabButtons.get(t)!;
      b.classList.toggle("links-chip--active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    }
    askError.textContent = "";
    askOk.textContent = "";
  }

  function fillPlaces(selected: Set<string>): void {
    placesBox.replaceChildren();
    const links = deps.getLinks();
    if (links.length === 0) placesBox.appendChild(el("p", "links-admin-form__hint", "Nenhum lugar cadastrado ainda."));
    for (const link of links) {
      const c = checkRow(link.label);
      c.input.dataset.linkId = link.id;
      c.input.checked = selected.has(link.id);
      placesBox.appendChild(c.row);
    }
  }

  function collectPayload(): unknown {
    if (currentTab === "instagram") {
      return {
        post_urls: urlsInput.value.split("\n").map((s) => s.trim()).filter((s) => s !== ""),
        from_dms: dms.input.checked,
      };
    }
    if (currentTab === "refinar") {
      const checked = (sel: string) => [...askBody.querySelectorAll<HTMLInputElement>(sel)].filter((i) => i.checked);
      return {
        link_ids: checked("[data-link-id]").map((i) => i.dataset.linkId!),
        options: checked("[data-option]").map((i) => i.dataset.option!),
      };
    }
    return { range_start: startInput.value, range_end: endInput.value };
  }

  async function sendRequest(): Promise<void> {
    if (busy) return;
    askError.textContent = "";
    askOk.textContent = "";
    const kind = currentTab;
    const checked = validateAiPayload(kind, collectPayload());
    if (!checked.ok) {
      askError.textContent = checked.reason;
      return;
    }
    busy = true;
    submit.disabled = true;
    setScreenBusy(ask.dialog, true);
    try {
      await deps.repo.create(kind, checked.payload);
      askOk.textContent = "Pedido enviado. Acompanhe em Pedidos e sugestões.";
      urlsInput.value = "";
      dms.input.checked = false;
      for (const i of askBody.querySelectorAll<HTMLInputElement>("[data-link-id], [data-option]")) i.checked = false;
      try {
        await refresh();
      } catch {
        // the request was queued; the list reloads on the next open
      }
    } catch {
      askError.textContent = SEND_ERROR;
    } finally {
      busy = false;
      submit.disabled = false;
      setScreenBusy(ask.dialog, false);
    }
  }
  submit.addEventListener("click", () => void sendRequest());
  seeRequests.addEventListener("click", () => {
    closeAsk();
    void openRequests();
  });

  let askPrevFocus: HTMLElement | null = null;
  function closeAsk(): void {
    askOverlay.hidden = true;
    syncBodyScreenLock();
    askPrevFocus?.focus();
    askPrevFocus = null;
  }
  ask.backBtn.addEventListener("click", closeAsk);
  askOverlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeAsk();
    }
  });

  function openAsk(opts: { tab?: AskTab; linkIds?: string[] } = {}): void {
    askPrevFocus = document.activeElement as HTMLElement | null;
    const range = defaultAgendaRange(now());
    startInput.value = range.range_start;
    endInput.value = range.range_end;
    urlsInput.value = "";
    dms.input.checked = false;
    for (const i of optionsBox.querySelectorAll<HTMLInputElement>("input")) i.checked = false;
    fillPlaces(new Set(opts.linkIds ?? []));
    selectTab(opts.tab ?? "instagram");
    lastRunLine.textContent = formatLastRun(null, now());
    askOverlay.hidden = false;
    syncBodyScreenLock();
    void deps.repo
      .lastRun()
      .then((iso) => {
        lastRunLine.textContent = formatLastRun(iso, now());
      })
      .catch(() => undefined);
  }

  // -------------------------------------------------------- requests sheet
  const req = createScreenChrome("links-ai-requests-title", "Pedidos e sugestões", "dialog");
  const reqOverlay = req.overlay;
  reqOverlay.hidden = true;
  reqOverlay.dataset.sheet = "ai-requests";
  const reqBody = el("div", "links-ai");
  const reqNotice = el("p", "links-admin-form__hint", NOTICE);
  const reqStatus = el("p", "links-admin-form__hint");
  reqStatus.setAttribute("role", "status");
  const reqList = el("div", "links-ai__list");
  reqBody.append(reqNotice, reqStatus, reqList);
  req.dialog.appendChild(reqBody);

  let reqPrevFocus: HTMLElement | null = null;
  function closeRequests(): void {
    reqOverlay.hidden = true;
    syncBodyScreenLock();
    reqPrevFocus?.focus();
    reqPrevFocus = null;
  }
  req.backBtn.addEventListener("click", closeRequests);
  reqOverlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeRequests();
    }
  });

  function labelOf(id: string): string | null {
    return deps.getLinks().find((l) => l.id === id)?.label ?? null;
  }

  function summary(r: AiRequestRow): string {
    const p = r.payload as Record<string, unknown>;
    if (r.kind === "instagram") {
      const n = Array.isArray(p.post_urls) ? p.post_urls.length : 0;
      const parts: string[] = [];
      if (n > 0) parts.push(`${n} ${n === 1 ? "link" : "links"} do Instagram`);
      if (p.from_dms === true) parts.push("posts das DMs");
      return parts.join(" + ");
    }
    if (r.kind === "refinar") {
      const ids = Array.isArray(p.link_ids) ? (p.link_ids as string[]) : [];
      const names = ids.map((id) => labelOf(id) ?? "item removido");
      const shown = names.slice(0, 3).join(", ");
      const rest = names.length > 3 ? ` +${names.length - 3}` : "";
      const opts = Array.isArray(p.options)
        ? (p.options as string[]).map((o) => OPTION_LABELS[o as keyof typeof OPTION_LABELS] ?? o).join(", ")
        : "";
      return `${shown}${rest}${opts ? ` (${opts})` : ""}`;
    }
    return `${brDate(p.range_start)} a ${brDate(p.range_end)}`;
  }

  function action(
    name: string,
    text: string,
    onClick: () => void,
    kind: "primary" | "ghost" = "ghost"
  ): HTMLButtonElement {
    const b = button(name, text, kind);
    b.addEventListener("click", onClick);
    return b;
  }

  async function guarded(fn: () => Promise<void>, id: string): Promise<void> {
    if (busy) return;
    busy = true;
    itemErrors.delete(id);
    try {
      await fn();
    } catch {
      itemErrors.set(id, ACTION_ERROR);
    } finally {
      busy = false;
    }
    try {
      await refresh();
    } catch {
      renderRequests();
    }
  }

  function discard(id: string): void {
    void guarded(() => deps.repo.discard(id), id);
  }

  function redo(r: AiRequestRow): void {
    void guarded(async () => {
      await deps.repo.create(r.kind, r.payload);
      await deps.repo.discard(r.id);
    }, r.id);
  }

  function review(r: AiRequestRow, drafts: Draft[]): void {
    closeRequests();
    deps.onReviewDrafts(drafts, () => {
      void guarded(() => deps.repo.markApplied(r.id), r.id);
    });
  }

  function decide(r: AiRequestRow, total: number, index: number, outcome: "applied" | "ignored"): void {
    const map = decided.get(r.id) ?? new Map<number, "applied" | "ignored">();
    map.set(index, outcome);
    decided.set(r.id, map);
    if (map.size >= total) {
      decided.delete(r.id);
      void guarded(() => deps.repo.markApplied(r.id), r.id);
    } else {
      renderRequests();
    }
  }

  async function applyProposal(r: AiRequestRow, proposals: AgendaProposal[], index: number): Promise<void> {
    if (busy) return;
    const key = `${r.id}:${index}`;
    busy = true;
    itemErrors.delete(key);
    try {
      await deps.onApplyProposal(proposals[index]);
    } catch {
      itemErrors.set(key, APPLY_ERROR);
      busy = false;
      renderRequests();
      return;
    }
    busy = false;
    decide(r, proposals.length, index, "applied");
  }

  function renderProposals(r: AiRequestRow, proposals: AgendaProposal[]): HTMLElement {
    const list = el("ul", "links-ai__proposals");
    const done = decided.get(r.id);
    proposals.forEach((p, i) => {
      const li = el("li", "links-ai__proposal");
      li.dataset.proposal = String(i);
      const label = labelOf(p.link_id);
      const outcome = done?.get(i);
      li.append(
        el("strong", undefined, label ?? "Item removido"),
        el("span", "links-ai__meta", `${p.event_title} · ${formatScheduleLabel(p.start, p.end)}`)
      );
      if (outcome) {
        li.appendChild(el("span", "links-ai__meta", outcome === "applied" ? "Aplicado" : "Ignorado"));
      } else {
        const actions = el("div", "links-ai__actions");
        const apply = action("ai-apply", "Aplicar", () => void applyProposal(r, proposals, i), "primary");
        apply.disabled = label === null;
        actions.append(apply, action("ai-ignore", "Ignorar", () => decide(r, proposals.length, i, "ignored")));
        li.appendChild(actions);
      }
      const err = itemErrors.get(`${r.id}:${i}`);
      if (err) li.appendChild(el("span", "links-ai__error", err));
      list.appendChild(li);
    });
    return list;
  }

  function renderItem(r: AiRequestRow): HTMLElement {
    const item = el("article", "links-ai__item");
    item.dataset.requestId = r.id;
    item.dataset.status = r.status;
    const parsed = r.status === "pronto" ? parseAiResult(r.result) : null;
    const invalid = parsed !== null && !parsed.ok;
    const head = el("div", "links-ai__head");
    head.append(
      el("strong", undefined, KIND_LABELS[r.kind]),
      el("span", "links-ai__status", invalid ? statusLabel("erro") : statusLabel(r.status)),
      el("span", "links-ai__meta", shortDate(r.created_at))
    );
    item.append(head, el("p", "links-ai__summary", summary(r)));

    const actions = el("div", "links-ai__actions");
    if (invalid) {
      item.appendChild(el("p", "links-ai__error", `Erro: ${parsed.reason}`));
    } else if (r.status === "erro") {
      item.appendChild(el("p", "links-ai__error", `Erro: ${r.error ?? "não foi possível processar"}`));
    } else if (parsed && parsed.ok && parsed.type === "drafts") {
      const drafts = parsed.drafts;
      actions.appendChild(action("ai-review", "Revisar", () => review(r, drafts), "primary"));
    } else if (parsed && parsed.ok && parsed.type === "agenda") {
      item.appendChild(renderProposals(r, parsed.proposals));
    }
    const failed = invalid || r.status === "erro";
    if (failed) actions.appendChild(action("ai-redo", "Refazer", () => redo(r)));
    if (r.status === "pendente" || r.status === "pronto" || r.status === "erro") {
      actions.appendChild(action("ai-discard", "Descartar", () => discard(r.id)));
    }
    if (actions.childElementCount > 0) item.appendChild(actions);
    const err = itemErrors.get(r.id);
    if (err) item.appendChild(el("p", "links-ai__error", err));
    return item;
  }

  function renderRequests(): void {
    reqList.replaceChildren();
    if (rows.length === 0) {
      reqList.appendChild(el("p", "links-status", "Nenhum pedido ainda."));
      return;
    }
    for (const r of rows) reqList.appendChild(renderItem(r));
  }

  async function openRequests(): Promise<void> {
    reqPrevFocus = document.activeElement as HTMLElement | null;
    reqOverlay.hidden = false;
    syncBodyScreenLock();
    reqStatus.textContent = "";
    renderRequests();
    void deps.repo
      .lastRun()
      .then((iso) => {
        reqStatus.textContent = formatLastRun(iso, now());
      })
      .catch(() => undefined);
    try {
      await refresh();
    } catch {
      reqStatus.textContent = "Não foi possível carregar os pedidos. Tente de novo.";
    }
  }

  selectTab("instagram");
  renderRequests();

  return {
    askElement: askOverlay,
    requestsElement: reqOverlay,
    openAsk,
    openRequests,
    refresh,
    reset,
  };
}
