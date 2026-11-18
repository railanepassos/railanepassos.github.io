/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLinkFormModal,
  createScheduleSheet,
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

function modalSourceRows(q: <T extends HTMLElement>(sel: string) => T): number {
  return q<HTMLElement>(".links-sources__list").children.length;
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

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
});

describe("createScheduleSheet", () => {
  it("submits edited date and time values without autofocus", () => {
    const onSave = vi.fn();
    const sheet = createScheduleSheet();
    document.body.appendChild(sheet.element);

    sheet.open({
      initial: { date: "2026-07-12", startTime: "09:00", endTime: "17:00" },
      hasSchedule: false,
      onSave,
    });

    const date = sheet.element.querySelector(
      "#links-schedule-date"
    ) as HTMLInputElement;
    const start = sheet.element.querySelector(
      "#links-schedule-start"
    ) as HTMLInputElement;
    const end = sheet.element.querySelector(
      "#links-schedule-end"
    ) as HTMLInputElement;

    expect(sheet.element.hidden).toBe(false);
    expect(document.activeElement).toBe(document.body);
    expect(sheet.element.textContent).toContain(
      "Padrão: deslocamento incluso (9h–17h). No local ~10h–16h."
    );
    expect(
      (sheet.element.querySelector('[data-action="download-ics"]') as HTMLElement)
        .hidden
    ).toBe(true);
    expect(
      (sheet.element.querySelector('[data-action="remove-schedule"]') as HTMLElement)
        .hidden
    ).toBe(true);

    date.value = "2026-08-03";
    start.value = "10:30";
    end.value = "16:15";
    sheet.element.querySelector("form")?.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true })
    );

    expect(onSave).toHaveBeenCalledWith({
      date: "2026-08-03",
      startTime: "10:30",
      endTime: "16:15",
    });
  });

  it("shows ICS and remove when hasSchedule, and success with undo after save feedback", () => {
    vi.useFakeTimers();
    const onDownloadIcs = vi.fn();
    const onRemove = vi.fn();
    const onUndo = vi.fn();
    const sheet = createScheduleSheet();
    document.body.appendChild(sheet.element);

    sheet.open({
      initial: { date: "2026-07-12", startTime: "09:00", endTime: "17:00" },
      hasSchedule: true,
      onSave: vi.fn(),
      onDownloadIcs,
      onRemove,
    });

    const downloadBtn = sheet.element.querySelector(
      '[data-action="download-ics"]'
    ) as HTMLButtonElement;
    const removeBtn = sheet.element.querySelector(
      '[data-action="remove-schedule"]'
    ) as HTMLButtonElement;
    expect(downloadBtn.hidden).toBe(false);
    expect(removeBtn.hidden).toBe(false);

    downloadBtn.click();
    expect(onDownloadIcs).toHaveBeenCalled();

    sheet.showSuccess("Agendamento salvo.", onUndo);
    const success = sheet.element.querySelector(
      ".links-admin-form__success"
    ) as HTMLElement;
    const dateField = sheet.element.querySelector(
      "#links-schedule-date"
    ) as HTMLElement;
    expect(success.compareDocumentPosition(dateField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sheet.element.textContent).toContain("Agendamento salvo.");
    const undoBtn = sheet.element.querySelector(
      '[data-action="undo-schedule"]'
    ) as HTMLButtonElement;
    expect(undoBtn.hidden).toBe(false);
    undoBtn.click();
    expect(onUndo).toHaveBeenCalled();

    sheet.showSuccess("Agendamento salvo.");
    expect(success.hidden).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(success.hidden).toBe(true);
    vi.useRealTimers();
  });

  it("shows form errors and toggles screen busy", () => {
    const sheet = createScheduleSheet();
    document.body.appendChild(sheet.element);
    sheet.open({
      initial: { date: "2026-07-12", startTime: "09:00", endTime: "17:00" },
      hasSchedule: false,
      onSave: vi.fn(),
    });

    sheet.setError("Data inválida.");
    expect(sheet.element.textContent).toContain("Data inválida.");

    sheet.setBusy(true);
    expect(sheet.element.querySelector(".links-skeleton-screen")).toBeTruthy();
    expect(
      sheet.element
        .querySelector(".links-admin-modal__dialog")
        ?.getAttribute("aria-busy")
    ).toBe("true");

    sheet.setBusy(false);
    expect(
      sheet.element
        .querySelector(".links-admin-modal__dialog")
        ?.hasAttribute("aria-busy")
    ).toBe(false);
  });
});

describe("createViewModal", () => {
  function callbacks() {
    return {
      onEdit: vi.fn(),
      onSchedule: vi.fn(),
      onMarkDone: vi.fn(),
      onDelete: vi.fn(),
    };
  }

  it("shows a hero image, a clean original-link anchor and an Agendar primary action", () => {
    const cb = callbacks();
    const modal = createViewModal(cb);
    document.body.appendChild(modal.element);

    modal.open(row({ url: "https://www.example.com/a/very/long/path?x=1" }));

    const hero = modal.element.querySelector(".links-detail__hero img") as HTMLImageElement;
    expect(hero.getAttribute("src")).toBe("/assets/img/categories/museu.jpg");
    const original = modal.element.querySelector(
      '[data-action="open-original"]'
    ) as HTMLAnchorElement;
    expect(original.textContent).toContain("Ver link original");
    expect(original.href).toBe("https://www.example.com/a/very/long/path?x=1");
    expect(modal.element.textContent).not.toContain("/a/very/long/path");

    const primary = modal.element.querySelector(
      ".links-detail__bar .links-detail__primary"
    ) as HTMLButtonElement;
    expect(primary.textContent?.trim()).toBe("Agendar");
    primary.click();
    expect(cb.onSchedule).toHaveBeenCalledWith(expect.objectContaining({ id: "link-1" }));
  });

  it("marks done from the bottom bar icon button", () => {
    const cb = callbacks();
    const modal = createViewModal(cb);
    document.body.appendChild(modal.element);
    modal.open(row());

    const done = modal.element.querySelector(
      '.links-detail__bar [aria-label="Marcar como feito"]'
    ) as HTMLButtonElement;
    expect(done).toBeTruthy();
    expect(done.hidden).toBe(false);
    done.click();
    expect(cb.onMarkDone).toHaveBeenCalled();
  });

  it("hides mark done for completed items", () => {
    const modal = createViewModal(callbacks());
    document.body.appendChild(modal.element);
    modal.open(row({ status: "done" }));
    const done = modal.element.querySelector(
      '.links-detail__bar [aria-label="Marcar como feito"]'
    ) as HTMLButtonElement;
    expect(done.hidden).toBe(true);
  });

  it("keeps Editar and Excluir inside the more-options menu", () => {
    const cb = callbacks();
    const modal = createViewModal(cb);
    document.body.appendChild(modal.element);
    modal.open(row());

    const menu = modal.element.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.hidden).toBe(true);
    (modal.element.querySelector('[aria-label="Mais opções"]') as HTMLButtonElement).click();
    expect(menu.hidden).toBe(false);
    const items = [...menu.querySelectorAll('[role="menuitem"]')].map((b) =>
      b.textContent?.trim()
    );
    expect(items).toEqual(["Editar", "Excluir"]);
    (menu.querySelectorAll('[role="menuitem"]')[1] as HTMLButtonElement).click();
    expect(cb.onDelete).toHaveBeenCalled();
  });

  it("shows the schedule row and Reagendar label when scheduled", () => {
    const modal = createViewModal(callbacks());
    document.body.appendChild(modal.element);

    modal.open(
      row({
        scheduled_start: "2026-08-03T09:00:00-03:00",
        scheduled_end: "2026-08-03T17:00:00-03:00",
      })
    );

    expect(modal.element.textContent).toContain("Agendado");
    expect(modal.element.textContent).toContain("3 ago 2026 · 09:00–17:00");
    expect(
      modal.element.querySelector(".links-detail__primary")?.textContent?.trim()
    ).toBe("Reagendar");
    expect(modal.element.textContent).not.toContain("Baixar ICS");
  });
});

