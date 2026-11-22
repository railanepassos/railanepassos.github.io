import { describe, expect, it, vi } from "vitest";
import { handleFeedRequest } from "../../supabase/functions/links-calendar/handler";
import type { FeedRow } from "../../supabase/functions/links-calendar/feed";

const NOW = new Date("2026-11-22T12:00:00Z");
const TOKEN = "t".repeat(43);
const ROW: FeedRow = {
  id: "id-1",
  label: "Museu",
  scheduled_start: "2026-12-20T09:00:00-03:00",
  scheduled_end: "2026-12-20T17:00:00-03:00",
  address: null,
  city: null,
  url: "https://example.com/m",
  status: "wishlist",
};

function deps(over: Record<string, unknown> = {}) {
  return {
    loadFeed: vi.fn().mockResolvedValue({ token: TOKEN, enabled: true }),
    loadRows: vi.fn().mockResolvedValue([ROW]),
    now: () => NOW,
    ...over,
  };
}

const req = (query: string, method = "GET") =>
  new Request(`https://x.supabase.co/functions/v1/links-calendar${query}`, { method });

async function expectGeneric404(res: Response): Promise<void> {
  expect(res.status).toBe(404);
  const body = await res.text();
  expect(body).toBe("Not found");
  expect(body).not.toContain(TOKEN);
}

describe("handleFeedRequest", () => {
  it("serves the feed for a valid token, with the calendar content type and private cache", async () => {
    const d = deps();
    const res = await handleFeedRequest(req(`?t=${TOKEN}`), d);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("private, max-age=900");
    const body = await res.text();
    expect(body).toContain("SUMMARY:Museu");
    expect(body).not.toContain(TOKEN);
    expect(d.loadRows).toHaveBeenCalledTimes(1);
    const [from, to] = d.loadRows.mock.calls[0]!;
    expect((from as Date).toISOString()).toBe("2026-10-23T12:00:00.000Z");
    expect((to as Date).toISOString()).toBe("2027-11-22T12:00:00.000Z");
  });

  it("answers the same generic 404 for a wrong token, a missing token and a disabled feed", async () => {
    const wrong = await handleFeedRequest(req("?t=errado"), deps());
    const missing = await handleFeedRequest(req(""), deps());
    const off = await handleFeedRequest(
      req(`?t=${TOKEN}`),
      deps({ loadFeed: vi.fn().mockResolvedValue({ token: null, enabled: false }) })
    );
    const noRow = await handleFeedRequest(
      req(`?t=${TOKEN}`),
      deps({ loadFeed: vi.fn().mockResolvedValue(null) })
    );
    for (const res of [wrong, missing, off, noRow]) await expectGeneric404(res);
    expect(wrong.headers.get("content-type")).toBe(off.headers.get("content-type"));
  });

  it("never reads the places before the token is accepted", async () => {
    const d = deps();
    await handleFeedRequest(req("?t=errado"), d);
    expect(d.loadRows).not.toHaveBeenCalled();
  });

  it("rejects non-GET methods without touching data", async () => {
    const d = deps();
    const res = await handleFeedRequest(req(`?t=${TOKEN}`, "POST"), d);
    expect(res.status).toBe(405);
    expect(d.loadFeed).not.toHaveBeenCalled();
  });

  it("answers HEAD like GET without a body", async () => {
    const res = await handleFeedRequest(req(`?t=${TOKEN}`, "HEAD"), deps());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("answers a generic 500 (no detail) when the data layer fails", async () => {
    const res = await handleFeedRequest(
      req(`?t=${TOKEN}`),
      deps({ loadRows: vi.fn().mockRejectedValue(new Error("secret db detail")) })
    );
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Error");
  });
});
