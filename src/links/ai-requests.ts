/**
 * Claude request queue (Phase 9), pure model. No DOM, no network. The table is
 * created by migration 021; the repo lives in ai-requests-repo.ts.
 */
import { encodeDraft, parseDraft, type Draft } from "./draft";
import { validateScheduleRange } from "./schedule";

export type AiRequestKind = "instagram" | "refinar" | "agenda";
export type AiRequestStatus = "pendente" | "processando" | "pronto" | "erro" | "aplicado" | "descartado";

export type AiRequestRow = {
  id: string;
  kind: AiRequestKind;
  status: AiRequestStatus;
  payload: Record<string, unknown>;
  result: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

export type AiPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: string };

export type AgendaProposal = { link_id: string; start: string; end: string; event_title: string };

export type AiResult =
  | { ok: true; type: "drafts"; drafts: Draft[] }
  | { ok: true; type: "agenda"; proposals: AgendaProposal[] }
  | { ok: false; reason: string };

export const MAX_INSTAGRAM_URLS = 10;
export const MAX_REFINE_LINKS = 10;
export const REFINE_OPTIONS = ["dossie", "roteiro", "lanches", "imagem"] as const;
export const MAX_AGENDA_DAYS = 180;
export const MAX_AGENDA_PROPOSALS = 50;
export const MAX_EVENT_TITLE = 200;
export const DEFAULT_AGENDA_DAYS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isInstagramPostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "www.instagram.com" || url.hostname === "instagram.com");
  } catch {
    return false;
  }
}

function validateInstagram(p: Record<string, unknown>): AiPayloadResult {
  const rawUrls = p.post_urls ?? [];
  if (!Array.isArray(rawUrls) || rawUrls.some((u) => typeof u !== "string")) {
    return fail("Os links do Instagram são inválidos.");
  }
  if (typeof (p.from_dms ?? false) !== "boolean") return fail("Opção de mensagens inválida.");
  const fromDms = p.from_dms === true;
  const urls = dedupe((rawUrls as string[]).map((u) => u.trim()).filter((u) => u !== ""));
  if (urls.some((u) => !isInstagramPostUrl(u))) {
    return fail("Use links https do Instagram (https://www.instagram.com/...).");
  }
  if (urls.length > MAX_INSTAGRAM_URLS) return fail(`No máximo ${MAX_INSTAGRAM_URLS} links por pedido.`);
  if (urls.length === 0 && !fromDms) return fail("Informe pelo menos um link ou marque as mensagens salvas.");
  return { ok: true, payload: { post_urls: urls, from_dms: fromDms } };
}

function validateRefinar(p: Record<string, unknown>): AiPayloadResult {
  const { link_ids: rawIds, options: rawOptions } = p;
  if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
    return fail("Itens inválidos para refinar.");
  }
  if (!Array.isArray(rawOptions) || rawOptions.some((o) => !(REFINE_OPTIONS as readonly unknown[]).includes(o))) {
    return fail("Opção de refinamento inválida.");
  }
  const ids = dedupe(rawIds as string[]);
  const options = dedupe(rawOptions as string[]);
  if (ids.length === 0) return fail("Escolha pelo menos um item.");
  if (ids.length > MAX_REFINE_LINKS) return fail(`No máximo ${MAX_REFINE_LINKS} itens por pedido.`);
  if (options.length === 0) return fail("Escolha pelo menos uma opção.");
  return { ok: true, payload: { link_ids: ids, options } };
}

function ymdToUtc(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = YMD_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t;
}

function validateAgenda(p: Record<string, unknown>): AiPayloadResult {
  const start = ymdToUtc(p.range_start);
  const end = ymdToUtc(p.range_end);
  if (start === null || end === null) return fail("Informe o período com datas válidas.");
  if (end < start) return fail("O fim do período deve ser depois do início.");
  if ((end - start) / DAY_MS > MAX_AGENDA_DAYS) return fail(`O período pode ter no máximo ${MAX_AGENDA_DAYS} dias.`);
  return { ok: true, payload: { range_start: p.range_start, range_end: p.range_end } };
}