describe("renderAdminCard", () => {
  function cardCallbacks() {
    return {
      onView: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onMarkDone: vi.fn(),
      onSchedule: vi.fn(),
    };
  }

  it("renders a schedule chip when start and end are present", () => {
    const card = renderAdminCard(
      row({
        scheduled_start: "2026-08-03T09:00:00-03:00",
        scheduled_end: "2026-08-03T17:00:00-03:00",
      }),
      cardCallbacks()
    );

    const chip = card.querySelector(".feed-card__schedule");
    expect(chip?.textContent).toBe("3 ago · 9–17");
  });

  it("is image-first with the category photo and a friendly title", () => {
    const card = renderAdminCard(
      row({ label: "google.com", url: "https://google.com/maps/place/Casa+Jorge+Amado/" }),
      cardCallbacks()
    );
    const img = card.querySelector(".feed-card__media img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/assets/img/categories/museu.jpg");
    expect(card.querySelector(".feed-card__title")?.textContent).toBe("Casa Jorge Amado");
  });

  it("exposes Feito and Agendar on the card", () => {
    const cb = cardCallbacks();
    const card = renderAdminCard(row(), cb);
    (card.querySelector('[data-action="done"]') as HTMLButtonElement).click();
    (card.querySelector('[data-action="schedule"]') as HTMLButtonElement).click();
    expect(cb.onMarkDone).toHaveBeenCalled();
    expect(cb.onSchedule).toHaveBeenCalled();
    expect(cb.onView).not.toHaveBeenCalled();
  });

  it("hides Feito for completed items", () => {
    const card = renderAdminCard(row({ status: "done" }), cardCallbacks());
    expect(card.querySelector('[data-action="done"]')).toBeNull();
  });

  it("opens the detail when the card body is clicked", () => {
    const cb = cardCallbacks();
    const card = renderAdminCard(row(), cb);
    (card.querySelector(".feed-card__open") as HTMLButtonElement).click();
    expect(cb.onView).toHaveBeenCalled();
  });

  it("keeps Excluir hidden until the more-options menu is opened", () => {
    const cb = cardCallbacks();
    const card = renderAdminCard(row(), cb);
    document.body.appendChild(card);
    const menu = card.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.hidden).toBe(true);

    const more = card.querySelector('[aria-label="Mais opções"]') as HTMLButtonElement;
    more.click();
    expect(menu.hidden).toBe(false);
    expect(more.getAttribute("aria-expanded")).toBe("true");

    const del = [...menu.querySelectorAll('[role="menuitem"]')].find(
      (b) => b.textContent?.trim() === "Excluir"
    ) as HTMLButtonElement;
    del.click();
    expect(cb.onDelete).toHaveBeenCalled();
    expect(menu.hidden).toBe(true);
  });
});

describe("toCreateInput category", () => {
  it("uses the picked category when provided", () => {
    const input = toCreateInput(formValues({ label: "Museu", category: "praia" }), 0);
    expect(input.category).toBe("praia");
  });

  it("infers the category when none is picked", () => {
    const input = toCreateInput(formValues({ label: "Museu do Mar" }), 0);
    expect(input.category).toBe("museu");
  });
});

describe("createLinkFormModal category chips", () => {
  it("submits the tapped category", () => {
    const onSubmit = vi.fn();
    const modal = createLinkFormModal(onSubmit);
    document.body.appendChild(modal.element);
    modal.openCreate();

    const auto = modal.element.querySelector('[data-category=""]') as HTMLButtonElement;
    expect(auto.getAttribute("aria-pressed")).toBe("true");
    const beach = modal.element.querySelector('[data-category="praia"]') as HTMLButtonElement;
    beach.click();
    expect(beach.getAttribute("aria-pressed")).toBe("true");
    expect(auto.getAttribute("aria-pressed")).toBe("false");

    (modal.element.querySelector("#links-form-url") as HTMLInputElement).value =
      "https://example.com";
    modal.element.querySelector("form")?.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true })
    );
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ category: "praia" }),
      null
    );
  });

  it("preselects the stored category when editing", () => {
    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openEdit(row({ category: "bar" }));
    expect(
      modal.element.querySelector('[data-category="bar"]')?.getAttribute("aria-pressed")
    ).toBe("true");
  });
});

