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

export function buildIcs(input: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Railane Passos//Experience Bucket List//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(input.uid)}`,
    `DTSTAMP:${icsUtcStamp(new Date())}`,
    `DTSTART;TZID=${SCHEDULE_TZID}:${toLocalIcsStamp(input.startIso)}`,
    `DTEND;TZID=${SCHEDULE_TZID}:${toLocalIcsStamp(input.endIso)}`,
    `SUMMARY:${escapeText(input.title)}`,
  ];
  const descParts = [
    input.description?.trim() || "",
    input.url,
  ].filter(Boolean);
  if (descParts.length) {
    lines.push(`DESCRIPTION:${escapeText(descParts.join("\n"))}`);
  }
  lines.push(`URL:${input.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR", "");
  return lines.join("\r\n");
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
