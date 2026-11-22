import { icsUtcStamp, wrapIcsCalendar, type IcsEventInput } from "./ics";
import type { LinkRow } from "./links-repo";

/**
 * Google Agenda export (Phase 10). Pure: no DOM, no network.
 *
 * `googleCalendarUrl` is the plain "add event" template link: the app only
 * navigates to it in a new tab (no API, no OAuth, no CSP change).
 */

export const GOOGLE_TEMPLATE_URL = "https://calendar.google.com/calendar/render";
export const GOOGLE_CALENDAR_TZ = "America/Bahia";
/** Conservative cap for the whole URL; browsers and Google refuse very long ones. */
export const GOOGLE_URL_MAX = 1800;

export function hasSchedule(link: LinkRow): boolean {
  return Boolean(link.scheduled_start && link.scheduled_end);
}

function locationOf(link: LinkRow): string {
  return [link.address, link.city]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(", ");
}

function detailsOf(description: string, url: string): string {
  return [description, url].filter((part) => part.length > 0).join("\n");
}

function utcStamp(iso: string): string | null {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : icsUtcStamp(new Date(time));
}

function build(link: LinkRow, dates: string, details: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: link.label,
    dates,
    details,
    ctz: GOOGLE_CALENDAR_TZ,
  });
  const location = locationOf(link);
  if (location) params.set("location", location);
  return `${GOOGLE_TEMPLATE_URL}?${params.toString()}`;
}

/** Template URL for one scheduled place, or null when it has no (valid) schedule. */
export function googleCalendarUrl(link: LinkRow): string | null {
  if (!link.scheduled_start || !link.scheduled_end) return null;
  const start = utcStamp(link.scheduled_start);
  const end = utcStamp(link.scheduled_end);
  if (!start || !end) return null;
  const dates = `${start}/${end}`;

  let description = (link.description ?? "").trim();
  let href = build(link, dates, detailsOf(description, link.url));
  // Shrink only the free text; the place URL stays so the map link survives.
  while (href.length > GOOGLE_URL_MAX && description.length > 0) {
    const chars = Array.from(description);
    const cut = Math.max(0, chars.length - Math.max(10, Math.ceil(chars.length / 8)));
    description = chars.slice(0, cut).join("").trimEnd();
    const shown = description.length > 0 ? `${description}…` : "";
    href = build(link, dates, detailsOf(shown, link.url));
    if (cut === 0) break;
  }
  return href;
}

/** Places that belong in a calendar: scheduled, not done, ordered by start. */
export function scheduledForCalendar(links: readonly LinkRow[]): LinkRow[] {
  return links
    .filter((l) => hasSchedule(l) && (l.status ?? "wishlist") !== "done")
    .sort((a, b) => Date.parse(a.scheduled_start!) - Date.parse(b.scheduled_start!));
}

function toEvent(link: LinkRow): IcsEventInput {
  return {
    uid: `${link.id}@railanepassos.tec.br`,
    title: link.label,
    description: link.description,
    url: link.url,
    startIso: link.scheduled_start!,
    endIso: link.scheduled_end!,
    location: locationOf(link) || null,
  };
}

/** One VCALENDAR with a VEVENT per scheduled, not-done place. */
export function buildCalendarIcs(links: readonly LinkRow[]): string {
  return wrapIcsCalendar(scheduledForCalendar(links).map(toEvent));
}