describe("createLinkFormModal multi-select category chips", () => {
  function submitWith(modal: ReturnType<typeof createLinkFormModal>): void {
    (modal.element.querySelector("#links-form-url") as HTMLInputElement).value =
      "https://example.com";
    modal.element.querySelector("form")?.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true })
    );
  }
  function chipOf(modal: ReturnType<typeof createLinkFormModal>, value: string): HTMLButtonElement {
    return modal.element.querySelector(`[data-category="${value}"]`) as HTMLButtonElement;
  }

  it("marks the first ticked chip as main and submits main + extras", () => {
    const onSubmit = vi.fn();
    const modal = createLinkFormModal(onSubmit);
    document.body.appendChild(modal.element);
    modal.openCreate();
    chipOf(modal, "restaurante").click();
    chipOf(modal, "praia").click();
    chipOf(modal, "passeio").click();

    expect(chipOf(modal, "restaurante").dataset.main).toBe("true");
    expect(chipOf(modal, "restaurante").textContent).toMatch(/principal/i);
    expect(chipOf(modal, "praia").dataset.main).toBeUndefined();
    expect(chipOf(modal, "praia").getAttribute("aria-pressed")).toBe("true");

    submitWith(modal);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "restaurante",
        extra_categories: ["praia", "passeio"],
      }),
      null
    );
  });

  it("promotes the next chip when the main one is unticked", () => {
    const onSubmit = vi.fn();
    const modal = createLinkFormModal(onSubmit);
    document.body.appendChild(modal.element);
    modal.openCreate();
    chipOf(modal, "restaurante").click();
    chipOf(modal, "praia").click();
    chipOf(modal, "restaurante").click();
    expect(chipOf(modal, "praia").dataset.main).toBe("true");
    expect(chipOf(modal, "restaurante").getAttribute("aria-pressed")).toBe("false");
    submitWith(modal);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ category: "praia", extra_categories: [] }),
      null
    );
  });

  it("Automática clears every chip", () => {
    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openCreate();
    chipOf(modal, "restaurante").click();
    chipOf(modal, "praia").click();
    chipOf(modal, "").click();
    expect(chipOf(modal, "").getAttribute("aria-pressed")).toBe("true");
    expect(chipOf(modal, "restaurante").getAttribute("aria-pressed")).toBe("false");
    expect(modal.element.querySelector("[data-main]")).toBeNull();
  });

  it("enforces the limit of 4 and shows it", () => {
    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openCreate();
    for (const v of ["museu", "evento", "restaurante", "bar"]) chipOf(modal, v).click();
    expect(chipOf(modal, "praia").disabled).toBe(true);
    chipOf(modal, "praia").click();
    expect(chipOf(modal, "praia").getAttribute("aria-pressed")).toBe("false");
    expect(chipOf(modal, "bar").disabled).toBe(false);
    expect(modal.element.querySelector("#links-form-category-hint")?.textContent).toMatch(/4/);
    expect(chipOf(modal, "").disabled).toBe(false);
    chipOf(modal, "bar").click();
    expect(chipOf(modal, "praia").disabled).toBe(false);
  });

  it("pre-ticks main and extras when editing", () => {
    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openEdit(row({ category: "restaurante", extra_categories: ["praia", "passeio"] }));
    expect(chipOf(modal, "restaurante").dataset.main).toBe("true");
    expect(chipOf(modal, "praia").getAttribute("aria-pressed")).toBe("true");
    expect(chipOf(modal, "passeio").getAttribute("aria-pressed")).toBe("true");
    expect(chipOf(modal, "bar").getAttribute("aria-pressed")).toBe("false");
  });

  it("pre-ticks a create prefill with categories", () => {
    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openCreate({ category: "bar", extra_categories: ["museu"] });
    expect(chipOf(modal, "bar").dataset.main).toBe("true");
    expect(chipOf(modal, "museu").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("payload helpers with extra categories", () => {
  it("sends category (main) and extra_categories on create and update", () => {
    const values = formValues({ category: "restaurante", extra_categories: ["praia", "passeio"] });
    expect(toCreateInput(values, 0)).toMatchObject({
      category: "restaurante",
      extra_categories: ["praia", "passeio"],
    });
    expect(toUpdatePatch(values)).toMatchObject({
      category: "restaurante",
      extra_categories: ["praia", "passeio"],
    });
  });

  it("defaults to no extras and clears them on Automática", () => {
    expect(toCreateInput(formValues({ category: "bar" }), 0).extra_categories).toEqual([]);
    expect(toUpdatePatch(formValues({ category: "", extra_categories: ["praia"] })).extra_categories).toEqual([]);
  });

  it("drops invalid, duplicate and main-equal extras and caps at 3", () => {
    const patch = toUpdatePatch(
      formValues({
        category: "bar",
        extra_categories: ["bar", "x", "praia", "praia", "museu", "evento", "passeio"],
      })
    );
    expect(patch.extra_categories).toEqual(["praia", "museu", "evento"]);
  });
});

describe("view modal lists all categories", () => {
  it("renders a chip per category, main first", () => {
    const view = createViewModal({ onEdit: vi.fn(), onSchedule: vi.fn(), onMarkDone: vi.fn(), onDelete: vi.fn() });
    document.body.appendChild(view.element);
    view.open(row({ category: "restaurante", extra_categories: ["praia", "passeio"] }));
    const chips = [...view.element.querySelectorAll(".links-detail__chip--category")].map(
      (c) => c.textContent
    );
    expect(chips).toEqual(["Restaurante", "Praia", "Passeio"]);
  });
});

describe("toCreateInput label fallback", () => {
  it("falls back to the URL hostname when label is blank", () => {
    const input = toCreateInput(formValues(), 0);
    expect(input.label).toBe("example.com");
  });

  it("keeps the provided label when present", () => {
    const input = toCreateInput(formValues({ label: "Museu" }), 0);
    expect(input.label).toBe("Museu");
  });

  it("still rejects an invalid URL even though label can fall back", () => {
    expect(() => toCreateInput(formValues({ url: "not-a-url" }), 0)).toThrow(
      /Link inválido/
    );
  });
});

describe("toUpdatePatch label fallback", () => {
  it("falls back to the URL hostname when label is blank", () => {
    const patch = toUpdatePatch(formValues());
    expect(patch.label).toBe("example.com");
  });
});

describe("createLinkFormModal Nome field", () => {
  it("is not required", async () => {
    const { createLinkFormModal } = await import("../../src/links/admin-ui");
    const modal = createLinkFormModal(() => undefined);
    document.body.appendChild(modal.element);
    modal.openCreate();
    const labelInput = modal.element.querySelector(
      "#links-form-label"
    ) as HTMLInputElement;
    expect(labelInput.required).toBe(false);
  });
});

describe("createLinkFormModal paste button", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
  });

  it("fills the URL field from the clipboard on click", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue("https://pasted.example.com/x") },
      configurable: true,
    });

    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openCreate();

    const pasteBtn = modal.element.querySelector(
      '[data-action="paste-url"]'
    ) as HTMLButtonElement;
    expect(pasteBtn).toBeTruthy();
    pasteBtn.click();

    await vi.waitFor(() => {
      const urlInput = modal.element.querySelector(
        "#links-form-url"
      ) as HTMLInputElement;
      expect(urlInput.value).toBe("https://pasted.example.com/x");
    });
  });

  it("shows an error banner when the clipboard read is rejected", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openCreate();

    (
      modal.element.querySelector(
        '[data-action="paste-url"]'
      ) as HTMLButtonElement
    ).click();

    await vi.waitFor(() => {
      expect(modal.element.textContent).toContain(
        "Não foi possível colar automaticamente."
      );
    });
  });

  it("does not render the button when the Clipboard API is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openCreate();

    expect(
      modal.element.querySelector('[data-action="paste-url"]')
    ).toBeNull();
  });
});

describe("Phase 2: cost, city and address", () => {
  it("maps the new form values to create input and patch (blank -> null)", () => {
    const full = formValues({
      cost_text: "R$ 20 inteira",
      city: "Cidade Modelo",
      address: "Rua Exemplo, 100",
    });
    expect(toCreateInput(full, 0)).toMatchObject({
      cost_text: "R$ 20 inteira",
      city: "Cidade Modelo",
      address: "Rua Exemplo, 100",
    });
    expect(toUpdatePatch(formValues({ cost_text: "", city: "", address: "" }))).toMatchObject({
      cost_text: null,
      city: null,
      address: null,
    });
  });

  it("rejects over-long values in the form with a PT-BR message", () => {
    expect(() => toCreateInput(formValues({ cost_text: "x".repeat(201) }), 0)).toThrow(/Custo/);
  });

  function cb() {
    return { onView: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onMarkDone: vi.fn(), onSchedule: vi.fn() };
  }

  it("shows cost and city on the card when present", () => {
    const card = renderAdminCard(row({ cost_text: "grátis", city: "Cidade Modelo" }), cb());
    const meta = card.querySelector(".feed-card__meta")?.textContent ?? "";
    expect(meta).toContain("grátis");
    expect(meta).toContain("Cidade Modelo");
  });

  it("renders a legacy card without cost/city items", () => {
    const card = renderAdminCard(row(), cb());
    expect(card.querySelector(".feed-card__meta-item--cost")).toBeNull();
    expect(card.querySelector(".feed-card__meta-item--city")).toBeNull();
  });

  function viewCb() {
    return { onEdit: vi.fn(), onSchedule: vi.fn(), onMarkDone: vi.fn(), onDelete: vi.fn() };
  }

  it("detail shows the fields and a safe map link", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    modal.open(row({ cost_text: "R$ 20", city: "Cidade Modelo", address: "Rua Exemplo, 100" }));
    const text = modal.element.textContent ?? "";
    expect(text).toContain("R$ 20");
    expect(text).toContain("Cidade Modelo");
    expect(text).toContain("Rua Exemplo, 100");
    const map = modal.element.querySelector<HTMLAnchorElement>("a[data-action='open-map']");
    expect(map?.hidden).toBe(false);
    expect(map?.href).toBe(
      "https://www.google.com/maps/search/?api=1&query=Rua%20Exemplo%2C%20100%2C%20Cidade%20Modelo"
    );
    expect(map?.target).toBe("_blank");
    expect(map?.rel).toContain("noopener");
  });

  it("detail hides empty sections and the map link for legacy items", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    modal.open(row());
    for (const key of ["cost_text", "city", "address"]) {
      const r = modal.element.querySelector<HTMLElement>(`[data-field='${key}']`);
      expect(r?.hidden).toBe(true);
    }
    const map = modal.element.querySelector<HTMLElement>("a[data-action='open-map']");
    expect(map?.hidden).toBe(true);
  });

  it("form keeps the new fields inside a collapsed Mais detalhes section and round-trips them", () => {
    const onSubmit = vi.fn();
    const modal = createLinkFormModal(onSubmit);
    document.body.appendChild(modal.element);
    const more = modal.element.querySelector("details.links-admin-form__more") as HTMLDetailsElement;
    expect(more.querySelector("summary")?.textContent).toBe("Mais detalhes");
    modal.openCreate();
    expect(more.open).toBe(false);

    modal.openEdit(row({ cost_text: "R$ 20", city: "Cidade Modelo", address: "Rua Exemplo, 100" }));
    expect(more.open).toBe(true);
    expect((modal.element.querySelector("#links-form-cost_text") as HTMLInputElement).value).toBe("R$ 20");
    modal.element.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ cost_text: "R$ 20", city: "Cidade Modelo", address: "Rua Exemplo, 100" }),
      "link-1"
    );

    modal.openEdit(row());
    expect(more.open).toBe(false);
  });
});

