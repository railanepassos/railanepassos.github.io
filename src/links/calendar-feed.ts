/**
 * Google Agenda subscription feed (Phase 10), client side. Pure: no DOM, no
 * network. The function itself lives in supabase/functions/links-calendar.
 */

export type CalendarFeedState = { enabled: boolean; token: string | null };

/** Same shape the DB check of migration 022 enforces: base64url of 32 bytes. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isCalendarToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

/** Result of links_calendar_feed_get -> state; anything unexpected reads as "off". */
export function readCalendarFeedState(data: unknown): CalendarFeedState {
  if (typeof data === "object" && data !== null) {
    const { enabled, token } = data as Record<string, unknown>;
    if (enabled === true && isCalendarToken(token)) return { enabled: true, token };
  }
  return { enabled: false, token: null };
}

function functionBase(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/links-calendar`;
}

/** https URL of the feed; the token is in the query (Google cannot send headers). */
export function calendarFeedUrl(supabaseUrl: string, token: string): string {
  return `${functionBase(supabaseUrl)}?t=${token}`;
}

export function calendarFeedWebcalUrl(supabaseUrl: string, token: string): string {
  return calendarFeedUrl(supabaseUrl, token).replace(/^https?:/, "webcal:");
}

/** Opens Google Agenda's "add by URL" confirmation for this feed. */
export function googleSubscribeUrl(supabaseUrl: string, token: string): string {
  return (
    "https://calendar.google.com/calendar/r?cid=" +
    encodeURIComponent(calendarFeedWebcalUrl(supabaseUrl, token))
  );
}
