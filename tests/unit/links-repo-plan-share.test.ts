import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLinksRepo, normalizeLinkRow } from "../../src/links/links-repo";
import { fetchSharedPlan } from "../../src/links/shared-plan-api";

const TOKEN = "0123456789abcdef".repeat(4);
const BASE = { id: "1", url: "https://a.example", label: "A" };

function clientWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("plan_share_token on the row", () => {
  it("is null when absent and kept when present", () => {
    expect(normalizeLinkRow(BASE).plan_share_token).toBeNull();
    expect(normalizeLinkRow({ ...BASE, plan_share_token: TOKEN }).plan_share_token).toBe(TOKEN);
  });
});

describe("enablePlanShare / disablePlanShare", () => {
  it("enable calls the rpc with link_id and returns the token", async () => {
    const { client, rpc } = clientWithRpc({ data: TOKEN, error: null });
    await expect(createLinksRepo(client).enablePlanShare("abc")).resolves.toBe(TOKEN);
    expect(rpc).toHaveBeenCalledWith("links_plan_share_enable", { link_id: "abc" });
  });

  it("enable rejects an error or a malformed token", async () => {
    const failing = clientWithRpc({ data: null, error: { message: "boom" } });
    await expect(createLinksRepo(failing.client).enablePlanShare("abc")).rejects.toThrow("boom");
    const bad = clientWithRpc({ data: "nope", error: null });
    await expect(createLinksRepo(bad.client).enablePlanShare("abc")).rejects.toThrow();
  });

  it("disable calls the rpc and surfaces errors", async () => {
    const { client, rpc } = clientWithRpc({ data: null, error: null });
    await createLinksRepo(client).disablePlanShare("abc");
    expect(rpc).toHaveBeenCalledWith("links_plan_share_disable", { link_id: "abc" });
    const failing = clientWithRpc({ data: null, error: { message: "boom" } });
    await expect(createLinksRepo(failing.client).disablePlanShare("abc")).rejects.toThrow("boom");
  });
});

describe("fetchSharedPlan (public, no auth client)", () => {
  const CFG = { url: "https://proj.supabase.co", anonKey: "anon-key" };

  function fetchReturning(status: number, body: unknown): typeof fetch {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  it("posts the token to the rpc with only the anon key", async () => {
    const f = fetchReturning(200, { label: "Lugar" });
    const plan = await fetchSharedPlan(CFG, TOKEN, f);
    expect(plan).toEqual({ label: "Lugar" });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://proj.supabase.co/rest/v1/rpc/links_shared_plan_get");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN });
    expect(init.headers.apikey).toBe("anon-key");
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
  });

  it("returns null when the server answers null", async () => {
    expect(await fetchSharedPlan(CFG, TOKEN, fetchReturning(200, null))).toBeNull();
  });

  it("throws on a server error (not the same as inactive)", async () => {
    await expect(fetchSharedPlan(CFG, TOKEN, fetchReturning(500, {}))).rejects.toThrow();
  });
});