describe("Phase 2: dossier and itinerary", () => {
  function viewCb() {
    return { onEdit: vi.fn(), onSchedule: vi.fn(), onMarkDone: vi.fn(), onDelete: vi.fn() };
  }

  it("maps dossier and itinerary to payload keys (blank -> null)", () => {
    expect(
      toCreateInput(formValues({ dossier: "Historia\nCuriosidade", itinerary: "09h chegada" }), 1)
    ).toMatchObject({ dossier: "Historia\nCuriosidade", itinerary: "09h chegada" });
    expect(toUpdatePatch(formValues({ dossier: "", itinerary: " " }))).toMatchObject({
      dossier: null,
      itinerary: null,
    });
  });

  it("rejects over-long dossier in the form", () => {
    expect(() => toCreateInput(formValues({ dossier: "x".repeat(5001) }), 1)).toThrow(/Dossiê/);
  });

  it("form uses textareas and round-trips line breaks", () => {
    const onSubmit = vi.fn();
    const modal = createLinkFormModal(onSubmit);
    document.body.appendChild(modal.element);
    const d = modal.element.querySelector("#links-form-dossier");
    expect(d?.tagName).toBe("TEXTAREA");
    expect(modal.element.querySelector("#links-form-itinerary")?.tagName).toBe("TEXTAREA");
    modal.openEdit(row({ dossier: "linha 1\nlinha 2", itinerary: "A\nB" }));
    expect((d as HTMLTextAreaElement).value).toBe("linha 1\nlinha 2");
    modal.element.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ dossier: "linha 1\nlinha 2", itinerary: "A\nB" }),
      "link-1"
    );
  });

  it("detail shows both sections as plain text and hides them when empty", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    const evil = "<img src=x onerror=alert(1)>\nsegunda linha";
    modal.open(row({ dossier: evil, itinerary: "09h chegada\n10h almoco" }));
    const d = modal.element.querySelector<HTMLElement>("[data-field='dossier']")!;
    const i = modal.element.querySelector<HTMLElement>("[data-field='itinerary']")!;
    expect(d.hidden).toBe(false);
    expect(d.querySelector("img")).toBeNull();
    expect(d.textContent).toContain(evil);
    expect(i.textContent).toContain("09h chegada\n10h almoco");
    modal.open(row());
    expect(d.hidden).toBe(true);
    expect(i.hidden).toBe(true);
  });
});

describe("Phase 2: source post link", () => {
  function viewCb() {
    return { onEdit: vi.fn(), onSchedule: vi.fn(), onMarkDone: vi.fn(), onDelete: vi.fn() };
  }

  it("maps source_url to payload keys (blank -> null)", () => {
    expect(
      toCreateInput(formValues({ source_url: "https://example.com/p/abc" }), 1)
    ).toMatchObject({ source_url: "https://example.com/p/abc" });
    expect(toCreateInput(formValues(), 1)).toMatchObject({ source_url: null });
    expect(toUpdatePatch(formValues({ source_url: "" }))).toMatchObject({ source_url: null });
  });

  it("rejects a non-https source link with a PT-BR message", () => {
    expect(() => toCreateInput(formValues({ source_url: "http://example.com/p" }), 1)).toThrow(
      /Link do post original/
    );
    expect(() => toUpdatePatch(formValues({ source_url: "javascript:alert(1)" }))).toThrow(
      /inválido/
    );
  });

  it("form shows an inline error for a non-https link, clears it when fixed, and blocks submit", () => {
    const onSubmit = vi.fn();
    const modal = createLinkFormModal(onSubmit);
    document.body.appendChild(modal.element);
    modal.openCreate({ url: "https://example.com/lugar" });
    const input = modal.element.querySelector<HTMLInputElement>("#links-form-source_url")!;
    const err = modal.element.querySelector<HTMLElement>("#links-form-source_url-error")!;
    expect(err.hidden).toBe(true);
    input.value = "not a url";
    input.dispatchEvent(new Event("input"));
    expect(err.hidden).toBe(false);
    expect(err.textContent).toMatch(/inválido/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    modal.element.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onSubmit).not.toHaveBeenCalled();
    input.value = "https://example.com/p";
    input.dispatchEvent(new Event("input"));
    expect(err.hidden).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBeNull();
    modal.element.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ source_url: "https://example.com/p" }),
      null
    );
  });

  it("form round-trips an existing source link and opens Mais detalhes", () => {
    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    const more = modal.element.querySelector("details.links-admin-form__more") as HTMLDetailsElement;
    modal.openEdit(row({ source_url: "https://example.com/p/1" }));
    expect(more.open).toBe(true);
    expect(modal.element.querySelector<HTMLInputElement>("#links-form-source_url")!.value).toBe(
      "https://example.com/p/1"
    );
    modal.openEdit(row());
    expect(modal.element.querySelector<HTMLInputElement>("#links-form-source_url")!.value).toBe("");
    expect(modal.element.querySelector<HTMLElement>("#links-form-source_url-error")!.hidden).toBe(true);
  });

  it("detail shows Ver post original with a safe new-tab link, hidden when empty", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    modal.open(row({ source_url: "https://example.com/p/1" }));
    const wrap = modal.element.querySelector<HTMLElement>("[data-field='source_url']")!;
    const a = wrap.querySelector<HTMLAnchorElement>("a")!;
    expect(wrap.hidden).toBe(false);
    expect(a.textContent).toContain("Ver post original");
    expect(a.getAttribute("href")).toBe("https://example.com/p/1");
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
    modal.open(row());
    expect(wrap.hidden).toBe(true);
    expect(a.hasAttribute("href")).toBe(false);
  });

  it("detail never links a non-https stored value", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    modal.open(row({ source_url: "javascript:alert(1)" }));
    const wrap = modal.element.querySelector<HTMLElement>("[data-field='source_url']")!;
    expect(wrap.hidden).toBe(true);
    expect(wrap.querySelector("a")!.hasAttribute("href")).toBe(false);
  });
});

