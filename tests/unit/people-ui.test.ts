/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLinkFormModal,
  createViewModal,
  renderAdminCard,
  toCreateInput,
  toUpdatePatch,
  type LinkFormValues,
} from "../../src/links/admin-ui";
import { createChipInput } from "../../src/links/chip-input";
import type { LinkRow } from "../../src/links/links-repo";
import { normalizePerson, personKey } from "../../src/links/people";

// Fake names only (LGPD): none of these refers to a real person.

function formValues(partial: Partial<LinkFormValues> = {}): LinkFormValues {
  return {
    url: "https://www.example.com/path",
    label: "",
    description: "",
    image_url: "",
    note: "",
    category: "",
    cost_text: "",
    city: "",
    address: "",
    dossier: "",
    itinerary: "",
    source_url: "",
    pose_refs: [],
    tags: [],
    people: [],
    ...partial,
  };
}

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "link-1",
    url: "https://example.com",
    label: "Museu",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
    sort_order: 0,
    scheduled_start: null,
    scheduled_end: null,
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    ...partial,
  };
}

function cardCb() {
  return {
    onView: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onMarkDone: vi.fn(),
    onSchedule: vi.fn(),
    onTag: vi.fn(),
    onPerson: vi.fn(),
  };
}

function viewCb() {
  return {
    onEdit: vi.fn(),
    onSchedule: vi.fn(),
    onMarkDone: vi.fn(),
    onDelete: vi.fn(),
    onTag: vi.fn(),
    onPerson: vi.fn(),
  };
}

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

function inputOf(c: { element: HTMLElement }): HTMLInputElement {
  return c.element.querySelector("input") as HTMLInputElement;
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("chip input without space splitting", () => {
  it("keeps 'Maria Clara' as one chip; comma commits", () => {
    const c = createChipInput({
      id: "p",
      label: "Pessoas",
      prefix: "@",
      normalize: normalizePerson,
      key: personKey,
      max: 30,
      maxLength: 80,
      splitOnSpace: false,
      getSuggestions: () => [],
    });
    document.body.appendChild(c.element);
    type(inputOf(c), "Maria Clara");
    expect(c.getValues()).toEqual([]);
    type(inputOf(c), "Maria Clara, Bia ");
    expect(c.getValues()).toEqual(["Maria Clara"]);
    c.commit();
    expect(c.getValues()).toEqual(["Maria Clara", "Bia"]);
    expect(c.element.querySelector(".chip-input__chip")?.textContent).toContain("@Maria Clara");
  });
});

describe("Phase 2: people", () => {
  it("maps people to the payload: normalized, deduped, empty -> null", () => {
    expect(toCreateInput(formValues({ people: ["@Maria  Clara", "maria clara", "Bia"] }), 0).people).toEqual([
      "Maria Clara",
      "Bia",
    ]);
    expect(toUpdatePatch(formValues({ people: [] })).people).toBeNull();
    expect(toUpdatePatch(formValues()).people).toBeNull();
  });

  it("rejects more than 30 people with a PT-BR message", () => {
    const many = Array.from({ length: 31 }, (_, i) => `Pessoa ${i}`);
    expect(() => toCreateInput(formValues({ people: many }), 0)).toThrow(/pessoas/i);
  });

  it("card shows person chips; tapping one calls onPerson without opening the card", () => {
    const cb = cardCb();
    const card = renderAdminCard(row({ people: ["Maria Clara", "Bia"] }), cb);
    const chips = [...card.querySelectorAll<HTMLButtonElement>(".feed-card__person")];
    expect(chips.map((c) => c.textContent)).toEqual(["@Maria Clara", "@Bia"]);
    expect(chips[0].getAttribute("aria-label")).toBe("Filtrar por @Maria Clara");
    chips[0].click();
    expect(cb.onPerson).toHaveBeenCalledWith("Maria Clara");
    expect(cb.onView).not.toHaveBeenCalled();
  });

  it("legacy card has no people row", () => {
    expect(renderAdminCard(row(), cardCb()).querySelector(".feed-card__people")).toBeNull();
  });

  it("detail shows people as chips; tapping closes the detail and calls onPerson", () => {
    const cb = viewCb();
    const modal = createViewModal(cb);
    document.body.appendChild(modal.element);
    modal.open(row({ people: ["Maria Clara"] }));
    const section = modal.element.querySelector("[data-field='people']") as HTMLElement;
    expect(section.hidden).toBe(false);
    const chip = section.querySelector<HTMLButtonElement>(".links-detail__person")!;
    expect(chip.textContent).toBe("@Maria Clara");
    chip.click();
    expect(cb.onPerson).toHaveBeenCalledWith("Maria Clara");
    expect(modal.element.hidden).toBe(true);

    modal.open(row());
    expect((modal.element.querySelector("[data-field='people']") as HTMLElement).hidden).toBe(true);
  });

  it("person text stays literal (no markup injection)", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    modal.open(row({ people: ["<img src=x>"] }));
    expect(modal.element.querySelector("[data-field='people'] img")).toBeNull();
  });

  it("form: autocomplete, multi-word names, round-trip on edit, submit", () => {
    const onSubmit = vi.fn();
    const modal = createLinkFormModal(onSubmit, {
      getTagSuggestions: () => [],
      getPeopleSuggestions: () => ["Maria Clara", "Bia"],
    });
    document.body.appendChild(modal.element);
    const more = modal.element.querySelector("details.links-admin-form__more") as HTMLDetailsElement;
    modal.openCreate();

    const input = modal.element.querySelector("#links-form-people") as HTMLInputElement;
    expect(modal.element.querySelector("label[for='links-form-people']")?.textContent).toMatch(/Pessoas/);
    input.focus();
    type(input, "mar");
    const options = [...modal.element.querySelectorAll<HTMLButtonElement>(".chip-input__suggestion")];
    options.find((o) => o.textContent === "@Maria Clara")!.click();
    // text still being typed is flushed on submit; the space does not split it
    type(input, "Ze Teste");
    (modal.element.querySelector("#links-form-url") as HTMLInputElement).value = "https://example.com";
    modal.element.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ people: ["Maria Clara", "Ze Teste"] }),
      null
    );

    modal.openEdit(row({ people: ["Bia"] }));
    expect(more.open).toBe(true);
    expect(modal.element.querySelector(".chip-input__chip")?.textContent).toContain("@Bia");
    modal.openCreate();
    expect(modal.element.querySelector(".chip-input__chip")).toBeNull();
  });
});
