import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calendarFeedUrl,
  calendarFeedWebcalUrl,
  googleSubscribeUrl,
  isCalendarToken,
  readCalendarFeedState,
} from "../../src/links/calendar-feed";
import { createLinksRepo } from "../../src/links/links-repo";

const TOKEN = "abcDEF012-_".repeat(4).slice(0, 43);
const BASE = "https://proj.supabase.co";

describe("calendar feed urls", () => {
  it("validates the 43-character base64url token", () => {
    expect(isCalendarToken(TOKEN)).toBe(true);
    expect(isCalendarToken(TOKEN.slice(1))).toBe(false);
    expect(isCalendarToken(TOKEN.slice(0, -1) + "=")).toBe(false);
    expect(isCalendarToken("")).toBe(false);
  });

  it("builds the function url with the token in the query", () => {
    expect(calendarFeedUrl(BASE, TOKEN)).toBe(`${BASE}/functions/v1/links-calendar?t=${TOKEN}`);
    expect(calendarFeedUrl(`${BASE}/`, TOKEN)).toBe(`${BASE}/functions/v1/links-calendar?t=${TOKEN}`);
  });

  it("builds the webcal form", () => {
    expect(calendarFeedWebcalUrl(BASE, TOKEN)).toBe(
      `webcal://proj.supabase.co/functions/v1/links-calendar?t=${TOKEN}`
    );
  });

  it("builds the Google subscribe url with the webcal form encoded in cid", () => {
    const href = googleSubscribeUrl(BASE, TOKEN);
    expect(href.startsWith("https://calendar.google.com/calendar/r?cid=")).toBe(true);
    expect(href).toBe(
      "https://calendar.google.com/calendar/r?cid=" +
        encodeURIComponent(`webcal://proj.supabase.co/functions/v1/links-calendar?t=${TOKEN}`)
    );
    expect(href).toContain("webcal%3A%2F%2F");
  });
});

describe("readCalendarFeedState", () => {
  it("reads an enabled feed, and treats anything odd as off", () => {
    expect(readCalendarFeedState({ enabled: true, token: TOKEN })).toEqual({ enabled: true, token: TOKEN });
    expect(readCalendarFeedState({ enabled: false, token: null })).toEqual({ enabled: false, token: null });
    expect(readCalendarFeedState({ enabled: true, token: "curto" })).toEqual({ enabled: false, token: null });
    expect(readCalendarFeedState(null)).toEqual({ enabled: false, token: null });
    expect(readCalendarFeedState("x")).toEqual({ enabled: false, token: null });
  });
});

function clientWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("repo: calendar feed rpcs", () => {
  it("get calls links_calendar_feed_get and parses the state", async () => {
    const { client, rpc } = clientWithRpc({ data: { enabled: true, token: TOKEN }, error: null });
    await expect(createLinksRepo(client).getCalendarFeed()).resolves.toEqual({ enabled: true, token: TOKEN });
    expect(rpc).toHaveBeenCalledWith("links_calendar_feed_get");
  });

  it("enable returns the token and rejects errors or a malformed token", async () => {
    const ok = clientWithRpc({ data: TOKEN, error: null });
    await expect(createLinksRepo(ok.client).enableCalendarFeed()).resolves.toBe(TOKEN);
    expect(ok.rpc).toHaveBeenCalledWith("links_calendar_feed_enable");
    const failing = clientWithRpc({ data: null, error: { message: "boom" } });
    await expect(createLinksRepo(failing.client).enableCalendarFeed()).rejects.toThrow("boom");
    const bad = clientWithRpc({ data: "nope", error: null });
    await expect(createLinksRepo(bad.client).enableCalendarFeed()).rejects.toThrow();
  });

  it("disable calls the rpc, requires true, and surfaces errors", async () => {
    const ok = clientWithRpc({ data: true, error: null });
    await createLinksRepo(ok.client).disableCalendarFeed();
    expect(ok.rpc).toHaveBeenCalledWith("links_calendar_feed_disable");
    const no = clientWithRpc({ data: false, error: null });
    await expect(createLinksRepo(no.client).disableCalendarFeed()).rejects.toThrow();
    const failing = clientWithRpc({ data: null, error: { message: "boom" } });
    await expect(createLinksRepo(failing.client).disableCalendarFeed()).rejects.toThrow("boom");
  });
});