describe("pose references", () => {
  function viewCb() {
    return { onEdit: vi.fn(), onSchedule: vi.fn(), onMarkDone: vi.fn(), onDelete: vi.fn() };
  }

  function setup(onSubmit = vi.fn()) {
    const modal = createLinkFormModal(onSubmit);
    document.body.appendChild(modal.element);
    modal.openCreate({ url: "https://example.com/lugar" });
    const q = <T extends HTMLElement>(sel: string) => modal.element.querySelector<T>(sel)!;
    const click = (name: string) =>
      modal.element.querySelector<HTMLButtonElement>(`button[aria-label='${name}']`)!.click();
    const type = (id: string, value: string) => {
      const input = q<HTMLInputElement>(`#${id}`);
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };
    const submit = () =>
      modal.element.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    const items = () => [...modal.element.querySelectorAll(".links-poses__item")];
    return { modal, q, click, type, submit, items };
  }

  it("maps poses to payload keys (blank -> null) and validates https", () => {
    expect(
      toCreateInput(formValues({ pose_refs: [{ url: "https://example.com/a", note: "n" }] }), 1)
    ).toMatchObject({ pose_refs: [{ url: "https://example.com/a", note: "n" }] });
    expect(toCreateInput(formValues(), 1)).toMatchObject({ pose_refs: null });
    expect(toUpdatePatch(formValues({ pose_refs: [{ url: "", note: "" }] }))).toMatchObject({
      pose_refs: null,
    });
    expect(() =>
      toUpdatePatch(formValues({ pose_refs: [{ url: "http://example.com", note: "" }] }))
    ).toThrow(/Pose 1.*inválido/);
  });

  it("adds poses and submits them in order", () => {
    const onSubmit = vi.fn();
    const { click, type, submit, items } = setup(onSubmit);
    expect(items()).toHaveLength(0);
    click("Adicionar pose");
    click("Adicionar pose");
    expect(items()).toHaveLength(2);
    type("links-form-pose-0-url", "https://example.com/a");
    type("links-form-pose-1-note", "de costas");
    submit();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        pose_refs: [
          { url: "https://example.com/a", note: "" },
          { url: "", note: "de costas" },
        ],
      }),
      null
    );
  });

  it("removes and reorders poses", () => {
    const onSubmit = vi.fn();
    const { click, type, submit, items } = setup(onSubmit);
    for (let i = 0; i < 3; i++) click("Adicionar pose");
    type("links-form-pose-0-note", "A");
    type("links-form-pose-1-note", "B");
    type("links-form-pose-2-note", "C");
    click("Descer pose 1");
    click("Subir pose 3");
    click("Remover pose 2");
    expect(items()).toHaveLength(2);
    submit();
    const values = onSubmit.mock.calls[0]![0] as LinkFormValues;
    expect(values.pose_refs.map((p) => p.note)).toEqual(["B", "A"]);
  });

  it("shows an inline https error and blocks submit", () => {
    const onSubmit = vi.fn();
    const { click, type, submit, q } = setup(onSubmit);
    click("Adicionar pose");
    type("links-form-pose-0-url", "not a url");
    const err = q<HTMLElement>("#links-form-pose-0-url-error");
    const input = q<HTMLInputElement>("#links-form-pose-0-url");
    expect(err.hidden).toBe(false);
    expect(err.textContent).toMatch(/inválido/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(err.id);
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    type("links-form-pose-0-url", "https://example.com/a");
    expect(err.hidden).toBe(true);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("caps the list at 30 poses", () => {
    const { click, items, q } = setup();
    for (let i = 0; i < 35; i++) click("Adicionar pose");
    expect(items()).toHaveLength(30);
    expect(q<HTMLButtonElement>("button[aria-label='Adicionar pose']").disabled).toBe(true);
  });

  it("round-trips stored poses on edit and resets on create", () => {
    const { modal, q, items } = setup();
    const more = q<HTMLDetailsElement>("details.links-admin-form__more");
    modal.openEdit(
      row({ pose_refs: [{ url: "https://example.com/a", note: "n" }, { note: "so nota" }] })
    );
    expect(more.open).toBe(true);
    expect(items()).toHaveLength(2);
    expect(q<HTMLInputElement>("#links-form-pose-0-url").value).toBe("https://example.com/a");
    expect(q<HTMLInputElement>("#links-form-pose-1-note").value).toBe("so nota");
    modal.openCreate({ url: "" });
    expect(items()).toHaveLength(0);
  });

  it("maps sources to the payload, dropping blank rows", () => {
    expect(
      toCreateInput(
        formValues({
          sources: [
            { title: " Guia ", url: "example.com/a" },
            { title: "", url: "" },
          ],
        }),
        1
      )
    ).toMatchObject({ sources: [{ title: "Guia", url: "https://example.com/a" }] });
    expect(toUpdatePatch(formValues())).toMatchObject({ sources: [] });
    expect(() => toCreateInput(formValues({ sources: [{ title: "", url: "https://example.com" }] }), 1)).toThrow(
      /Fonte 1/
    );
  });

  it("adds and removes source rows; blank rows are dropped on submit", () => {
    const onSubmit = vi.fn();
    const { click, type, submit, q } = setup(onSubmit);
    click("Adicionar fonte");
    click("Adicionar fonte");
    click("Adicionar fonte");
    type("links-form-source-0-title", "Guia");
    type("links-form-source-0-url", "https://example.com/g");
    type("links-form-source-1-title", "Notícia");
    type("links-form-source-1-url", "https://example.com/n");
    click("Remover fonte 3");
    expect(modalSourceRows(q)).toBe(2);
    submit();
    const values = onSubmit.mock.calls[0]![0] as LinkFormValues;
    expect(values.sources).toEqual([
      { title: "Guia", url: "https://example.com/g" },
      { title: "Notícia", url: "https://example.com/n" },
    ]);
  });

  it("blocks submit on a half-filled source row", () => {
    const onSubmit = vi.fn();
    const { click, type, submit } = setup(onSubmit);
    click("Adicionar fonte");
    type("links-form-source-0-title", "Só título");
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("round-trips stored sources on edit and resets on create", () => {
    const { modal, q } = setup();
    modal.openEdit(row({ sources: [{ title: "Guia", url: "https://example.com/g" }] }));
    expect(q<HTMLDetailsElement>("details.links-admin-form__more").open).toBe(true);
    expect(q<HTMLInputElement>("#links-form-source-0-title").value).toBe("Guia");
    expect(q<HTMLInputElement>("#links-form-source-0-url").value).toBe("https://example.com/g");
    modal.openCreate({ url: "" });
    expect(modalSourceRows(q)).toBe(0);
  });

  it("detail lists sources as safe new-tab links with text titles, hidden when empty", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    modal.open(
      row({
        sources: [
          { title: "<b>Guia</b>", url: "https://example.com/g" },
          { title: "Ruim", url: "javascript:alert(1)" },
        ],
      })
    );
    const wrap = modal.element.querySelector<HTMLElement>("[data-field='sources']")!;
    expect(wrap.hidden).toBe(false);
    const links = [...wrap.querySelectorAll("a")];
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("https://example.com/g");
    expect(links[0]!.target).toBe("_blank");
    expect(links[0]!.rel).toBe("noopener noreferrer");
    expect(links[0]!.textContent).toContain("<b>Guia</b>");
    expect(links[0]!.querySelector("b")).toBeNull();
    modal.open(row());
    expect(wrap.hidden).toBe(true);
  });

  it("detail lists poses in order with safe new-tab links, hidden when empty", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    modal.open(
      row({
        pose_refs: [
          { url: "https://example.com/a", note: "primeira" },
          { note: "<b>so nota</b>" },
          { url: "javascript:alert(1)", note: "ruim" },
        ],
      })
    );
    const wrap = modal.element.querySelector<HTMLElement>("[data-field='pose_refs']")!;
    expect(wrap.hidden).toBe(false);
    const lis = [...wrap.querySelectorAll("li")];
    expect(lis).toHaveLength(3);
    const a = lis[0]!.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://example.com/a");
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
    expect(lis[0]!.textContent).toContain("primeira");
    expect(lis[1]!.querySelector("a")).toBeNull();
    expect(lis[1]!.textContent).toContain("<b>so nota</b>");
    expect(lis[1]!.querySelector("b")).toBeNull();
    expect(lis[2]!.querySelector("a")).toBeNull();
    modal.open(row());
    expect(wrap.hidden).toBe(true);
    expect(wrap.querySelectorAll("li")).toHaveLength(0);
  });
});

describe("Phase 3: Como foi on card and detail", () => {
  const DONE = { status: "done" as const, completed_at: "2026-12-12T15:00:00Z" };

  function cardCb() {
    return {
      onView: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onMarkDone: vi.fn(),
      onSchedule: vi.fn(),
      onUnmarkDone: vi.fn(),
    };
  }

  function viewCb() {
    return {
      onEdit: vi.fn(),
      onSchedule: vi.fn(),
      onMarkDone: vi.fn(),
      onDelete: vi.fn(),
      onUnmarkDone: vi.fn(),
      onEditReview: vi.fn(),
    };
  }

  it("card shows the rating of a done place with an accessible label", () => {
    const card = renderAdminCard(row({ ...DONE, rating: 4 }), cardCb());
    const item = card.querySelector(".feed-card__meta-item--rating")!;
    expect(item.textContent).toContain("4/5");
    expect(item.getAttribute("aria-label")).toBe("Nota 4 de 5");
  });

  it("card shows no rating for unrated, wishlist or legacy rows", () => {
    for (const partial of [{ ...DONE }, { rating: 4 }, {}] as Partial<LinkRow>[]) {
      const card = renderAdminCard(row(partial), cardCb());
      expect(card.querySelector(".feed-card__meta-item--rating")).toBeNull();
    }
  });

  it("card menu offers Desmarcar feito only for done places", () => {
    const cb = cardCb();
    const done = renderAdminCard(row(DONE), cb);
    const items = Array.from(done.querySelectorAll<HTMLElement>("[role='menuitem']"));
    const unmark = items.find((i) => i.textContent === "Desmarcar feito")!;
    expect(unmark).toBeTruthy();
    unmark.click();
    expect(cb.onUnmarkDone).toHaveBeenCalledWith(expect.objectContaining({ id: "link-1" }));
    const wish = renderAdminCard(row(), cardCb());
    expect(wish.textContent).not.toContain("Desmarcar feito");
  });

  it("detail shows visit date, rating and Voltaria? only when present", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    modal.open(row({ ...DONE, rating: 5, want_again: true }));
    const rows = (key: string) =>
      modal.element.querySelector<HTMLElement>(`[data-field='${key}']`)!;
    expect(rows("completed_at").hidden).toBe(false);
    expect(rows("completed_at").textContent).toContain("12 de dezembro de 2026");
    expect(rows("rating").hidden).toBe(false);
    expect(rows("rating").textContent).toContain("5 de 5");
    expect(rows("want_again").hidden).toBe(false);
    expect(rows("want_again").textContent).toContain("Sim");

    modal.open(row({ ...DONE }));
    expect(rows("completed_at").hidden).toBe(false);
    expect(rows("rating").hidden).toBe(true);
    expect(rows("want_again").hidden).toBe(true);

    modal.open(row({ rating: 5, want_again: true }));
    for (const key of ["completed_at", "rating", "want_again", "review-edit"]) {
      expect(rows(key).hidden).toBe(true);
    }
  });

  it("detail shows the memory link: YouTube thumbnail + Assistir, or Ver álbum, only for done places", () => {
    const modal = createViewModal(viewCb());
    document.body.appendChild(modal.element);
    const field = () => modal.element.querySelector<HTMLElement>("[data-field='memory_url']")!;
    const thumb = () => field().querySelector<HTMLImageElement>("img")!;
    const action = () => field().querySelector<HTMLAnchorElement>("a[data-action='open-memory']")!;

    modal.open(row({ ...DONE, memory_url: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(field().hidden).toBe(false);
    expect(thumb().src).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(thumb().hidden).toBe(false);
    expect(thumb().getAttribute("alt")).toBe("");
    expect(action().textContent).toContain("Assistir");
    expect(action().href).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(action().target).toBe("_blank");
    expect(action().rel).toBe("noopener noreferrer");
    expect(field().querySelector("iframe")).toBeNull();

    // A thumbnail that fails to load is hidden; the button stays.
    thumb().dispatchEvent(new Event("error"));
    expect(thumb().hidden).toBe(true);
    expect(action().textContent).toContain("Assistir");

    // Reopening resets the hidden thumbnail.
    modal.open(row({ ...DONE, memory_url: "https://youtu.be/aaaaaaaaaaa" }));
    expect(thumb().hidden).toBe(false);
    expect(thumb().src).toContain("/aaaaaaaaaaa/");

    modal.open(row({ ...DONE, memory_url: "https://photos.app.goo.gl/AbCd" }));
    expect(field().hidden).toBe(false);
    expect(thumb().hidden).toBe(true);
    expect(action().textContent).toContain("Ver álbum");
    expect(action().href).toBe("https://photos.app.goo.gl/AbCd");
    expect(action().rel).toBe("noopener noreferrer");

    modal.open(row({ ...DONE, memory_url: null }));
    expect(field().hidden).toBe(true);
    modal.open(row({ ...DONE, memory_url: "http://insecure.example/x" }));
    expect(field().hidden).toBe(true);
    modal.open(row({ memory_url: "https://photos.app.goo.gl/AbCd" }));
    expect(field().hidden).toBe(true);
  });

  it("detail edit-Como-foi action calls back with the link; unmark swaps with mark done", () => {
    const cb = viewCb();
    const modal = createViewModal(cb);
    document.body.appendChild(modal.element);
    modal.open(row({ ...DONE, rating: 2 }));
    modal.element.querySelector<HTMLElement>("[data-action='edit-review']")!.click();
    expect(cb.onEditReview).toHaveBeenCalledWith(expect.objectContaining({ id: "link-1" }));

    modal.open(row({ ...DONE }));
    const unmark = modal.element.querySelector<HTMLButtonElement>(
      ".links-detail__bar [aria-label='Desmarcar como feito']"
    )!;
    expect(unmark.hidden).toBe(false);
    unmark.click();
    expect(cb.onUnmarkDone).toHaveBeenCalledWith(expect.objectContaining({ id: "link-1" }));

    modal.open(row());
    expect(unmark.hidden).toBe(true);
  });
});

describe("detail: Plano do passeio", () => {
  const cb = () => ({
    onEdit: vi.fn(),
    onSchedule: vi.fn(),
    onMarkDone: vi.fn(),
    onDelete: vi.fn(),
    onEditPlan: vi.fn(),
  });
  const plan = [
    { text: "Comprar ingressos", list: "checklist" as const, who: "Alana", done: true },
    { text: "Protetor solar", list: "checklist" as const, done: false },
    { text: "Pão", list: "compras" as const, done: false },
  ];

  it("shows both lists with progress and the person in charge; no save callback: disabled boxes", () => {
    const modal = createViewModal(cb());
    document.body.appendChild(modal.element);
    modal.open(row({ plan_items: plan }));
    const section = modal.element.querySelector<HTMLElement>("[data-field='plan']")!;
    expect(section.hidden).toBe(false);
    const checklist = section.querySelector<HTMLElement>("[data-plan-list='checklist']")!;
    expect(checklist.textContent).toContain("Checklist");
    expect(checklist.textContent).toContain("1 de 2");
    expect(checklist.textContent).toContain("Comprar ingressos");
    expect(checklist.textContent).toContain("Alana");
    const compras = section.querySelector<HTMLElement>("[data-plan-list='compras']")!;
    expect(compras.textContent).toContain("Lanches e compras");
    expect(compras.textContent).toContain("0 de 1");
    const boxes = section.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(boxes).toHaveLength(3);
    expect([...boxes].every((b) => b.disabled)).toBe(true);
  });

  it("shows participants inside the section, which appears with participants only", () => {
    const modal = createViewModal(cb());
    document.body.appendChild(modal.element);
    modal.open(row({ people: ["Alana", "Bia"] }));
    const section = modal.element.querySelector<HTMLElement>("[data-field='plan']")!;
    expect(section.hidden).toBe(false);
    expect(section.querySelector("[data-plan-people]")!.textContent).toContain("Alana, Bia");
    expect(section.querySelector<HTMLElement>("[data-plan-list='checklist']")!.hidden).toBe(true);
  });

  it("keeps Editar plano and Enviar no WhatsApp inside the section", () => {
    const modal = createViewModal(cb());
    document.body.appendChild(modal.element);
    modal.open(row({ plan_items: plan }));
    const section = modal.element.querySelector<HTMLElement>("[data-field='plan']")!;
    expect(section.querySelector("[data-action='edit-plan']")).not.toBeNull();
    expect(section.querySelector("[data-action='share-plan']")).not.toBeNull();
  });

  it("serializes tick saves and always sends the latest state", async () => {
    const resolvers: Array<() => void> = [];
    const save = vi.fn(() => new Promise<void>((resolve) => resolvers.push(resolve)));
    const modal = createViewModal({ ...cb(), onSavePlanItems: save });
    document.body.appendChild(modal.element);
    modal.open(row({ plan_items: plan }));
    const section = modal.element.querySelector<HTMLElement>("[data-field='plan']")!;
    const tick = (i: number) => {
      const box = section.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[i]!;
      box.checked = !box.checked;
      box.dispatchEvent(new Event("change"));
    };
    tick(1);
    tick(2);
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    resolvers[0]!();
    await new Promise((r) => setTimeout(r, 0));
    expect(save).toHaveBeenCalledTimes(2);
    const calls = save.mock.calls as unknown as Array<[unknown, Array<{ done: boolean }>]>;
    expect(calls[1]![1].map((i) => i.done)).toEqual([true, true, true]);
  });

  it("rolls back to the last confirmed state when an earlier tick fails", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("plan_items invalid: x"))
      .mockResolvedValue(undefined);
    const modal = createViewModal({ ...cb(), onSavePlanItems: save });
    document.body.appendChild(modal.element);
    modal.open(row({ plan_items: plan }));
    const section = modal.element.querySelector<HTMLElement>("[data-field='plan']")!;
    const tick = (i: number) => {
      const box = section.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[i]!;
      box.checked = !box.checked;
      box.dispatchEvent(new Event("change"));
    };
    tick(1);
    tick(2);
    await new Promise((r) => setTimeout(r, 0));
    const boxes = [...section.querySelectorAll<HTMLInputElement>("input[type='checkbox']")];
    const last = (save.mock.calls.at(-1) as unknown as [unknown, Array<{ done: boolean }>])[1];
    expect(boxes.map((b) => b.checked)).toEqual(last.map((i) => i.done));
    expect(boxes.map((b) => b.checked)).toEqual([true, false, false]);
  });

  it("waits for pending tick saves before opening the plan sheet", async () => {
    let resolve!: () => void;
    const save = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const callbacks = { ...cb(), onSavePlanItems: save };
    const modal = createViewModal(callbacks);
    document.body.appendChild(modal.element);
    modal.open(row({ plan_items: plan }));
    const box = modal.element.querySelectorAll<HTMLInputElement>("[data-field='plan'] input[type='checkbox']")[1]!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    modal.element.querySelector<HTMLButtonElement>("[data-action='edit-plan']")!.click();
    await Promise.resolve();
    expect(callbacks.onEditPlan).not.toHaveBeenCalled();
    resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(callbacks.onEditPlan).toHaveBeenCalledTimes(1);
    const opened = callbacks.onEditPlan.mock.calls[0]![0] as { plan_items: Array<{ done: boolean }> };
    expect(opened.plan_items[1]!.done).toBe(true);
  });

  it("does not fall back to wa.me after a failed native share; shows a message", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new Error("boom")),
    });
    const modal = createViewModal(cb());
    document.body.appendChild(modal.element);
    modal.open(row({ plan_items: plan }));
    modal.element.querySelector<HTMLButtonElement>("[data-action='share-plan']")!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(open).not.toHaveBeenCalled();
    const alert = modal.element.querySelector<HTMLElement>("[data-field='plan'] [role='alert']")!;
    expect(alert.hidden).toBe(false);
    expect(alert.textContent).toBe("Não foi possível compartilhar o plano. Tente de novo.");
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    open.mockRestore();
  });

  it("ticking saves the whole plan optimistically and updates the progress", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const modal = createViewModal({ ...cb(), onSavePlanItems: save });
    document.body.appendChild(modal.element);
    modal.open(row({ plan_items: plan }));
    const section = modal.element.querySelector<HTMLElement>("[data-field='plan']")!;
    const box = section.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[1]!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toEqual([
      plan[0],
      { ...plan[1], done: true },
      plan[2],
    ]);
    expect(section.querySelector("[data-plan-list='checklist']")!.textContent).toContain("2 de 2");
  });

  it("rolls the tick back and shows an error when the save fails", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Sem conexão."));
    const modal = createViewModal({ ...cb(), onSavePlanItems: save });
    document.body.appendChild(modal.element);
    modal.open(row({ plan_items: plan }));
    const section = modal.element.querySelector<HTMLElement>("[data-field='plan']")!;
    const box = section.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[1]!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 0));
    const after = section.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[1]!;
    expect(after.checked).toBe(false);
    expect(section.querySelector("[data-plan-list='checklist']")!.textContent).toContain("1 de 2");
    const alert = section.querySelector<HTMLElement>("[role='alert']")!;
    expect(alert.hidden).toBe(false);
    expect(alert.textContent).toBe("Não foi possível salvar o plano. Tente de novo.");
  });

  it("hides the section (and an empty list) when there is nothing to show", () => {
    const modal = createViewModal(cb());
    document.body.appendChild(modal.element);
    modal.open(row());
    expect(modal.element.querySelector<HTMLElement>("[data-field='plan']")!.hidden).toBe(true);
    modal.open(row({ plan_items: [plan[2]!] }));
    const section = modal.element.querySelector<HTMLElement>("[data-field='plan']")!;
    expect(section.hidden).toBe(false);
    expect(section.querySelector<HTMLElement>("[data-plan-list='checklist']")!.hidden).toBe(true);
    expect(section.querySelector<HTMLElement>("[data-plan-list='compras']")!.hidden).toBe(false);
  });

  it("ignores malformed stored items and renders text safely", () => {
    const modal = createViewModal(cb());
    document.body.appendChild(modal.element);
    modal.open(
      row({
        plan_items: [
          { text: "<img src=x onerror=alert(1)>", list: "checklist", done: false },
          { text: "", list: "checklist", done: false },
        ] as never,
      })
    );
    const section = modal.element.querySelector<HTMLElement>("[data-field='plan']")!;
    expect(section.querySelectorAll("img")).toHaveLength(0);
    expect(section.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(section.textContent).toContain("0 de 1");
  });

  it("offers Editar plano on any place and closes the detail before calling back", () => {
    const callbacks = cb();
    const modal = createViewModal(callbacks);
    document.body.appendChild(modal.element);
    const link = row();
    modal.open(link);
    const btn = modal.element.querySelector<HTMLButtonElement>("[data-action='edit-plan']")!;
    expect(btn.textContent).toContain("Editar plano");
    expect(btn.closest<HTMLElement>("[data-field='plan-edit']")!.hidden).toBe(false);
    btn.click();
    expect(modal.element.hidden).toBe(true);
    expect(callbacks.onEditPlan).toHaveBeenCalledWith(link);
  });

  it("hides Editar plano when no handler is wired", () => {
    const { onEditPlan, ...withoutPlan } = cb();
    void onEditPlan;
    const modal = createViewModal(withoutPlan);
    document.body.appendChild(modal.element);
    modal.open(row());
    expect(modal.element.querySelector<HTMLElement>("[data-field='plan-edit']")!.hidden).toBe(true);
  });
});

