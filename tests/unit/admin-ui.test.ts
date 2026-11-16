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
      /URL https/
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
      /https/
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
    input.value = "http://example.com/p";
    input.dispatchEvent(new Event("input"));
    expect(err.hidden).toBe(false);
    expect(err.textContent).toMatch(/https/);
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
    ).toThrow(/Pose 1.*https/);
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
    type("links-form-pose-0-url", "http://example.com/a");
    const err = q<HTMLElement>("#links-form-pose-0-url-error");
    const input = q<HTMLInputElement>("#links-form-pose-0-url");
    expect(err.hidden).toBe(false);
    expect(err.textContent).toMatch(/https/);
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
