import { PLAN_LISTS, filled, planProgress, readPlanItems, type PlanList } from "./plan";
import { formatScheduleLabel } from "./schedule";

/**
 * Plan share link (Phase 4.1). Pure: no DOM, no network, no auth.
 *
 * The token lives in the URL fragment (`#plano=<token>`), so it never reaches
 * the GitHub Pages server, its logs or a Referer header. The format mirrors the
 * DB check of migration 014 (lowercase hex, 32 to 64 characters).
 */

export const PLAN_FRAGMENT_PREFIX = "#plano=";
export const SHARED_PLAN_INACTIVE = "Este link não está mais ativo";
export const SHARED_PLAN_LOAD_ERROR = "Não foi possível carregar o plano. Tente de novo.";

const TOKEN_RE = /^[0-9a-f]{32,64}$/;

/** True when the hash is a plan link (valid token or not): the page must go public. */
export function isPlanShareFragment(hash: string): boolean {
  return hash.startsWith(PLAN_FRAGMENT_PREFIX);
}

/** Token from `#plano=<token>`, or null when the fragment is anything else. */
export function parsePlanFragment(hash: string): string | null {
  if (!isPlanShareFragment(hash)) return null;
  const token = hash.slice(PLAN_FRAGMENT_PREFIX.length);
  return TOKEN_RE.test(token) ? token : null;
}

/** URL the editor copies: the token goes in the fragment, never in the path or query. */
export function planShareUrl(origin: string, token: string): string {
  return `${origin}/p/a8f3k2/${PLAN_FRAGMENT_PREFIX}${token}`;
}

export const SHARED_PLAN_CONFLICT = "O plano mudou, recarregamos para você";
export const SHARED_PLAN_SAVE_ERROR = "Não foi possível salvar. Tente de novo.";

export const SHARED_PLAN_INVALID = "Não foi possível salvar: escolha um nome da lista.";
/** Editor: a save was refused because the plan changed on the server (a participant ticked). */
export const PLAN_STALE_NOTICE =
  "O plano mudou (alguém atualizou pelo link). Recarregamos para você — confira e tente de novo.";

export type PlanWriteError = "inactive" | "conflict" | "invalid" | "error";

/**
 * Failed shared plan write -> kind. The functions raise 'inactive', 'conflict'
 * or 'invalid' as the message of a 400; anything else (5xx, network) is generic.
 */
export function classifyPlanWriteError(status: number, body: unknown): PlanWriteError {
  if (status !== 400 || typeof body !== "object" || body === null) return "error";
  const message = (body as Record<string, unknown>).message;
  return message === "inactive" || message === "conflict" || message === "invalid"
    ? message
    : "error";
}

export function planWriteErrorMessage(kind: PlanWriteError): string {
  if (kind === "conflict") return SHARED_PLAN_CONFLICT;
  if (kind === "inactive") return SHARED_PLAN_INACTIVE;
  if (kind === "invalid") return SHARED_PLAN_INVALID;
  return SHARED_PLAN_SAVE_ERROR;
}

/** `idx` is the position in the stored plan_items array (what the server expects). */
export type SharedPlanItem = { idx: number; text: string; who: string | null; done: boolean };

export type SharedPlanList = {
  key: PlanList;
  title: string;
  progress: string;
  items: SharedPlanItem[];
};

export type SharedPlanView = {
  title: string;
  when: string | null;
  where: string | null;
  itinerary: string | null;
  people: string[];
  lists: SharedPlanList[];
};

/** Payload of links_shared_plan_get -> what the page shows. Null when it is not a plan. */
export function buildSharedPlanView(raw: unknown): SharedPlanView | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const title = filled(r.label);
  if (title === "") return null;

  const start = filled(r.scheduled_start);
  const end = filled(r.scheduled_end);
  const when = start !== "" && end !== "" ? formatScheduleLabel(start, end) : null;

  const where = [filled(r.city), filled(r.address)].filter((s) => s !== "").join(" · ");
  const itinerary = filled(r.itinerary);

  const people = (Array.isArray(r.people) ? r.people : [])
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim())
    .filter((p) => p !== "");

  // Keep each item's position in the stored array: malformed entries are skipped
  // for display but still occupy an index on the server.
  const rawItems = Array.isArray(r.plan_items) ? r.plan_items : [];
  const indexed = rawItems.flatMap((entry, idx) =>
    readPlanItems([entry]).map((item) => ({ item, idx }))
  );
  const items = indexed.map((x) => x.item);
  const lists: SharedPlanList[] = [];
  for (const { key, title: listTitle } of PLAN_LISTS) {
    const own = indexed.filter((x) => x.item.list === key);
    if (own.length === 0) continue;
    lists.push({
      key,
      title: listTitle,
      progress: planProgress(items, key).label,
      items: own.map(({ item, idx }) => ({
        idx,
        text: item.text,
        who: item.who ?? null,
        done: item.done,
      })),
    });
  }

  return {
    title,
    when,
    where: where === "" ? null : where,
    itinerary: itinerary === "" ? null : itinerary,
    people,
    lists,
  };
}
