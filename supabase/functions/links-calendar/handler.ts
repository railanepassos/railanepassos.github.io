import {
  buildFeedIcs,
  feedWindow,
  tokenMatches,
  type FeedRow,
  type FeedState,
} from "./feed.ts";

/**
 * Request handling of `links-calendar`, with the data layer injected so Vitest
 * can drive it. No Deno globals here; `index.ts` wires the environment.
 */

export type FeedDeps = {
  loadFeed: () => Promise<FeedState>;
  loadRows: (from: Date, to: Date) => Promise<FeedRow[]>;
  now: () => Date;
};

function notFound(): Response {
  // Same body and headers for a wrong token and for a disabled feed.
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function handleFeedRequest(request: Request, deps: FeedDeps): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  try {
    const token = new URL(request.url).searchParams.get("t");
    const feed = await deps.loadFeed();
    if (!tokenMatches(token, feed)) return notFound();
    const now = deps.now();
    const { from, to } = feedWindow(now);
    const rows = await deps.loadRows(from, to);
    const body = request.method === "HEAD" ? null : buildFeedIcs(rows, now);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=900",
      },
    });
  } catch {
    return new Response("Error", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
