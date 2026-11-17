import { describe, expect, it } from "vitest";
import { buildPlanMessage, whatsappUrl } from "../../src/links/plan-message";

const FULL = {
  label: "Lugar Planejado",
  city: "Cidade Teste",
  address: "Rua Fictícia, 10",
  itinerary: "Chegar cedo\nAlmoço no local",
  scheduled_start: "2026-12-05T09:00:00-03:00",
  scheduled_end: "2026-12-05T17:30:00-03:00",
  people: ["Alana", "Bia Teste"],
  plan_items: [
    { text: "Comprar ingressos", list: "checklist" as const, who: "Alana", done: true },
    { text: "Protetor solar", list: "checklist" as const, done: false },
    { text: "Biscoitos", list: "compras" as const, who: "Bia Teste", done: false },
  ],
};

const TOKEN = "0123456789abcdef".repeat(4);
const ORIGIN = "https://railanepassos.tec.br";

describe("buildPlanMessage plan link", () => {
  it("appends the share URL only when the link has a token", () => {
    const withToken = buildPlanMessage({ ...FULL, plan_share_token: TOKEN }, ORIGIN);
    expect(withToken.endsWith(`\n\nPlano: ${ORIGIN}/p/a8f3k2/#plano=${TOKEN}`)).toBe(true);
    expect(buildPlanMessage({ ...FULL, plan_share_token: null }, ORIGIN)).not.toContain("Plano:");
    expect(buildPlanMessage(FULL, ORIGIN)).not.toContain("#plano=");
  });

  it("omits the link when no origin is given", () => {
    expect(buildPlanMessage({ ...FULL, plan_share_token: TOKEN })).not.toContain("#plano=");
  });
});

describe("buildPlanMessage", () => {
  it("builds every section in PT-BR with done/pending marks", () => {
    expect(buildPlanMessage(FULL)).toBe(
      [
        "Lugar Planejado",
        "5 dez 2026 · 09:00–17:30",
        "Cidade Teste · Rua Fictícia, 10",
        "",
        "Roteiro",
        "Chegar cedo\nAlmoço no local",
        "",
        "Quem vai: Alana, Bia Teste",
        "",
        "Quem faz o quê",
        "Alana: ✓ Comprar ingressos",
        "Bia Teste: ☐ Biscoitos",
        "",
        "Checklist",
        "✓ Comprar ingressos (Alana)",
        "☐ Protetor solar",
        "",
        "Lanches e compras",
        "☐ Biscoitos (Bia Teste)",
      ].join("\n")
    );
  });

  it("omits empty sections", () => {
    expect(buildPlanMessage({ label: "Só o lugar", people: ["Alana"] })).toBe(
      ["Só o lugar", "", "Quem vai: Alana"].join("\n")
    );
  });

  it("omits the schedule when only one end is set and keeps a lone city", () => {
    const msg = buildPlanMessage({
      label: "X",
      city: "Cidade Teste",
      scheduled_start: "2026-12-05T09:00:00-03:00",
    });
    expect(msg).toBe("X\nCidade Teste");
  });
});

describe("whatsappUrl", () => {
  it("encodes the whole text into a wa.me link", () => {
    expect(whatsappUrl("a b\n✓ & ç")).toBe("https://wa.me/?text=a%20b%0A%E2%9C%93%20%26%20%C3%A7");
  });
});
