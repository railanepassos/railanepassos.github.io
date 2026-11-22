/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiRequestsUi, renderReadyBadge, type AiRequestsUiDeps } from "../../src/links/ai-requests-ui";
import type { AiRequestRow } from "../../src/links/ai-requests";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const post = (i: number) => `https://www.instagram.com/p/ABC${i}/`;

function row(over: Partial<AiRequestRow>): AiRequestRow {
  return {
    id: "r1",
    kind: "instagram",
    status: "pendente",
    payload: { post_urls: [post(1)], from_dms: false },
    result: null,
    error: null,
    created_at: "2026-11-22T10:00:00Z",
    updated_at: "2026-11-22T10:00:00Z",
    processed_at: null,
    ...over,
  };
}

const DRAFT_NOVO = { v: 1, kind: "novo", fields: { label: "Praia", url: "https://example.com/praia" } };
const DRAFT_UPD = (id: string) => ({ v: 1, kind: "atualizacao", id, fields: { description: "Dossiê" } });
const AGENDA = {
  v: 1,
  agenda: [
    { link_id: ID1, start: "2026-12-05T09:00:00-03:00", end: "2026-12-05T17:00:00-03:00", event_title: "Passeio A" },
    { link_id: ID2, start: "2026-12-06T10:00:00-03:00", end: "2026-12-06T12:00:00-03:00", event_title: "Passeio B" },
  ],
};

function setup(rows: AiRequestRow[] = [], over: Partial<AiRequestsUiDeps> = {}) {
  const repo = {
    list: vi.fn(async () => rows),
    create: vi.fn(async (kind: string, payload: unknown) => row({ id: "new", kind: kind as never, payload: payload as never })),
    discard: vi.fn(async () => undefined),
    markApplied: vi.fn(async () => undefined),
    lastRun: vi.fn(async () => null as string | null),
  };
  const deps: AiRequestsUiDeps = {
    repo,
    getLinks: () => [
      { id: ID1, label: "Lugar A" },
      { id: ID2, label: "Lugar B" },
    ],
    onReviewDrafts: vi.fn(),
    onApplyProposal: vi.fn(async () => undefined),
    onRowsChange: vi.fn(),
    now: () => new Date("2026-11-22T12:00:00"),
    ...over,
  };
  const ui = createAiRequestsUi(deps);
  document.body.append(ui.askElement, ui.requestsElement);
  return { ui, repo, deps };
}

const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.replaceChildren();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Pedir ao Claude sheet", () => {
  it("shows the fixed notice and the last run", async () => {
    const { ui, repo } = setup();
    repo.lastRun.mockResolvedValue(new Date("2026-11-22T11:30:00").toISOString());
    ui.openAsk();
    await flush();
    const text = ui.askElement.textContent!;
    expect(text).toContain("Os pedidos são processados no Mac da Railane, de hora em hora (8h–23h), com o Claude. Nada é salvo sem você revisar.");
    expect(text).toContain("Última verificação: há 30 min");
    expect(ui.askElement.hidden).toBe(false);
  });

  it("creates an instagram request", async () => {
    const { ui, repo } = setup();
    ui.openAsk();
    q<HTMLTextAreaElement>("[data-field='post-urls']").value = `${post(1)}\n\n  ${post(2)} \n`;
    q<HTMLInputElement>("[data-field='from-dms']").checked = true;
    q("[data-action='ai-submit']").click();
    await flush();
    expect(repo.create).toHaveBeenCalledWith("instagram", { post_urls: [post(1), post(2)], from_dms: true });
  });

  it("creates a refinar request with the preselected link", async () => {
    const { ui, repo } = setup();
    ui.openAsk({ tab: "refinar", linkIds: [ID2] });
    expect(q<HTMLInputElement>(`[data-link-id='${ID2}']`).checked).toBe(true);
    expect(q<HTMLInputElement>(`[data-link-id='${ID1}']`).checked).toBe(false);
    q<HTMLInputElement>("[data-option='dossie']").checked = true;
    q<HTMLInputElement>("[data-option='roteiro']").checked = true;
    q("[data-action='ai-submit']").click();
    await flush();
    expect(repo.create).toHaveBeenCalledWith("refinar", { link_ids: [ID2], options: ["dossie", "roteiro"] });
  });

  it("creates an agenda request with the default range", async () => {
    const { ui, repo } = setup();
    ui.openAsk({ tab: "agenda" });
    expect(q<HTMLInputElement>("[data-field='range-start']").value).toBe("2026-11-22");
    expect(q<HTMLInputElement>("[data-field='range-end']").value).toBe("2027-01-21");
    q("[data-action='ai-submit']").click();
    await flush();
    expect(repo.create).toHaveBeenCalledWith("agenda", { range_start: "2026-11-22", range_end: "2027-01-21" });
  });

  it("shows one validation line and does not call create", async () => {
    const { ui, repo } = setup();
    ui.openAsk({ tab: "instagram" });
    q("[data-action='ai-submit']").click();
    await flush();
    expect(repo.create).not.toHaveBeenCalled();
    expect(q("[data-role='ai-error']").textContent).toBe("Informe pelo menos um link ou marque as mensagens salvas.");
  });

  it("shows a generic error when create fails", async () => {
    const { ui, repo } = setup();
    repo.create.mockRejectedValue(new Error("boom"));
    ui.openAsk({ tab: "instagram" });
    q<HTMLTextAreaElement>("[data-field='post-urls']").value = post(1);
    q("[data-action='ai-submit']").click();
    await flush();
    expect(q("[data-role='ai-error']").textContent).toContain("Não foi possível enviar");
  });

  it("switches tabs", () => {
    const { ui } = setup();
    ui.openAsk();
    q("[data-tab='refinar']").click();
    expect(q("[data-panel='refinar']").hidden).toBe(false);
    expect(q("[data-panel='instagram']").hidden).toBe(true);
  });
});