/** Validates and normalizes a payload before it is queued (the DB only checks size). */
export function validateAiPayload(kind: AiRequestKind, payload: unknown): AiPayloadResult {
  if (!isRecord(payload)) return fail("Pedido inválido.");
  if (kind === "instagram") return validateInstagram(payload);
  if (kind === "refinar") return validateRefinar(payload);
  if (kind === "agenda") return validateAgenda(payload);
  return fail("Tipo de pedido desconhecido.");
}

const STATUS_LABELS: Record<AiRequestStatus, string> = {
  pendente: "Na fila",
  processando: "Processando",
  pronto: "Pronto",
  erro: "Erro",
  aplicado: "Aplicado",
  descartado: "Descartado",
};

export function statusLabel(status: AiRequestStatus): string {
  return STATUS_LABELS[status];
}

export function countReady(rows: AiRequestRow[]): number {
  return rows.filter((r) => r.status === "pronto").length;
}

export function hasActive(rows: AiRequestRow[]): boolean {
  return rows.some((r) => r.status === "pendente" || r.status === "processando");
}

function checkDraft(value: unknown): { ok: true; draft: Draft } | { ok: false; reason: string } {
  try {
    return parseDraft(encodeDraft(value as Draft));
  } catch {
    return fail("Rascunho inválido.");
  }
}

function parseDrafts(list: unknown): AiResult {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_REFINE_LINKS) {
    return fail(`A resposta deve ter de 1 a ${MAX_REFINE_LINKS} rascunhos.`);
  }
  const drafts: Draft[] = [];
  for (const item of list) {
    const parsed = checkDraft(item);
    if (!parsed.ok) return fail(parsed.reason);
    if (parsed.draft.kind !== "atualizacao") return fail("Cada rascunho da lista deve ser uma atualização.");
    drafts.push(parsed.draft);
  }
  return { ok: true, type: "drafts", drafts };
}

function parseAgenda(list: unknown): AiResult {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_AGENDA_PROPOSALS) {
    return fail(`A resposta deve ter de 1 a ${MAX_AGENDA_PROPOSALS} propostas de agenda.`);
  }
  const proposals: AgendaProposal[] = [];
  for (const item of list) {
    if (!isRecord(item)) return fail("Proposta de agenda inválida.");
    const { link_id, start, end, event_title } = item;
    if (typeof link_id !== "string" || !UUID_RE.test(link_id)) return fail("Proposta com item inválido.");
    if (typeof start !== "string" || typeof end !== "string") return fail("Proposta sem data e hora.");
    const range = validateScheduleRange(start, end);
    if (range) return fail(range);
    if (typeof event_title !== "string" || event_title.trim() === "" || event_title.length > MAX_EVENT_TITLE) {
      return fail(`O título do evento deve ter de 1 a ${MAX_EVENT_TITLE} caracteres.`);
    }
    proposals.push({ link_id, start, end, event_title });
  }
  return { ok: true, type: "agenda", proposals };
}

/** Normalizes the three `result` formats into drafts or agenda proposals. */
export function parseAiResult(result: unknown): AiResult {
  if (!isRecord(result)) return fail("A resposta do Claude está vazia ou inválida.");
  if (result.v !== 1) return fail("Versão de resposta não suportada.");
  if ("drafts" in result) return parseDrafts(result.drafts);
  if ("agenda" in result) return parseAgenda(result.agenda);
  if ("kind" in result) {
    const parsed = checkDraft(result);
    return parsed.ok ? { ok: true, type: "drafts", drafts: [parsed.draft] } : fail(parsed.reason);
  }
  return fail("A resposta do Claude não tem um formato conhecido.");
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local dates: today -> today + 60 days. */
export function defaultAgendaRange(today: Date): { range_start: string; range_end: string } {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + DEFAULT_AGENDA_DAYS);
  return { range_start: ymd(today), range_end: ymd(end) };
}

export function formatLastRun(lastRunIso: string | null, now: Date): string {
  if (lastRunIso === null) return "Ainda não rodou";
  const at = Date.parse(lastRunIso);
  if (Number.isNaN(at)) return "Ainda não rodou";
  const minutes = Math.floor((now.getTime() - at) / 60_000);
  const prefix = "Última verificação: ";
  if (minutes < 1) return `${prefix}agora há pouco`;
  if (minutes < 60) return `${prefix}há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${prefix}há ${hours} h`;
  return `${prefix}há ${Math.floor(hours / 24)} d`;
}
