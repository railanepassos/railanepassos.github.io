/**
 * Item draft codec (Phase 5). Pure and DEPENDENCY-FREE on purpose: no imports,
 * so a Node script can load it as is. The few constants it needs from the app
 * are duplicated in `DRAFT_LIMITS`; tests/unit/draft.test.ts asserts they match
 * the app's own constants.
 *
 * A draft only pre-fills forms, it never saves anything. It travels in the URL
 * fragment (`#rascunho=<base64url of the UTF-8 JSON>`), which never reaches the
 * server. Format v1:
 *   { v: 1, kind: "novo" | "atualizacao", id?, fields?, plan? }
 * Text is plain text: callers must show it with `textContent` / form `value`.
 */

export const DRAFT_FRAGMENT_PREFIX = "#rascunho=";
/** Cap of the decoded JSON. */
export const DRAFT_MAX_BYTES = 16 * 1024;

export const DRAFT_LIMITS = {
  categories: [
    "museu",
    "evento",
    "restaurante",
    "bar",
    "cafeteria",
    "trilha",
    "praca",
    "parque",
    "praia",
    "ponto-turistico",
    "passeio",
    "outro",
  ],
  text: {
    label: 200,
    description: 2000,
    cost_text: 200,
    city: 120,
    address: 300,
    dossier: 5000,
    itinerary: 5000,
  } as Record<string, number>,
  maxUrlLength: 2000,
  maxTags: 30,
  maxTagLength: 40,
  maxPeople: 30,
  maxPersonLength: 80,
  maxPlanItems: 60,
  planTextMax: 200,
};

export type DraftFields = {
  url?: string;
  label?: string;
  description?: string;
  source_url?: string;
  category?: string;
  tags?: string[];
  people?: string[];
  cost_text?: string;
  city?: string;
  address?: string;
  dossier?: string;
  itinerary?: string;
  image_url?: string;
};

export type DraftPlanItem = { text: string; list: "checklist" | "compras" };

export type Draft =
  | { v: 1; kind: "novo"; fields: DraftFields }
  | { v: 1; kind: "atualizacao"; id: string; fields?: DraftFields; plan?: DraftPlanItem[] };

export type ParseDraftResult = { ok: true; draft: Draft } | { ok: false; reason: string };