describe("Pedidos e sugestões sheet", () => {
  it("lists requests with kind, summary and status", async () => {
    const { ui } = setup([
      row({ id: "a", status: "pendente" }),
      row({ id: "b", kind: "agenda", status: "processando", payload: { range_start: "2026-12-01", range_end: "2026-12-31" } }),
      row({ id: "c", status: "erro", error: "Instagram fora do ar" }),
    ]);
    await ui.openRequests();
    const items = ui.requestsElement.querySelectorAll("[data-request-id]");
    expect(items).toHaveLength(3);
    expect(q("[data-request-id='a']").textContent).toContain("Na fila");
    expect(q("[data-request-id='b']").textContent).toContain("Processando");
    expect(q("[data-request-id='c']").textContent).toContain("Erro: Instagram fora do ar");
  });

  it("Revisar passes the validated drafts and marks applied only when done", async () => {
    const { ui, repo, deps } = setup([row({ id: "p", status: "pronto", result: DRAFT_NOVO })]);
    await ui.openRequests();
    q("[data-request-id='p'] [data-action='ai-review']").click();
    const mock = deps.onReviewDrafts as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledTimes(1);
    const [drafts, onDone] = mock.mock.calls[0];
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe("novo");
    expect(repo.markApplied).not.toHaveBeenCalled();
    expect(ui.requestsElement.hidden).toBe(true);
    onDone();
    await flush();
    expect(repo.markApplied).toHaveBeenCalledWith("p");
  });

  it("opens several drafts together", async () => {
    const { ui, deps } = setup([
      row({ id: "p", kind: "refinar", status: "pronto", result: { v: 1, drafts: [DRAFT_UPD(ID1), DRAFT_UPD(ID2)] } }),
    ]);
    await ui.openRequests();
    q("[data-action='ai-review']").click();
    expect((deps.onReviewDrafts as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(2);
  });

  it("invalid result shows an error and no Revisar/Aplicar", async () => {
    const { ui } = setup([row({ id: "p", status: "pronto", result: { v: 1, nada: true } })]);
    await ui.openRequests();
    const item = q("[data-request-id='p']");
    expect(item.textContent).toContain("Erro: ");
    expect(item.querySelector("[data-action='ai-review']")).toBeNull();
    expect(item.querySelector("[data-action='ai-apply']")).toBeNull();
    expect(item.querySelector("[data-action='ai-discard']")).not.toBeNull();
  });

  it("agenda proposals: Aplicar calls the schedule callback, Ignorar does not", async () => {
    const { ui, repo, deps } = setup([row({ id: "g", kind: "agenda", status: "pronto", result: AGENDA })]);
    await ui.openRequests();
    const item = q("[data-request-id='g']");
    expect(item.textContent).toContain("Lugar A");
    expect(item.textContent).toContain("Passeio A");
    expect(item.textContent).toContain("5 dez 2026 · 09:00–17:00");
    item.querySelector<HTMLElement>("[data-proposal='0'] [data-action='ai-apply']")!.click();
    await flush();
    expect(deps.onApplyProposal).toHaveBeenCalledTimes(1);
    expect(deps.onApplyProposal).toHaveBeenCalledWith(AGENDA.agenda[0]);
    expect(repo.markApplied).not.toHaveBeenCalled();
    item.querySelector<HTMLElement>("[data-proposal='1'] [data-action='ai-ignore']")!.click();
    await flush();
    expect(deps.onApplyProposal).toHaveBeenCalledTimes(1);
    expect(repo.markApplied).toHaveBeenCalledWith("g");
  });

  it("apply failure keeps the proposal open", async () => {
    const { ui, repo } = setup([row({ id: "g", kind: "agenda", status: "pronto", result: AGENDA })], {
      onApplyProposal: vi.fn(async () => {
        throw new Error("x");
      }),
    });
    await ui.openRequests();
    q<HTMLElement>("[data-proposal='0'] [data-action='ai-apply']").click();
    await flush();
    expect(q("[data-proposal='0']").textContent).toContain("Não foi possível aplicar");
    expect(q("[data-proposal='0'] [data-action='ai-apply']")).not.toBeNull();
    expect(repo.markApplied).not.toHaveBeenCalled();
  });

  it("Descartar discards and reloads", async () => {
    const { ui, repo } = setup([row({ id: "a", status: "pendente" })]);
    await ui.openRequests();
    q("[data-request-id='a'] [data-action='ai-discard']").click();
    await flush();
    expect(repo.discard).toHaveBeenCalledWith("a");
    expect(repo.list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("Refazer creates a new request with the same kind and payload and discards the old", async () => {
    const payload = { post_urls: [post(1)], from_dms: false };
    const { ui, repo } = setup([row({ id: "e", status: "erro", error: "falhou", payload })]);
    await ui.openRequests();
    q("[data-request-id='e'] [data-action='ai-redo']").click();
    await flush();
    expect(repo.create).toHaveBeenCalledWith("instagram", payload);
    expect(repo.discard).toHaveBeenCalledWith("e");
  });

  it("does not offer Refazer or Revisar on queued rows", async () => {
    const { ui } = setup([row({ id: "a", status: "pendente" })]);
    await ui.openRequests();
    const item = q("[data-request-id='a']");
    expect(item.querySelector("[data-action='ai-redo']")).toBeNull();
    expect(item.querySelector("[data-action='ai-review']")).toBeNull();
  });
});

describe("refresh and polling", () => {
  it("notifies rows and ready count", async () => {
    const rows = [row({ id: "p", status: "pronto", result: DRAFT_NOVO })];
    const { ui, deps } = setup(rows);
    await ui.refresh();
    expect(deps.onRowsChange).toHaveBeenCalledWith(rows);
  });

  it("polls every 60 s only while something is active", async () => {
    vi.useFakeTimers();
    let rows = [row({ id: "a", status: "pendente" })];
    const { ui, repo } = setup([]);
    repo.list.mockImplementation(async () => rows);
    await ui.refresh();
    expect(repo.list).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(repo.list).toHaveBeenCalledTimes(2);
    rows = [row({ id: "a", status: "pronto", result: DRAFT_NOVO })];
    await vi.advanceTimersByTimeAsync(60_000);
    expect(repo.list).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(repo.list).toHaveBeenCalledTimes(3);
  });

  it("reset stops polling and clears rows", async () => {
    vi.useFakeTimers();
    const { ui, repo, deps } = setup([row({ id: "a", status: "pendente" })]);
    await ui.refresh();
    ui.reset();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(repo.list).toHaveBeenCalledTimes(1);
    expect(deps.onRowsChange).toHaveBeenLastCalledWith([]);
  });
});

describe("ready badge", () => {
  it("is null with no ready suggestions", () => {
    expect(renderReadyBadge(0, () => undefined)).toBeNull();
  });

  it("shows the count and opens the list", () => {
    const onOpen = vi.fn();
    const el = renderReadyBadge(3, onOpen)!;
    expect(el.textContent).toContain("Sugestões prontas (3)");
    el.querySelector<HTMLElement>("[data-action='ai-ready']")!.click();
    expect(onOpen).toHaveBeenCalled();
  });
});
