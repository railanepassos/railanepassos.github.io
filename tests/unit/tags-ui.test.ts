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
import type { LinkRow } from "../../src/links/links-repo";

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
  };
}

function viewCb() {
  return {
    onEdit: vi.fn(),
    onSchedule: vi.fn(),
    onMarkDone: vi.fn(),
    onDelete: vi.fn(),
    onTag: vi.fn(),
  };
}

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

describe("Phase 2: tags", () => {
  it("maps tags to the payload: normalized, deduped, empty -> null", () => {
    const input = toCreateInput(formValues({ tags: ["#Praia", "praia", "Grátis"] }), 0);
    expect(input.tags).toEqual(["praia", "grátis"]);
    expect(toUpdatePatch(formValues({ tags: [] })).tags).toBeNull();
    expect(toUpdatePatch(formValues()).tags).toBeNull();
  });

  it("rejects more than 30 tags with a PT-BR message", () => {
    const many = Array.from({ length: 31 }, (_, i) => `t${i}`);
    expect(() => toCreateInput(formValues({ tags: many }), 0)).toThrow(/tags/i);
  });

  it("card shows tag chips and tapping one calls onTag without opening the card", () => {
    const cb = cardCb();
    const card = renderAdminCard(row({ tags: ["praia", "grátis"] }), cb);
    const chips = [...card.querySelectorAll<HTMLButtonElement>(".feed-card__tag")];
    expect(chips.map((c) => c.textContent)).toEqual(["#praia", "#grátis"]);
    chips[1].click();
    expect(cb.onTag).toHaveBeenCalledWith("grátis");
    expect(cb.onView).not.toHaveBeenCalled();
  });

  it("legacy card has no tag row", () => {
    expect(renderAdminCard(row(), cardCb()).querySelector(".feed-card__tags")).toBeNull();
  });

  it("detail shows tags as tappable chips; tapping closes the detail and calls onTag", () => {
    const cb = viewCb();
    const modal = createViewModal(cb);
    document.body.appendChild(modal.element);
    modal.open(row({ tags: ["praia", "grátis"] }));
    const section = modal.element.querySelector("[data-field='tags']") as HTMLElement;
    expect(section.hidden).toBe(false);
    const chips = [...section.querySelectorAll<HTMLButtonElement>(".links-detail__tag")];
    expect(chips.map((c) => c.textContent)).toEqual(["#praia", "#grátis"]);
    chips[0].click();
    expect(cb.onTag).toHaveBeenCalledWith("praia");
    expect(modal.element.hidden).toBe(true);

    modal.open(row());
    expect((modal.element.querySelector("[data-field='tags']") as HTMLElement).hidden).toBe(true);
  });

  it("tag text stays literal (no markup injection)", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    modal.open(row({ tags: ["<img src=x>"] }));
    expect(modal.element.querySelector("[data-field='tags'] img")).toBeNull();
  });

  it("form adds tags with autocomplete, round-trips on edit and submits them", () => {
    const onSubmit = vi.fn();
    const modal = createLinkFormModal(onSubmit, { getTagSuggestions: () => ["grátis", "praia"] });
    document.body.appendChild(modal.element);
    const more = modal.element.querySelector("details.links-admin-form__more") as HTMLDetailsElement;
    modal.openCreate();
    expect(more.open).toBe(false);

    const input = modal.element.querySelector("#links-form-tags") as HTMLInputElement;
    expect(modal.element.querySelector("label[for='links-form-tags']")?.textContent).toMatch(/Tags/);
    input.focus();
    input.value = "gra";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    (modal.element.querySelector(".chip-input__suggestion") as HTMLButtonElement).click();
    // text still being typed is flushed on submit
    input.value = "#Museu";
    (modal.element.querySelector("#links-form-url") as HTMLInputElement).value = "https://example.com";
    modal.element.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["grátis", "museu"] }),
      null
    );

    modal.openEdit(row({ tags: ["praia"] }));
    expect(more.open).toBe(true);
    expect(modal.element.querySelector(".chip-input__chip")?.textContent).toContain("#praia");
    modal.openCreate();
    expect(modal.element.querySelector(".chip-input__chip")).toBeNull();
  });
});
