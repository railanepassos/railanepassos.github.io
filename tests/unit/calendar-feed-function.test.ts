import { describe, expect, it } from "vitest";
import {
  buildFeedIcs,
  feedWindow,
  FEED_COLUMNS,
  selectFeedRows,
  tokenMatches,
  type FeedRow,
} from "../../supabase/functions/links-calendar/feed";
import { buildIcs } from "../../src/links/ics";

const NOW = new Date("2026-11-22T12:00:00Z");
const TOKEN = "A".repeat(20) + "b-_9".repeat(5) + "xyz";

function row(partial: Partial<FeedRow> = {}): FeedRow {
  return {
    id: "id-1",
    label: "Museu do Mar",
    scheduled_start: "2026-12-20T09:00:00-03:00",
    scheduled_end: "2026-12-20T17:00:00-03:00",
    address: "Rua A, 10",
    city: "Maceió",
    url: "https://example.com/lugar",
    status: "wishlist",
    ...partial,
  };
}

describe("tokenMatches", () => {
  const feed = { token: TOKEN, enabled: true };

  it("accepts the stored token when the feed is on", () => {
    expect(tokenMatches(TOKEN, feed)).toBe(true);
  });

  it("rejects a wrong, empty, longer, shorter or missing token", () => {
    expect(tokenMatches(TOKEN.slice(0, -1) + "Q", feed)).toBe(false);
    expect(tokenMatches("", feed)).toBe(false);
    expect(tokenMatches(TOKEN + "x", feed)).toBe(false);
    expect(tokenMatches(TOKEN.slice(1), feed)).toBe(false);
    expect(tokenMatches(null, feed)).toBe(false);
  });

  it("rejects everything when the feed is off or has no token", () => {
    expect(tokenMatches(TOKEN, { token: TOKEN, enabled: false })).toBe(false);
    expect(tokenMatches(TOKEN, { token: null, enabled: true })).toBe(false);
    expect(tokenMatches("", { token: null, enabled: false })).toBe(false);
    expect(tokenMatches(TOKEN, null)).toBe(false);
  });
});

describe("feedWindow / selectFeedRows", () => {
  it("covers the last 30 days and the next 12 months", () => {
    const { from, to } = feedWindow(NOW);
    expect(from.toISOString()).toBe("2026-10-23T12:00:00.000Z");
    expect(to.toISOString()).toBe("2027-11-22T12:00:00.000Z");
  });

  it("keeps scheduled, not-done rows inside the window, sorted by start", () => {
    const early = row({ id: "early", scheduled_start: "2026-11-01T09:00:00-03:00", scheduled_end: "2026-11-01T10:00:00-03:00" });
    const late = row({ id: "late", scheduled_start: "2027-06-01T09:00:00-03:00", scheduled_end: "2027-06-01T10:00:00-03:00" });
    const tooOld = row({ id: "old", scheduled_start: "2026-09-01T09:00:00-03:00", scheduled_end: "2026-09-01T10:00:00-03:00" });
    const tooFar = row({ id: "far", scheduled_start: "2028-01-01T09:00:00-03:00", scheduled_end: "2028-01-01T10:00:00-03:00" });
    const done = row({ id: "done", status: "done" });
    const none = row({ id: "none", scheduled_start: null, scheduled_end: null });
    const noEnd = row({ id: "noend", scheduled_end: null });
    const mid = row({ id: "mid" });
    const out = selectFeedRows([late, tooOld, done, mid, none, noEnd, tooFar, early], NOW);
    expect(out.map((r) => r.id)).toEqual(["early", "mid", "late"]);
  });
});

describe("buildFeedIcs", () => {
  it("emits UTC events with name, dates, address and place url", () => {
    const ics = buildFeedIcs([row()], NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:id-1@railanepassos.tec.br");
    expect(ics).toContain("DTSTAMP:20261122T120000Z");
    expect(ics).toContain("DTSTART:20261220T120000Z");
    expect(ics).toContain("DTEND:20261220T200000Z");
    expect(ics).toContain("SUMMARY:Museu do Mar");
    expect(ics).toContain("LOCATION:Rua A\\, 10\\, Maceió");
    expect(ics).toContain("URL:https://example.com/lugar");
    expect(ics).toContain("DESCRIPTION:https://example.com/lugar");
  });

  it("does not select or emit notes, impressions, people or plan", () => {
    expect(FEED_COLUMNS).toEqual([
      "id",
      "label",
      "scheduled_start",
      "scheduled_end",
      "address",
      "city",
      "url",
      "status",
    ]);
    const leaky = {
      ...row(),
      note: "SEGREDO-NOTA",
      description: "SEGREDO-DESC",
      impressions: "SEGREDO-IMP",
      people: ["SEGREDO-PESSOA"],
      plan_items: [{ text: "SEGREDO-PLANO" }],
    } as FeedRow;
    const ics = buildFeedIcs([leaky], NOW);
    expect(ics).not.toContain("SEGREDO");
  });

  it("is an empty valid calendar with no rows, and skips places with no end", () => {
    expect(buildFeedIcs([], NOW)).not.toContain("BEGIN:VEVENT");
    expect(buildFeedIcs([row({ scheduled_end: null })], NOW)).not.toContain("BEGIN:VEVENT");
  });

  it("escapes and folds long titles", () => {
    const ics = buildFeedIcs([row({ label: "A, B; C " + "palavra ".repeat(20) })], NOW);
    expect(ics).toContain("SUMMARY:A\\, B\; C");
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("matches the app's own events line for line (same escapes), apart from time form and stamp", () => {
    const app = buildIcs({
      uid: "id-1@railanepassos.tec.br",
      title: "Museu do Mar",
      description: null,
      url: "https://example.com/lugar",
      startIso: "2026-12-20T09:00:00-03:00",
      endIso: "2026-12-20T17:00:00-03:00",
    });
    const feed = buildFeedIcs([row({ address: null, city: null })], NOW);
    const keep = (text: string) =>
      text.split("\r\n").filter((l) => /^(UID|SUMMARY|DESCRIPTION|URL|BEGIN|END|VERSION|PRODID):/.test(l));
    expect(keep(feed)).toEqual(keep(app));
  });
});
