import { describe, expect, it } from "vitest";
import { buildIcs, icsUtcStamp } from "../../src/links/ics";

describe("buildIcs", () => {
  it("emits a VEVENT with summary, url, and local DTSTART/DTEND", () => {
    const ics = buildIcs({
      uid: "abc@railanepassos.tec.br",
      title: "Museu do Mar",
      description: "Aleixobelov",
      url: "https://www.instagram.com/museudomar.aleixobelov/",
      startIso: "2026-07-20T09:00:00-03:00",
      endIso: "2026-07-20T17:00:00-03:00",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Museu do Mar");
    expect(ics).toContain("UID:abc@railanepassos.tec.br");
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20260720T090000");
    expect(ics).toContain("DTEND;TZID=America/Sao_Paulo:20260720T170000");
    expect(ics).toContain("URL:https://www.instagram.com/museudomar.aleixobelov/");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("escapes commas and semicolons in text", () => {
    const ics = buildIcs({
      uid: "x@railanepassos.tec.br",
      title: "A, B; C",
      description: null,
      url: "https://example.com/a",
      startIso: "2026-07-20T09:00:00-03:00",
      endIso: "2026-07-20T17:00:00-03:00",
    });
    expect(ics).toContain("SUMMARY:A\\, B\\; C");
  });
});

describe("icsUtcStamp", () => {
  it("formats Date as YYYYMMDDTHHMMSSZ", () => {
    expect(icsUtcStamp(new Date("2026-07-20T12:00:00.000Z"))).toBe(
      "20260720T120000Z"
    );
  });
});
