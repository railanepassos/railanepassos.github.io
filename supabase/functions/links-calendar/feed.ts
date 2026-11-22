/**
 * Pure logic of the `links-calendar` Edge Function (Phase 10): token check,
 * date window, field selection and ICS text. No Deno globals, no I/O, so Vitest
 * imports it. It is deliberately self-contained (no import from `src/`): the
 * deploy bundles only this folder. Keep the escape/fold rules in sync with
 * `src/links/ics.ts` (a unit test compares both).
 */

/** Only these columns are ever read: no notes, impressions, people or plan. */
export const FEED_COLUMNS = [
  "id",
  "label",
  "scheduled_start",
  "scheduled_end",
  "address",
  "city",
  "url",
  "status",
] as const;

export type FeedRow = {
  id: string;
  label: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  address: string | null;
  city: string | null;
  url: string;
  status: string | null;
};

export type FeedState = { token: string | null; enabled: boolean } | null;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Constant-time token check: always walks the longer of the two strings, so the
 * time does not reveal where (or whether) the first difference is. False when
 * the feed is off, has no token, or the request has none.
 */
export function tokenMatches(provided: string | null, feed: FeedState): boolean {
  if (!feed || !feed.enabled || !feed.token || provided === null) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(feed.token);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0 && a.length > 0;
}

/** Last 30 days to next 12 months. */
export function feedWindow(now: Date): { from: Date; to: Date } {
  const to = new Date(now.getTime());
  to.setUTCFullYear(to.getUTCFullYear() + 1);
  return { from: new Date(now.getTime() - 30 * DAY_MS), to };
}

function startMs(row: FeedRow): number {
  return row.scheduled_start ? Date.parse(row.scheduled_start) : Number.NaN;
}

/** Scheduled, not done, with a valid start and end, inside the window; sorted by start. */
export function selectFeedRows(rows: readonly FeedRow[], now: Date): FeedRow[] {
  const { from, to } = feedWindow(now);
  return rows
    .filter((row) => {
      if ((row.status ?? "wishlist") === "done") return false;
      if (!row.scheduled_end || Number.isNaN(Date.parse(row.scheduled_end))) return false;
      const start = startMs(row);
      return !Number.isNaN(start) && start >= from.getTime() && start <= to.getTime();
    })
    .sort((a, b) => startMs(a) - startMs(b));
}

function utcStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
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
      limit = 74;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function eventLines(row: FeedRow, stamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeText(row.id)}@railanepassos.tec.br`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utcStamp(new Date(row.scheduled_start!))}`,
    `DTEND:${utcStamp(new Date(row.scheduled_end!))}`,
    `SUMMARY:${escapeText(row.label)}`,
  ];
  const location = [row.address, row.city]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(", ");
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push(`DESCRIPTION:${escapeText(row.url)}`);
  lines.push(`URL:${row.url.replace(/[\r\n]/g, "")}`);
  lines.push("END:VEVENT");
  return lines;
}

/** The whole feed. Rows outside the window or not schedulable are dropped here too. */
export function buildFeedIcs(rows: readonly FeedRow[], now: Date): string {
  const stamp = utcStamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Railane Passos//Experience Bucket List//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Experiências",
    ...selectFeedRows(rows, now).flatMap((row) => eventLines(row, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