describe("Phase 5: update draft over the edit form", () => {
  it("empty proposed values do not overwrite the current ones", () => {
    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openEdit(row({ category: "bar", city: "Cidade Atual", description: "Atual" }), {
      category: "",
      city: "",
      description: "Proposta",
    });
    expect(
      modal.element.querySelector('[data-category="bar"]')?.getAttribute("aria-pressed")
    ).toBe("true");
    expect((modal.element.querySelector("#links-form-city") as HTMLInputElement).value).toBe("Cidade Atual");
    expect((modal.element.querySelector("#links-form-desc") as HTMLTextAreaElement).value).toBe("Proposta");
  });
});

describe("Phase 5: a draft-supplied image is not loaded until the editor asks", () => {
  const IMG = "https://draft-image.example.test/foto.jpg";
  const previewSrc = (modal: { element: HTMLElement }): string | null =>
    modal.element.querySelector(".links-admin-form__preview-img")?.getAttribute("src") ?? null;

  it("openCreate: no preview from the draft image; the button loads it", () => {
    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openCreate({ url: "https://example.com/x", image_url: IMG });
    expect(previewSrc(modal)).not.toBe(IMG);
    expect((modal.element.querySelector("#links-form-image") as HTMLInputElement).value).toBe(IMG);
    const button = Array.from(modal.element.querySelectorAll("button")).find((b) => b.textContent === "Carregar prévia")!;
    expect(button.hidden).toBe(false);
    button.click();
    expect(previewSrc(modal)).toBe(IMG);
    expect(button.hidden).toBe(true);
  });

  it("openEdit: a proposed image is held; typing in the field releases it", () => {
    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openEdit(row(), { image_url: IMG });
    expect(previewSrc(modal)).not.toBe(IMG);
    const field = modal.element.querySelector("#links-form-image") as HTMLInputElement;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    expect(previewSrc(modal)).toBe(IMG);
  });

  it("an image already saved on the item still previews, and so does a plain create", () => {
    const modal = createLinkFormModal(vi.fn());
    document.body.appendChild(modal.element);
    modal.openEdit(row({ image_url: "https://example.com/salva.jpg" }));
    expect(previewSrc(modal)).toBe("https://example.com/salva.jpg");
    modal.openCreate({ url: "https://example.com/x" });
    const button = Array.from(modal.element.querySelectorAll("button")).find((b) => b.textContent === "Carregar prévia")!;
    expect(button.hidden).toBe(true);
  });
});

