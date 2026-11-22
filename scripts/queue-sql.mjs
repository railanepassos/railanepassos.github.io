#!/usr/bin/env node
// Prints the SQL the Bucket List queue mode (SKILL.md) pastes into `execute_sql`.
// Usage:
//   npm run queue-sql -- check <kind> <payload.json>
//   npm run queue-sql -- complete <uuid> <result.json>
//   npm run queue-sql -- fail <uuid> <motivo>
// Untrusted text (posts, DMs, pages) ends up inside `result`/`error`, so it is
// escaped here as a standard SQL literal ('' for '), never dollar-quoted.
// Needs Node 22 type stripping: run it through the npm script, which adds the flag.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseAiResult, validateAiPayload } from "../src/links/ai-requests.ts";

export const MAX_RESULT_BYTES = 70000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["instagram", "refinar", "agenda"];
const PREAMBLE = "set standard_conforming_strings = on;";

/** Standard SQL string literal: only the single quote needs escaping. */
export function sqlLiteral(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

/** Size of `value::text` for a jsonb column (jsonb adds a space after ":" and ","). */
function jsonbTextBytes(value) {
  const text = (v) => {
    if (Array.isArray(v)) return `[${v.map(text).join(", ")}]`;
    if (v !== null && typeof v === "object") {
      return `{${Object.entries(v)
        .map(([k, x]) => `${JSON.stringify(k)}: ${text(x)}`)
        .join(", ")}}`;
    }
    return JSON.stringify(v);
  };
  return Buffer.byteLength(text(value), "utf8");
}

function parseJson(text, what) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: `${what} não é um JSON válido.` };
  }
}

/** -> `{ ok: true, payload }` or `{ ok: false, reason }`. */
export function checkPayload(kind, jsonText) {
  if (!KINDS.includes(kind)) return { ok: false, reason: "Tipo de pedido desconhecido." };
  const json = parseJson(jsonText, "O payload");
  if (!json.ok) return json;
  return validateAiPayload(kind, json.value);
}

/** -> `{ ok: true, sql }` or `{ ok: false, reason }`. */
export function completeSql(id, jsonText) {
  if (!UUID_RE.test(id)) return { ok: false, reason: "Id de pedido inválido." };
  const json = parseJson(jsonText, "O resultado");
  if (!json.ok) return json;
  const parsed = parseAiResult(json.value);
  if (!parsed.ok) return { ok: false, reason: `Resultado inválido: ${parsed.reason}` };
  if (JSON.stringify(json.value).includes("\\u0000")) {
    return { ok: false, reason: "Resultado inválido: caractere nulo no texto." };
  }
  if (jsonbTextBytes(json.value) > MAX_RESULT_BYTES) {
    return { ok: false, reason: "Resposta grande demais; peça menos lugares" };
  }
  const literal = sqlLiteral(JSON.stringify(json.value));
  return {
    ok: true,
    sql:
      `${PREAMBLE}\n` +
      `update public.links_ai_requests set status='pronto', result=${literal}::jsonb, error=null, processed_at=now() ` +
      `where id='${id.toLowerCase()}'::uuid and status='processando' returning id;`,
  };
}

/** -> `{ ok: true, sql }` or `{ ok: false, reason }`. */
export function failSql(id, reason) {
  if (!UUID_RE.test(id)) return { ok: false, reason: "Id de pedido inválido." };
  return {
    ok: true,
    sql:
      `${PREAMBLE}\n` +
      `update public.links_ai_requests set status='erro', error=left(${sqlLiteral(reason)},300), processed_at=now() ` +
      `where id='${id.toLowerCase()}'::uuid and status='processando' returning id;`,
  };
}

function readFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    console.error(`Erro: não consegui ler ${path} (${err.message}).`);
    process.exit(2);
  }
}

function main() {
  const [cmd, a, b] = process.argv.slice(2);
  let res;
  if (cmd === "check" && a && b) {
    res = checkPayload(a, readFile(b));
    if (res.ok) {
      console.log("ok");
      return;
    }
  } else if (cmd === "complete" && a && b) {
    res = completeSql(a, readFile(b));
  } else if (cmd === "fail" && a && b !== undefined) {
    res = failSql(a, process.argv.slice(4).join(" "));
  } else {
    console.error("Uso: queue-sql check <kind> <payload.json> | complete <uuid> <result.json> | fail <uuid> <motivo>");
    process.exit(2);
  }
  if (!res.ok) {
    console.error(res.reason);
    process.exit(1);
  }
  console.log(res.sql);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
