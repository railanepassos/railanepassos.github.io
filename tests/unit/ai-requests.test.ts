import { describe, expect, it } from "vitest";
import {
  countReady,
  defaultAgendaRange,
  formatLastRun,
  hasActive,
  parseAiResult,
  statusLabel,
  validateAiPayload,
  type AiRequestRow,
  type AiRequestStatus,
} from "../../src/links/ai-requests";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const uuids = (n: number) =>
  Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const post = (i: number) => `https://www.instagram.com/p/ABC${i}/`;

function row(status: AiRequestStatus): AiRequestRow {
  return {
    id: "r",
    kind: "agenda",
    status,
    payload: {},
    result: null,
    error: null,
    created_at: "2026-11-22T10:00:00Z",
    updated_at: "2026-11-22T10:00:00Z",
    processed_at: null,
  };
}

describe("validateAiPayload instagram", () => {
  it("accepts urls and normalizes (trim, dedupe)", () => {
    const r = validateAiPayload("instagram", { post_urls: [` ${post(1)} `, post(1), post(2)], from_dms: false });
    expect(r).toEqual({ ok: true, payload: { post_urls: [post(1), post(2)], from_dms: false } });
  });

  it("accepts only from_dms", () => {
    expect(validateAiPayload("instagram", { post_urls: [], from_dms: true })).toEqual({
      ok: true,
      payload: { post_urls: [], from_dms: true },
    });
  });

  it("needs at least one url or from_dms", () => {
    const r = validateAiPayload("instagram", { post_urls: [], from_dms: false });
    expect(r.ok).toBe(false);
  });

  it("rejects more than 10 urls, but 10 is fine", () => {
    const ten = Array.from({ length: 10 }, (_, i) => post(i));
    expect(validateAiPayload("instagram", { post_urls: ten, from_dms: false }).ok).toBe(true);
    expect(validateAiPayload("instagram", { post_urls: [...ten, post(99)], from_dms: false }).ok).toBe(false);
  });

  it("rejects non-instagram, http and garbage urls", () => {
    for (const bad of ["https://example.com/p/1", "http://www.instagram.com/p/1/", "not a url", "https://evil.com/www.instagram.com/"]) {
      const r = validateAiPayload("instagram", { post_urls: [bad], from_dms: false });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/Instagram/i);
    }
  });

  it("rejects a non-object payload or wrong types", () => {
    expect(validateAiPayload("instagram", null).ok).toBe(false);
    expect(validateAiPayload("instagram", { post_urls: "x", from_dms: true }).ok).toBe(false);
    expect(validateAiPayload("instagram", { post_urls: [], from_dms: "yes" }).ok).toBe(false);
  });
});

describe("validateAiPayload refinar", () => {
  it("accepts and dedupes", () => {
    const r = validateAiPayload("refinar", { link_ids: [ID1, ID1, ID2], options: ["dossie", "dossie", "imagem"] });
    expect(r).toEqual({ ok: true, payload: { link_ids: [ID1, ID2], options: ["dossie", "imagem"] } });
  });

  it("limits 1..10 links and 1..4 options", () => {
    expect(validateAiPayload("refinar", { link_ids: [], options: ["dossie"] }).ok).toBe(false);
    expect(validateAiPayload("refinar", { link_ids: [ID1], options: [] }).ok).toBe(false);
    expect(validateAiPayload("refinar", { link_ids: uuids(10), options: ["roteiro"] }).ok).toBe(true);
    expect(validateAiPayload("refinar", { link_ids: uuids(11), options: ["roteiro"] }).ok).toBe(false);
  });

  it("rejects bad ids and unknown options", () => {
    expect(validateAiPayload("refinar", { link_ids: ["x"], options: ["dossie"] }).ok).toBe(false);
    expect(validateAiPayload("refinar", { link_ids: [ID1], options: ["magia"] }).ok).toBe(false);
  });
});

