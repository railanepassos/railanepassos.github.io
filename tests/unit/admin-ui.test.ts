/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createScheduleSheet,
  createViewModal,
  renderAdminCard,
} from "../../src/links/admin-ui";
import type { LinkRow } from "../../src/links/links-repo";

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
  it("shows Agendar above Editar when the link has no schedule", () => {
    const onEdit = vi.fn();
    const onSchedule = vi.fn();
    const modal = createViewModal({ onEdit, onSchedule });
    document.body.appendChild(modal.element);

    modal.open(row());

    const actionButtons = [
      ...modal.element.querySelectorAll(
        ".links-admin-form__actions button"
      ),
    ].map((btn) => btn.textContent?.trim());
    expect(actionButtons).toEqual(["Agendar", "Editar"]);

    (
      modal.element.querySelector(
        ".links-admin-form__actions button"
      ) as HTMLButtonElement
    ).click();
    expect(onSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ id: "link-1" })
    );
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("shows Agenda label and opens schedule sheet callback when scheduled", () => {
    const callbacks = { onEdit: vi.fn(), onSchedule: vi.fn() };
    const modal = createViewModal(callbacks);
    document.body.appendChild(modal.element);

    modal.open(
      row({
        scheduled_start: "2026-08-03T09:00:00-03:00",
        scheduled_end: "2026-08-03T17:00:00-03:00",
      })
    );

    expect(modal.element.textContent).toContain("Agendado");
    expect(modal.element.textContent).toContain("3 ago 2026 · 09:00–17:00");
    const actionButtons = [
      ...modal.element.querySelectorAll(
        ".links-admin-form__actions button"
      ),
    ].map((btn) => btn.textContent?.trim());
    expect(actionButtons).toEqual(["Agenda", "Editar"]);
    expect(modal.element.textContent).not.toContain("Baixar ICS");
    expect(modal.element.textContent).not.toContain("Remover agendamento");

    (
      modal.element.querySelector(
        ".links-admin-form__actions button"
      ) as HTMLButtonElement
    ).click();
    expect(callbacks.onSchedule).toHaveBeenCalled();
  });
});

describe("renderAdminCard", () => {
  it("renders a schedule chip when start and end are present", () => {
    const card = renderAdminCard(
      row({
        scheduled_start: "2026-08-03T09:00:00-03:00",
        scheduled_end: "2026-08-03T17:00:00-03:00",
      }),
      {
        onView: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }
    );

    const chip = card.querySelector(".link-card__schedule");
    expect(chip?.textContent).toBe("3 ago · 9–17");
  });
});