describe("Duração", () => {
  function open(prefill?: Parameters<ReturnType<typeof createLinkFormModal>["openCreate"]>[0], onSubmit = vi.fn()) {
    const modal = createLinkFormModal(onSubmit);
    document.body.appendChild(modal.element);
    modal.openCreate({ url: "https://example.com/lugar", ...prefill });
    const select = modal.element.querySelector<HTMLSelectElement>("#links-form-duration")!;
    const submit = () =>
      modal.element.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    return { modal, select, submit, onSubmit };
  }

  it("maps to the payload (blank -> null) and validates", () => {
    expect(toCreateInput(formValues({ duration: "meio-periodo" }), 1)).toMatchObject({ duration: "meio-periodo" });
    expect(toCreateInput(formValues(), 1)).toMatchObject({ duration: null });
    expect(toUpdatePatch(formValues({ duration: "" }))).toMatchObject({ duration: null });
    expect(toUpdatePatch(formValues({ duration: "dia-inteiro" }))).toMatchObject({ duration: "dia-inteiro" });
    expect(() => toUpdatePatch(formValues({ duration: "longo" }))).toThrow(/Duração/);
  });

  it("form select lists the pt-BR labels, empty by default, and submits the value", () => {
    const { select, submit, onSubmit } = open();
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Não informada",
      "Rápido (até 2h)",
      "Meio período",
      "Dia inteiro",
    ]);
    expect(select.value).toBe("");
    expect(select.labels?.[0]?.textContent).toBe("Duração (opcional)");
    select.value = "meio-periodo";
    select.dispatchEvent(new Event("change"));
    submit();
    expect((onSubmit.mock.calls[0]![0] as LinkFormValues).duration).toBe("meio-periodo");
  });

  it("prefill selects the value and opens Mais detalhes; edit round-trips; create resets", () => {
    const { modal, select } = open({ duration: "dia-inteiro" });
    expect(select.value).toBe("dia-inteiro");
    expect(modal.element.querySelector<HTMLDetailsElement>("details.links-admin-form__more")!.open).toBe(true);
    modal.openEdit(row({ duration: "rapido" }));
    expect(select.value).toBe("rapido");
    modal.openEdit(row({ duration: "rapido" }), { duration: "" });
    expect(select.value).toBe("rapido");
    modal.openEdit(row({ duration: "rapido" }), { duration: "meio-periodo" });
    expect(select.value).toBe("meio-periodo");
    modal.openCreate({ url: "" });
    expect(select.value).toBe("");
  });

  it("detail shows the label, hidden when empty", () => {
    const modal = createViewModal({ onEdit: vi.fn(), onSchedule: vi.fn(), onMarkDone: vi.fn(), onDelete: vi.fn() });
    document.body.appendChild(modal.element);
    modal.open(row({ duration: "rapido" }));
    const wrap = modal.element.querySelector<HTMLElement>("[data-field='duration']")!;
    expect(wrap.hidden).toBe(false);
    expect(wrap.textContent).toContain("Duração");
    expect(wrap.textContent).toContain("Rápido (até 2h)");
    modal.open(row({ duration: null }));
    expect(wrap.hidden).toBe(true);
  });
});

