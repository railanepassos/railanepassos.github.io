import { describe, expect, it } from "vitest";
import {
  buildCalendarIcs,
  googleCalendarUrl,
  scheduledForCalendar,
  GOOGLE_URL_MAX,
} from "../../src/links/google-calendar";
import { foldIcsLine } from "../../src/links/ics";
import type { LinkRow } from "../../src/links/links-repo";

function row(partial: Partial<LinkRow> = {}): LinkRow {
  return {
    id: "id-1",
    url: "https://example.com/lugar",
    label: "Museu do Mar",
    description: null,
    icon_preset: null,
    icon_url: null,
    category: "museu",
    sort_order: 0,
    scheduled_start: "2026-07-20T09:00:00-03:00",
    scheduled_end: "2026-07-20T17:00:00-03:00",
    status: "wishlist",
    priority: 0,
    want_again: false,
    image_url: null,
    note: null,
    completed_at: null,
    ...partial,
  };
}

describe("googleCalendarUrl", () => {
  it("builds the template with UTC dates, tz, title, location and details", () => {
    const url = new URL(
      googleCalendarUrl(
        row({ description: "Exposição", address: "Rua A, 10", city: "Maceió" })
      )!
    );
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Museu do Mar");
    expect(url.searchParams.get("dates")).toBe("20260720T120000Z/20260720T200000Z");
    expect(url.searchParams.get("ctz")).toBe("America/Bahia");
    expect(url.searchParams.get("location")).toBe("Rua A, 10, Maceió");
    expect(url.searchParams.get("details")).toBe("Exposição\nhttps://example.com/lugar");
  });

  it("keeps accents encoded and round-trips them", () => {
    const href = googleCalendarUrl(row({ label: "Café & Pão: São João" }))!;
    expect(href).toContain("text=Caf%C3%A9+%26+P%C3%A3o");
    expect(new URL(href).searchParams.get("text")).toBe("Café & Pão: São João");
  });

  it("omits location when there is no address or city, and joins what exists", () => {
    expect(new URL(googleCalendarUrl(row())!).searchParams.has("location")).toBe(false);
    expect(new URL(googleCalendarUrl(row({ city: "Recife" }))!).searchParams.get("location")).toBe(
      "Recife"
    );
  });

  it("uses only the place URL as details when there is no description", () => {
    expect(new URL(googleCalendarUrl(row())!).searchParams.get("details")).toBe(
      "https://example.com/lugar"
    );
  });

  it("returns null when the place has no schedule", () => {
    expect(googleCalendarUrl(row({ scheduled_start: null, scheduled_end: null }))).toBeNull();
    expect(googleCalendarUrl(row({ scheduled_end: null }))).toBeNull();
  });

  it("truncates a huge description so the URL stays under the limit, keeping the place URL", () => {
    const href = googleCalendarUrl(row({ description: "ação ".repeat(2000) }))!;
    expect(href.length).toBeLessThanOrEqual(GOOGLE_URL_MAX);
    const details = new URL(href).searchParams.get("details")!;
    expect(details.endsWith("https://example.com/lugar")).toBe(true);
    expect(details).toContain("…");
  });
});

describe("scheduledForCalendar", () => {
  it("keeps scheduled, not-done places sorted by start", () => {
    const a = row({ id: "a", scheduled_start: "2026-08-02T09:00:00-03:00", scheduled_end: "2026-08-02T10:00:00-03:00" });
    const b = row({ id: "b" });
    const done = row({ id: "c", status: "done" });
    const none = row({ id: "d", scheduled_start: null, scheduled_end: null });
    expect(scheduledForCalendar([a, done, none, b]).map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("buildCalendarIcs", () => {
  it("emits a valid empty calendar for no events", () => {
    const ics = buildCalendarIcs([]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("emits one VEVENT per scheduled place with local TZID times", () => {
    const ics = buildCalendarIcs([row()]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics).toContain("UID:id-1@railanepassos.tec.br");
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20260720T090000");
    expect(ics).toContain("SUMMARY:Museu do Mar");
  });

  it("emits N events, skipping places that are not scheduled or are done", () => {
    const ics = buildCalendarIcs([
      row({ id: "a" }),
      row({ id: "b", label: "Outro, lugar; ok" }),
      row({ id: "c", status: "done" }),
      row({ id: "d", scheduled_start: null, scheduled_end: null }),
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Outro\\, lugar\\; ok");
    expect(ics).not.toContain("UID:c@");
  });

  it("puts the address in LOCATION", () => {
    const ics = buildCalendarIcs([row({ address: "Rua A, 10", city: "Maceió" })]);
    expect(ics).toContain("LOCATION:Rua A\\, 10\\, Maceió");
  });

  it("folds lines longer than 75 octets with CRLF + space", () => {
    const ics = buildCalendarIcs([row({ description: "palavra ".repeat(40) })]);
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines alone", () => {
    expect(foldIcsLine("SUMMARY:oi")).toBe("SUMMARY:oi");
  });

  it("never splits a multi-byte character and unfolds back to the original", () => {
    const line = "SUMMARY:" + "ção ".repeat(60);
    const folded = foldIcsLine(line);
    expect(folded).toContain("\r\n ");
    for (const part of folded.split("\r\n")) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});
