// Supabase Edge Function (Deno): GET /functions/v1/links-calendar?t=<token>
// Serves the scheduled places as an .ics feed for Google Agenda. Deploy with
// verify_jwt = false (Google sends no JWT); the secret token is the access control.
import { FEED_COLUMNS, type FeedRow, type FeedState } from "./feed.ts";
import { handleFeedRequest } from "./handler.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function rest(path: string): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!response.ok) throw new Error(`rest ${response.status}`);
  return response.json();
}

async function loadFeed(): Promise<FeedState> {
  const rows = (await rest("links_calendar_feed?select=token,enabled&id=eq.1&limit=1")) as Array<{
    token: string | null;
    enabled: boolean;
  }>;
  return rows[0] ?? null;
}

async function loadRows(from: Date, to: Date): Promise<FeedRow[]> {
  const params = new URLSearchParams();
  params.set("select", FEED_COLUMNS.join(","));
  params.set("status", "neq.done");
  params.append("scheduled_start", `gte.${from.toISOString()}`);
  params.append("scheduled_start", `lte.${to.toISOString()}`);
  params.set("order", "scheduled_start.asc");
  return (await rest(`links?${params.toString()}`)) as FeedRow[];
}

Deno.serve((request) => handleFeedRequest(request, { loadFeed, loadRows, now: () => new Date() }));