describe("validateAiPayload agenda", () => {
  it("accepts a range and keeps only the two dates", () => {
    expect(
      validateAiPayload("agenda", { range_start: "2026-12-01", range_end: "2026-12-31", extra: 1 })
    ).toEqual({ ok: true, payload: { range_start: "2026-12-01", range_end: "2026-12-31" } });
    expect(validateAiPayload("agenda", { range_start: "2026-12-01", range_end: "2026-12-01" }).ok).toBe(true);
  });

  it("accepts exactly 180 days and rejects 181", () => {
    expect(validateAiPayload("agenda", { range_start: "2026-01-01", range_end: "2026-06-30" }).ok).toBe(true);
    const r = validateAiPayload("agenda", { range_start: "2026-01-01", range_end: "2026-07-01" });
    expect(r.ok).toBe(false);
  });

  it("rejects end before start, bad formats and impossible dates", () => {
    expect(validateAiPayload("agenda", { range_start: "2026-12-10", range_end: "2026-12-09" }).ok).toBe(false);
    expect(validateAiPayload("agenda", { range_start: "10/12/2026", range_end: "2026-12-20" }).ok).toBe(false);
    expect(validateAiPayload("agenda", { range_start: "2026-02-30", range_end: "2026-03-05" }).ok).toBe(false);
    expect(validateAiPayload("agenda", {}).ok).toBe(false);
  });
});

describe("statusLabel / countReady / hasActive", () => {
  it("labels every status in pt-BR", () => {
    expect(statusLabel("pendente")).toBe("Na fila");
    expect(statusLabel("processando")).toBe("Processando");
    expect(statusLabel("pronto")).toBe("Pronto");
    expect(statusLabel("erro")).toBe("Erro");
    expect(statusLabel("aplicado")).toBe("Aplicado");
    expect(statusLabel("descartado")).toBe("Descartado");
  });

  it("counts ready rows", () => {
    expect(countReady([row("pronto"), row("pendente"), row("pronto"), row("erro")])).toBe(2);
    expect(countReady([])).toBe(0);
  });

  it("detects pending or processing rows", () => {
    expect(hasActive([row("pronto"), row("aplicado")])).toBe(false);
    expect(hasActive([row("pronto"), row("pendente")])).toBe(true);
    expect(hasActive([row("processando")])).toBe(true);
    expect(hasActive([])).toBe(false);
  });
});