describe("Aviso de duplicado", () => {
  const existing = row({ id: "dup-1", label: "Almoçar no restaurante Vila do Caranguejo" });

  function open(
    prefill: Parameters<ReturnType<typeof createLinkFormModal>["openCreate"]>[0],
    findDuplicate = vi.fn((url: string, source: string) =>
      url.includes("caranguejo") || source.includes("caranguejo") ? existing : null
    )
  ) {
    const onSubmit = vi.fn();
    const onOpenDuplicate = vi.fn();
    const modal = createLinkFormModal(onSubmit, { findDuplicate, onOpenDuplicate });
    document.body.appendChild(modal.element);
    modal.openCreate(prefill);
    const notice = modal.element.querySelector<HTMLElement>("#links-form-duplicate")!;
    const submitBtn = modal.element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const submit = () =>
      modal.element.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    return { modal, notice, submitBtn, submit, onSubmit, onOpenDuplicate, findDuplicate };
  }

  it("names the existing item as soon as a draft opens", () => {
    const { notice } = open({ url: "https://example.com/caranguejo" });
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("Almoçar no restaurante Vila do Caranguejo");
  });

  it("checks the source post link too, and updates when the link changes", () => {
    const { modal, notice } = open({ url: "https://example.com/lugar" });
    expect(notice.hidden).toBe(true);
    const source = modal.element.querySelector<HTMLInputElement>("#links-form-source_url")!;
    source.value = "https://instagram.com/p/caranguejo";
    source.dispatchEvent(new Event("input"));
    expect(notice.hidden).toBe(false);
    const url = modal.element.querySelector<HTMLInputElement>("#links-form-url")!;
    source.value = "";
    source.dispatchEvent(new Event("input"));
    url.value = "https://example.com/outro";
    url.dispatchEvent(new Event("input"));
    expect(notice.hidden).toBe(true);
  });

  it("holds the first Salvar, then saves on Salvar mesmo assim", () => {
    const { submitBtn, submit, onSubmit } = open({ url: "https://example.com/caranguejo" });
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(submitBtn.textContent).toBe("Salvar mesmo assim");
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("saves on the first Salvar when there is no duplicate", () => {
    const { submitBtn, submit, onSubmit } = open({ url: "https://example.com/novo" });
    expect(submitBtn.textContent).toBe("Salvar");
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("opens the existing item and closes the form", () => {
    const { modal, notice, onOpenDuplicate } = open({ url: "https://example.com/caranguejo" });
    notice.querySelector<HTMLButtonElement>("button")!.click();
    expect(onOpenDuplicate).toHaveBeenCalledWith(existing);
    expect(modal.element.hidden).toBe(true);
  });

  it("never warns while editing, and resets the button on the next open", () => {
    const { modal, notice, submitBtn, submit, onSubmit, findDuplicate } = open({
      url: "https://example.com/caranguejo",
    });
    submit();
    modal.openEdit(row({ url: "https://example.com/caranguejo" }));
    expect(notice.hidden).toBe(true);
    expect(submitBtn.textContent).toBe("Salvar");
    findDuplicate.mockClear();
    submit();
    expect(findDuplicate).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
