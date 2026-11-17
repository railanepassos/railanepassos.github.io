import { describe, expect, it } from "vitest";
import {
  SHARED_PLAN_CONFLICT,
  SHARED_PLAN_INACTIVE,
  SHARED_PLAN_SAVE_ERROR,
  buildSharedPlanView,
  classifyPlanWriteError,
  planWriteErrorMessage,
  isPlanShareFragment,
  parsePlanFragment,
  planShareUrl,
} from "../../src/links/plan-share";

const TOKEN = "0123456789abcdef".repeat(4);

describe("parsePlanFragment", () => {
  it("extracts a valid token from #plano=<token>", () => {
    expect(parsePlanFragment(`#plano=${TOKEN}`)).toBe(TOKEN);
  });

  it("accepts 32 to 64 lowercase hex characters", () => {
    expect(parsePlanFragment(`#plano=${"a".repeat(32)}`)).toBe("a".repeat(32));
    expect(parsePlanFragment(`#plano=${"a".repeat(64)}`)).toBe("a".repeat(64));
  });

  it.each([
    ["empty hash", ""],
    ["just #", "#"],
    ["other fragment", "#lugar=abc"],
    ["no token", "#plano="],
    ["too short", `#plano=${"a".repeat(31)}`],
    ["too long", `#plano=${"a".repeat(65)}`],
    ["uppercase", `#plano=${"A".repeat(40)}`],
    ["non-hex", `#plano=${"g".repeat(40)}`],
    ["trailing junk", `#plano=${TOKEN}&x=1`],
    ["leading junk", `#x=1&plano=${TOKEN}`],
    ["without the hash", `plano=${TOKEN}`],
  ])("rejects %s", (_n, hash) => {
    expect(parsePlanFragment(hash)).toBeNull();
  });
});

describe("isPlanShareFragment", () => {
  it("is true for any #plano= fragment, valid token or not", () => {
    expect(isPlanShareFragment(`#plano=${TOKEN}`)).toBe(true);
    expect(isPlanShareFragment("#plano=lixo")).toBe(true);
    expect(isPlanShareFragment("#plano=")).toBe(true);
  });

  it("is false otherwise", () => {
    expect(isPlanShareFragment("")).toBe(false);
    expect(isPlanShareFragment("#outro")).toBe(false);
    expect(isPlanShareFragment("#share-target")).toBe(false);
  });
});

describe("planShareUrl", () => {
  it("puts the token in the fragment of the page url", () => {
    expect(planShareUrl("https://railanepassos.com", TOKEN)).toBe(
      `https://railanepassos.com/p/a8f3k2/#plano=${TOKEN}`
    );
  });
});

describe("SHARED_PLAN_INACTIVE", () => {
  it("is the PT-BR inactive message", () => {
    expect(SHARED_PLAN_INACTIVE).toBe("Este link não está mais ativo");
  });
});

describe("buildSharedPlanView", () => {
  const RAW = {
    label: "Lugar Compartilhado",
    scheduled_start: "2026-12-05T09:00:00-03:00",
    scheduled_end: "2026-12-05T17:30:00-03:00",
    city: "Cidade Teste",
    address: "Rua Fictícia, 10",
    itinerary: "Chegar cedo",
    people: ["Alana", "Bia Teste"],
    plan_items: [
      { text: "Comprar ingressos", list: "checklist", who: "Alana", done: true },
      { text: "Protetor solar", list: "checklist", done: false },
      { text: "Biscoitos", list: "compras", who: "Bia Teste", done: false },
    ],
  };

  it("maps the rpc payload to a view model", () => {
    const view = buildSharedPlanView(RAW);
    expect(view).toEqual({
      title: "Lugar Compartilhado",
      when: "5 dez 2026 · 09:00–17:30",
      where: "Cidade Teste · Rua Fictícia, 10",
      itinerary: "Chegar cedo",
      people: ["Alana", "Bia Teste"],
      lists: [
        {
          key: "checklist",
          title: "Checklist",
          progress: "1 de 2",
          items: [
            { idx: 0, text: "Comprar ingressos", who: "Alana", done: true },
            { idx: 1, text: "Protetor solar", who: null, done: false },
          ],
        },
        {
          key: "compras",
          title: "Lanches e compras",
          progress: "0 de 1",
          items: [{ idx: 2, text: "Biscoitos", who: "Bia Teste", done: false }],
        },
      ],
    });
  });

  it("leaves out empty fields and lists", () => {
    const view = buildSharedPlanView({
      label: "Só o nome",
      scheduled_start: null,
      scheduled_end: null,
      city: null,
      address: "  ",
      itinerary: null,
      people: null,
      plan_items: null,
    });
    expect(view).toEqual({
      title: "Só o nome",
      when: null,
      where: null,
      itinerary: null,
      people: [],
      lists: [],
    });
  });

  it("drops malformed plan items defensively", () => {
    const view = buildSharedPlanView({ ...RAW, plan_items: [{ text: "", list: "x" }, 5, null] });
    expect(view!.lists).toEqual([]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "x"],
    ["an array", []],
    ["a payload without label", { city: "x" }],
    ["a blank label", { label: "  " }],
  ])("returns null for %s", (_n, raw) => {
    expect(buildSharedPlanView(raw)).toBeNull();
  });
});

describe("buildSharedPlanView idx", () => {
  it("keeps the index in the stored array even when a malformed item is skipped", () => {
    const view = buildSharedPlanView({
      label: "X",
      plan_items: [
        { text: "  ", list: "checklist", done: false },
        { text: "Dois", list: "compras", done: false },
        { text: "Tres", list: "checklist", done: true },
      ],
    });
    const all = view!.lists.flatMap((l) => l.items.map((i) => [i.idx, i.text]));
    expect(all.sort()).toEqual([[1, "Dois"], [2, "Tres"]].sort());
  });
});

describe("classifyPlanWriteError", () => {
  it("reads the server message", () => {
    expect(classifyPlanWriteError(400, { message: "conflict" })).toBe("conflict");
    expect(classifyPlanWriteError(400, { message: "inactive" })).toBe("inactive");
  });

  it.each([
    ["invalid message", 400, { message: "invalid" }],
    ["unknown message", 400, { message: "boom" }],
    ["server error", 500, { message: "conflict-ish" }],
    ["no body", 400, null],
    ["string body", 400, "conflict"],
    ["network (status 0)", 0, undefined],
  ])("maps %s to a generic error", (_n, status, body) => {
    expect(classifyPlanWriteError(status, body)).toBe("error");
  });
});

describe("planWriteErrorMessage", () => {
  it("is PT-BR for each kind", () => {
    expect(planWriteErrorMessage("conflict")).toBe("O plano mudou, recarregamos para você");
    expect(planWriteErrorMessage("conflict")).toBe(SHARED_PLAN_CONFLICT);
    expect(planWriteErrorMessage("inactive")).toBe(SHARED_PLAN_INACTIVE);
    expect(planWriteErrorMessage("error")).toBe(SHARED_PLAN_SAVE_ERROR);
    expect(SHARED_PLAN_SAVE_ERROR).toBe("Não foi possível salvar. Tente de novo.");
  });
});