const URL_KEYS = ["url", "source_url", "image_url"];
const TEXT_KEYS = ["label", "description", "cost_text", "city", "address", "dossier", "itinerary"];
const FIELD_KEYS = [...URL_KEYS, ...TEXT_KEYS, "category", "tags", "people"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL_RE = /^[A-Za-z0-9_-]*$/;
// Encoded size of DRAFT_MAX_BYTES (no padding); anything longer is rejected before decoding.
const MAX_ENCODED_LENGTH = Math.ceil((DRAFT_MAX_BYTES * 4) / 3);

const TOO_BIG = "O rascunho passa de 16 KB.";

export function isDraftFragment(hash: string): boolean {
  return hash.startsWith(DRAFT_FRAGMENT_PREFIX);
}

/** Draft -> `#rascunho=<base64url>`. Does not validate (see parseDraft). */
export function encodeDraft(draft: Draft): string {
  const bytes = new TextEncoder().encode(JSON.stringify(draft));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return DRAFT_FRAGMENT_PREFIX + b64;
}

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decode(payload: string): string | null {
  if (!B64URL_RE.test(payload) || payload.length % 4 === 1) return null;
  try {
    const std = payload.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    if (bytes.length > DRAFT_MAX_BYTES) return TOO_BIG;
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** First problem in the fields (names the key), or null. */
function fieldsError(raw: unknown, requireUrl: boolean): string | null {
  if (!isRecord(raw)) return "O campo fields deve ser um objeto.";
  for (const key of Object.keys(raw)) {
    if (!FIELD_KEYS.includes(key)) return `Campo desconhecido em fields: ${key}.`;
  }
  if (requireUrl && raw.url === undefined) return "O campo url é obrigatório.";
  for (const key of [...URL_KEYS, ...TEXT_KEYS, "category"]) {
    const v = raw[key];
    if (v === undefined) continue;
    if (typeof v !== "string") return `O campo ${key} deve ser texto.`;
    if (URL_KEYS.includes(key)) {
      if (v.length > DRAFT_LIMITS.maxUrlLength) return `O campo ${key} é longo demais.`;
      if (!isHttps(v)) return `O campo ${key} deve ser um link https válido.`;
    } else if (key === "category") {
      if (v !== "" && !DRAFT_LIMITS.categories.includes(v)) return `O campo category é desconhecido.`;
    } else if (v.length > (DRAFT_LIMITS.text[key] ?? 0)) {
      return `O campo ${key} passa de ${DRAFT_LIMITS.text[key]} caracteres.`;
    }
  }
  for (const [key, maxCount, maxLen] of [
    ["tags", DRAFT_LIMITS.maxTags, DRAFT_LIMITS.maxTagLength],
    ["people", DRAFT_LIMITS.maxPeople, DRAFT_LIMITS.maxPersonLength],
  ] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      return `O campo ${key} deve ser uma lista de textos.`;
    }
    if (v.length > maxCount) return `O campo ${key} passa de ${maxCount} itens.`;
    if (v.some((x: string) => x.length > maxLen)) {
      return `O campo ${key} tem item com mais de ${maxLen} caracteres.`;
    }
  }
  return null;
}

function planError(raw: unknown): string | null {
  if (!Array.isArray(raw)) return "O campo plan deve ser uma lista.";
  if (raw.length > DRAFT_LIMITS.maxPlanItems) {
    return `O campo plan passa de ${DRAFT_LIMITS.maxPlanItems} itens.`;
  }
  for (let i = 0; i < raw.length; i++) {
    const item: unknown = raw[i];
    if (!isRecord(item)) return `plan, item ${i + 1}: deve ser um objeto.`;
    for (const key of Object.keys(item)) {
      if (key !== "text" && key !== "list") return `plan, item ${i + 1}: chave não permitida: ${key}.`;
    }
    if (item.list !== "checklist" && item.list !== "compras") {
      return `plan, item ${i + 1}: list inválida.`;
    }
    if (typeof item.text !== "string" || item.text.trim() === "") {
      return `plan, item ${i + 1}: text não pode ficar em branco.`;
    }
    if (item.text.length > DRAFT_LIMITS.planTextMax) {
      return `plan, item ${i + 1}: text passa de ${DRAFT_LIMITS.planTextMax} caracteres.`;
    }
  }
  return null;
}

/** `#rascunho=<base64url>` -> validated draft, or the reason it was refused. */
export function parseDraft(fragment: string): ParseDraftResult {
  if (!isDraftFragment(fragment)) return fail("O link não é de um rascunho.");
  const payload = fragment.slice(DRAFT_FRAGMENT_PREFIX.length);
  if (payload === "") return fail("O rascunho está vazio.");
  if (payload.length > MAX_ENCODED_LENGTH) return fail(TOO_BIG);
  const text = decode(payload);
  if (text === null) return fail("O rascunho está danificado (base64 inválido).");
  if (text === TOO_BIG) return fail(TOO_BIG);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("O rascunho está danificado (JSON inválido).");
  }
  if (!isRecord(json)) return fail("O rascunho deve ser um objeto.");
  if (json.v !== 1) return fail("Versão de rascunho não suportada.");
  if (json.kind !== "novo" && json.kind !== "atualizacao") {
    return fail("Tipo de rascunho desconhecido (kind).");
  }
  const isNew = json.kind === "novo";
  const allowed = isNew ? ["v", "kind", "fields"] : ["v", "kind", "id", "fields", "plan"];
  for (const key of Object.keys(json)) {
    if (!allowed.includes(key)) return fail(`Chave não permitida no rascunho: ${key}.`);
  }
  if (!isNew && (typeof json.id !== "string" || !UUID_RE.test(json.id))) {
    return fail("O campo id deve ser um uuid.");
  }
  if (isNew || json.fields !== undefined) {
    const problem = fieldsError(json.fields, isNew);
    if (problem) return fail(problem);
  }
  if (json.plan !== undefined) {
    const problem = planError(json.plan);
    if (problem) return fail(problem);
  }
  if (!isNew) {
    const hasFields = isRecord(json.fields) && Object.keys(json.fields).length > 0;
    const hasPlan = Array.isArray(json.plan) && json.plan.length > 0;
    if (!hasFields && !hasPlan) return fail("O rascunho de atualização não propõe nada.");
  }
  return { ok: true, draft: json as unknown as Draft };
}
