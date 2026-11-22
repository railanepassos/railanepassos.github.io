import { SCHEDULE_TZID, splitScheduleLocal } from "./schedule";

export type IcsInput = {
  uid: string;
  title: string;
  description: string | null;
  url: string;
  startIso: string;
  endIso: string;
};

export function icsUtcStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toLocalIcsStamp(iso: string): string {
  const { date, time } = splitScheduleLocal(iso);
  const [y, m, d] = date.split("-");
  const [hh, mm] = time.split(":");
  return `${y}${m}${d}T${hh}${mm}00`;
}

/** RFC 5545 section 3.1: fold lines longer than 75 octets (CRLF + space), never inside a character. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
      limit = 74; // continuation lines start with one space
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export type IcsEventInput = IcsInput & { location?: string | null };

/** The VEVENT block (BEGIN..END) of one event, unfolded. */
export function icsEventLines(input: IcsEventInput): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeText(input.uid)}`,
    `DTSTAMP:${icsUtcStamp(new Date())}`,
    `DTSTART;TZID=${SCHEDULE_TZID}:${toLocalIcsStamp(input.startIso)}`,
    `DTEND;TZID=${SCHEDULE_TZID}:${toLocalIcsStamp(input.endIso)}`,
    `SUMMARY:${escapeText(input.title)}`,
  ];
  const location = input.location?.trim();
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  const descParts = [
    input.description?.trim() || "",
    input.url,
  ].filter(Boolean);
  if (descParts.length) {
    lines.push(`DESCRIPTION:${escapeText(descParts.join("\n"))}`);
  }
  lines.push(`URL:${input.url}`);
  lines.push("END:VEVENT");
  return lines;
}

/** VCALENDAR wrapper around any number of events (zero is valid). */
export function wrapIcsCalendar(events: IcsEventInput[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Railane Passos//Experience Bucket List//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flatMap(icsEventLines),
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function buildIcs(input: IcsEventInput): string {
  return wrapIcsCalendar([input]);
}

/** Trigger a file download in the browser (no-op friendly for unit tests if unused). */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