describe("parseAiResult", () => {
  const update = { v: 1, kind: "atualizacao", id: ID1, fields: { description: "Texto novo" } };

  it("turns a single draft into drafts:[d]", () => {
    const r = parseAiResult({ v: 1, kind: "novo", fields: { url: "https://a.example", label: "A" } });
    expect(r.ok).toBe(true);
    if (r.ok && r.type === "drafts") {
      expect(r.drafts).toHaveLength(1);
      expect(r.drafts[0]!.kind).toBe("novo");
    } else throw new Error("expected drafts");
  });

  it("accepts a queue draft as a single draft", () => {
    const r = parseAiResult({ v: 1, kind: "fila", items: [{ url: "https://a.example", label: "A" }, { url: "https://b.example", label: "B" }] });
    expect(r.ok && r.type === "drafts" && r.drafts[0]!.kind).toBe("fila");
  });

  it("accepts {v:1, drafts:[...]} with 1..10 update drafts", () => {
    const r = parseAiResult({ v: 1, drafts: [update, { ...update, id: ID2 }] });
    expect(r.ok && r.type === "drafts" && r.drafts.length).toBe(2);
    const ten = Array.from({ length: 10 }, () => update);
    expect(parseAiResult({ v: 1, drafts: ten }).ok).toBe(true);
    expect(parseAiResult({ v: 1, drafts: [...ten, update] }).ok).toBe(false);
    expect(parseAiResult({ v: 1, drafts: [] }).ok).toBe(false);
  });

  it("rejects an invalid draft inside drafts, with the reason", () => {
    const r = parseAiResult({ v: 1, drafts: [update, { v: 1, kind: "atualizacao", id: "nao-uuid" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    expect(parseAiResult({ v: 1, drafts: [{ v: 1, kind: "novo", fields: { url: "https://a.example" } }] }).ok).toBe(false);
  });

  it("accepts an agenda proposal list", () => {
    const item = { link_id: ID1, start: "2026-12-05T09:00:00-03:00", end: "2026-12-05T17:00:00-03:00", event_title: "Passeio" };
    const r = parseAiResult({ v: 1, agenda: [item] });
    expect(r).toEqual({ ok: true, type: "agenda", proposals: [item] });
  });

  it("rejects agenda with start >= end, bad id, long title, wrong count", () => {
    const item = { link_id: ID1, start: "2026-12-05T09:00:00-03:00", end: "2026-12-05T17:00:00-03:00", event_title: "Passeio" };
    expect(parseAiResult({ v: 1, agenda: [{ ...item, end: item.start }] }).ok).toBe(false);
    expect(parseAiResult({ v: 1, agenda: [{ ...item, start: item.end, end: item.start }] }).ok).toBe(false);
    expect(parseAiResult({ v: 1, agenda: [{ ...item, link_id: "x" }] }).ok).toBe(false);
    expect(parseAiResult({ v: 1, agenda: [{ ...item, event_title: "x".repeat(201) }] }).ok).toBe(false);
    expect(parseAiResult({ v: 1, agenda: [] }).ok).toBe(false);
    expect(parseAiResult({ v: 1, agenda: Array.from({ length: 50 }, () => item) }).ok).toBe(true);
    expect(parseAiResult({ v: 1, agenda: Array.from({ length: 51 }, () => item) }).ok).toBe(false);
  });

  it("rejects agenda dates that are not ISO with T and an offset (they would break the label)", () => {
    const item = { link_id: ID1, start: "2026-12-05T09:00:00-03:00", end: "2026-12-05T17:00:00-03:00", event_title: "Passeio" };
    for (const start of ["2026-12-05 09:00", "Dec 5 2026 09:00", "2026-12-05T09:00", "2026-12-05", "2026-12-05T09:00:00"]) {
      const r = parseAiResult({ v: 1, agenda: [{ ...item, start }] });
      expect(r.ok, start).toBe(false);
    }
  });

  it("normalizes agenda dates to the app's -03:00 wall time (Z becomes local)", () => {
    const item = { link_id: ID1, start: "2026-12-05T12:00:00Z", end: "2026-12-05T20:30+00:00", event_title: "Passeio" };
    const r = parseAiResult({ v: 1, agenda: [item] });
    expect(r.ok && r.type === "agenda" && [r.proposals[0]!.start, r.proposals[0]!.end]).toEqual([
      "2026-12-05T09:00:00-03:00",
      "2026-12-05T17:30:00-03:00",
    ]);
  });

  it("rejects anything else", () => {
    for (const bad of [null, undefined, "texto", 3, [], {}, { v: 2, drafts: [] }, { v: 1, foo: 1 }, { v: 1, kind: "outro" }]) {
      const r = parseAiResult(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBeTruthy();
    }
  });
});

describe("defaultAgendaRange", () => {
  it("is today to today+60 in local dates", () => {
    expect(defaultAgendaRange(new Date(2026, 10, 22, 23, 30))).toEqual({
      range_start: "2026-11-22",
      range_end: "2027-01-21",
    });
  });

  it("is a valid agenda payload", () => {
    const r = defaultAgendaRange(new Date(2026, 0, 1));
    expect(validateAiPayload("agenda", r).ok).toBe(true);
  });
});

describe("formatLastRun", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it("says it never ran", () => {
    expect(formatLastRun(null, now)).toBe("Ainda não rodou");
  });
  it("formats recent, minutes, hours and days", () => {
    expect(formatLastRun(ago(20_000), now)).toBe("Última verificação: agora há pouco");
    expect(formatLastRun(ago(12 * 60_000), now)).toBe("Última verificação: há 12 min");
    expect(formatLastRun(ago(2 * 3_600_000 + 5 * 60_000), now)).toBe("Última verificação: há 2 h");
    expect(formatLastRun(ago(3 * 86_400_000), now)).toBe("Última verificação: há 3 d");
  });
  it("treats a future or invalid timestamp safely", () => {
    expect(formatLastRun(ago(-60_000), now)).toBe("Última verificação: agora há pouco");
    expect(formatLastRun("lixo", now)).toBe("Ainda não rodou");
  });
});
