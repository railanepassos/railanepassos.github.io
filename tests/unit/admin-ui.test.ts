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
      onSave,
    });

    const date = sheet.element.querySelector("#links-schedule-date") as HTMLInputElement;
    const start = sheet.element.querySelector("#links-schedule-start") as HTMLInputElement;
    const end = sheet.element.querySelector("#links-schedule-end") as HTMLInputElement;

    expect(sheet.element.hidden).toBe(false);
    expect(document.activeElement).toBe(document.body);
    expect(sheet.element.textContent).toContain(
      "Padrão: deslocamento incluso (9h–17h). No local ~10h–16h."
    );

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

  it("shows form errors and toggles screen busy", () => {
    const sheet = createScheduleSheet();
    document.body.appendChild(sheet.element);
    sheet.open({
      initial: { date: "2026-07-12", startTime: "09:00", endTime: "17:00" },
      onSave: vi.fn(),
    });

    sheet.setError("Data inválida.");
    expect(sheet.element.textContent).toContain("Data inválida.");

    sheet.setBusy(true);
    expect(sheet.element.querySelector(".links-skeleton-screen")).toBeTruthy();
    expect(
      sheet.element.querySelector(".links-admin-modal__dialog")?.getAttribute("aria-busy")
    ).toBe("true");

    sheet.setBusy(false);
    expect(
      sheet.element.querySelector(".links-admin-modal__dialog")?.hasAttribute("aria-busy")
    ).toBe(false);
  });
});

describe("createViewModal", () => {
  it("shows Agendar above Editar when the link has no schedule", () => {
    const onEdit = vi.fn();
    const onSchedule = vi.fn();
    const modal = createViewModal({
      onEdit,
      onSchedule,
      onDownloadIcs: vi.fn(),
      onClearSchedule: vi.fn(),
    });
    document.body.appendChild(modal.element);

    modal.open(row());

    const buttons = [...modal.element.querySelectorAll("button")].map((btn) =>
      btn.textContent?.trim()
    );
    expect(buttons).toContain("Agendar");
    expect(buttons.indexOf("Agendar")).toBeLessThan(buttons.indexOf("Editar"));
    expect(
      (modal.element.querySelector(".links-admin-view__block") as HTMLElement).hidden
    ).toBe(true);

    modal.element.querySelectorAll("button")[1]?.click();
    expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({ id: "link-1" }));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("shows schedule actions when the link has a schedule", () => {
    const callbacks = {
      onEdit: vi.fn(),
      onSchedule: vi.fn(),
      onDownloadIcs: vi.fn(),
      onClearSchedule: vi.fn(),
    };
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
    expect(modal.element.textContent).toContain("Baixar ICS");
    expect(modal.element.textContent).toContain("Alterar data");
    expect(modal.element.textContent).toContain("Remover agendamento");

    const downloadBtn = [...modal.element.querySelectorAll("button")].find(
      (btn) => btn.textContent === "Baixar ICS"
    );
    downloadBtn?.click();
    expect(callbacks.onDownloadIcs).toHaveBeenCalledWith(
      expect.objectContaining({ id: "link-1" })
    );
  });
});

describe("renderAdminCard", () => {
  it("renders a schedule chip when start and end are present", () => {
    const card = renderAdminCard(
      row({
        scheduled_start: "2026-08-03T09:00:00-03:00",
        scheduled_end: "2026-08-03T17:00:00-03:00",
      }),
      0,
      1,
      {
        onView: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onMoveUp: vi.fn(),
        onMoveDown: vi.fn(),
        onDragStart: vi.fn(),
        onDrop: vi.fn(),
      }
    );

    const chip = card.querySelector(".link-card__schedule");
    expect(chip?.textContent).toBe("3 ago · 9–17");
  });
});
