#!/usr/bin/env node
// Prints the app URL that opens a Bucket List draft (Phase 5).
// Usage: npm run draft-url -- [file.json]   (reads stdin when no file or "-")
// Reuses src/links/draft.ts, so it applies the exact rules of the app.
// Needs Node 22 type stripping: run it through the npm script, which adds the flag.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { encodeDraft, parseDraft } from "../src/links/draft.ts";

export const DRAFT_BASE_URL = "https://railanepassos.tec.br/p/a8f3k2/";

/** JSON text -> `{ ok: true, url }` or `{ ok: false, reason }`. */
export function draftUrl(jsonText) {
  let json;
  try {
    json = JSON.parse(jsonText);
  } catch {
    return { ok: false, reason: "O arquivo não é um JSON válido." };
  }
  // Validate the exact fragment the app will receive, not only the input object.
  const fragment = encodeDraft(json);
  const parsed = parseDraft(fragment);
  if (!parsed.ok) return parsed;
  return { ok: true, url: DRAFT_BASE_URL + fragment };
}

function main() {
  const arg = process.argv[2];
  let text;
  try {
    text = readFileSync(arg && arg !== "-" ? arg : 0, "utf8");
  } catch (err) {
    console.error(`Erro: não consegui ler a entrada (${err.message}).`);
    process.exit(2);
  }
  const result = draftUrl(text);
  if (!result.ok) {
    console.error(`Rascunho inválido: ${result.reason}`);
    process.exit(1);
  }
  console.log(result.url);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
