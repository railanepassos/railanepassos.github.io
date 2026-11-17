/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderSharedPlan, renderSharedPlanMessage } from "../../src/links/shared-plan-ui";
import { buildSharedPlanView } from "../../src/links/plan-share";

const VIEW = buildSharedPlanView({
  label: "Lugar Compartilhado",
  scheduled_start: "2026-12-05T09:00:00-03:00",
  scheduled_end: "2026-12-05T17:30:00-03:00",
  city: "Cidade Teste",
  address: "Rua Fictícia, 10",
  itinerary: "Chegar cedo\nAlmoço",
  people: ["Alana", "Bia Teste"],
  plan_items: [
    { text: "Comprar ingressos", list: "checklist", who: "Alana", done: true },
    { text: "Biscoitos", list: "compras", done: false },
  ],
})!;

let root: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement("div");
  document.body.appendChild(root);
});

describe("renderSharedPlan", () => {
  it("renders the plan with one checkbox per item and no buttons, links or text fields", () => {
    renderSharedPlan(root, VIEW, vi.fn());
    expect(root.querySelector("h2")!.textContent).toBe("Lugar Compartilhado");
    const text = root.textContent!;
    for (const part of [
      "5 dez 2026 · 09:00–17:30",
      "Cidade Teste · Rua Fictícia, 10",
      "Chegar cedo",
      "Alana, Bia Teste",
      "Checklist · 1 de 1",
      "Comprar ingressos",
      "Lanches e compras · 0 de 1",
      "Biscoitos",
    ]) {
      expect(text).toContain(part);
    }
    expect(root.querySelector("button, a, textarea, select, input:not([type=checkbox])")).toBeNull();
    expect(root.querySelectorAll("input[type=checkbox]")).toHaveLength(2);
  });

  it("checks done items and labels each checkbox with the item text", () => {
    renderSharedPlan(root, VIEW, vi.fn());
    const boxes = [...root.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    expect(boxes[0]!.closest("label")!.textContent).toContain("Comprar ingressos");
  });

  it("reports a toggle with the stored index, the text and the new value", () => {
    const onToggle = vi.fn();
    renderSharedPlan(root, VIEW, onToggle);
    root.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1]!.click();
    expect(onToggle).toHaveBeenCalledWith(1, "Biscoitos", true);
  });

  it("shows a notice as a status above the plan", () => {
    renderSharedPlan(root, VIEW, vi.fn(), "O plano mudou, recarregamos para você");
    expect(root.querySelector("[role=status]")!.textContent).toBe(
      "O plano mudou, recarregamos para você"
    );
  });

  it("escapes content (text only, never HTML)", () => {
    const evil = buildSharedPlanView({ label: "<img src=x onerror=alert(1)>", people: ["<b>x</b>"] })!;
    renderSharedPlan(root, evil, vi.fn());
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("b")).toBeNull();
    expect(root.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("renderSharedPlanMessage", () => {
  it("shows the message as a status without any login UI", () => {
    renderSharedPlanMessage(root, "Este link não está mais ativo");
    expect(root.textContent).toBe("Este link não está mais ativo");
    expect(root.querySelector("[role='status'], [role='alert']")).not.toBeNull();
    expect(root.querySelector("input, button, form")).toBeNull();
  });
});
