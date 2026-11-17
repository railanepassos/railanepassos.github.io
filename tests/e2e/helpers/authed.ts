import { expect, type Page } from "@playwright/test";

/**
 * Shared helpers for e2e specs that need a mocked authenticated session with
 * custom rows and captured writes. No real credentials or data: the session is
 * a fake JWT-shaped token and every Supabase call is intercepted.
 */

export const PROJECT_REF = "fashrynmqkucrlxoglsp";
export const SUPABASE = `https://${PROJECT_REF}.supabase.co`;

function base64Url(value: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeSession(): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "tester@example.test",
    aud: "authenticated",
    role: "authenticated",
  };
  const token = [
    base64Url({ alg: "HS256", typ: "JWT" }),
    base64Url({ sub: user.id, exp, aud: "authenticated", role: "authenticated" }),
    "signature",
  ].join(".");
  return JSON.stringify({
    access_token: token,
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: exp,
    refresh_token: "fake-refresh-token",
    user,
  });
}

export type Writes = {
  /** Body of the last POST (create). */
  created: Record<string, unknown> | null;
  /** Body of the last PATCH (update). */
  patched: Record<string, unknown> | null;
  /** Every PATCH body, in order (a flow can write more than once). */
  allPatched: Array<Record<string, unknown>>;
  /**
   * The mocked server rows (live: mutate them to simulate someone else saving).
   * PATCHes honour `updated_at=eq.<value>` like PostgREST: no match -> `[]`.
   */
  rows: Array<Record<string, unknown>>;
};

let stamp = 0;

/** Opens /p/a8f3k2/ with a fake session. GET returns `rows`; POST/PATCH are captured. */
export async function openAuthedWith(
  page: Page,
  initialRows: Array<Record<string, unknown>>,
  options: { /** Fragment to open the page with, e.g. "#rascunho=...". */ hash?: string; /** No stored session: the login form answers with the fake session. */ loggedOut?: boolean; /** The list GET fails (HTTP 500). */ listFails?: boolean } = {}
): Promise<Writes> {
  // Own copies: the mock "server" mutates its rows, shared fixtures must stay pristine.
  const rows = initialRows.map((row) => ({ ...row }));
  const writes: Writes = { created: null, patched: null, allPatched: [], rows };
  if (!options.loggedOut) {
    await page.addInitScript(
      ([key, value]) => {
        localStorage.setItem(key, value);
        localStorage.setItem("links-remember-me", "1");
      },
      [`sb-${PROJECT_REF}-auth-token`, fakeSession()] as const
    );
  }
  await page.route(`${SUPABASE}/rest/v1/links**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const params = new URL(request.url()).searchParams;
    const idFilter = params.get("id")?.replace(/^eq\./, "");
    if (method === "GET" && options.listFails) {
      await route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' });
    } else if (method === "GET") {
      const single = (request.headers().accept ?? "").includes("vnd.pgrst.object");
      const found = idFilter ? rows.filter((r) => r.id === idFilter) : rows;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(single ? (found[0] ?? null) : found),
      });
    } else if (method === "POST") {
      writes.created = request.postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000099", ...writes.created }),
      });
    } else if (method === "PATCH") {
      writes.patched = request.postDataJSON();
      writes.allPatched.push(writes.patched!);
      const row = rows.find((r) => r.id === idFilter);
      const expected = params.get("updated_at")?.replace(/^eq\./, "");
      if (!row || (expected !== undefined && row.updated_at !== expected)) {
        await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      } else {
        stamp += 1;
        Object.assign(row, writes.patched, { updated_at: `2026-11-17T12:00:${String(stamp % 60).padStart(2, "0")}.${String(stamp).padStart(6, "0")}+00:00` });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{ updated_at: row.updated_at }]),
        });
      }
    } else {
      await route.fulfill({ status: 204, body: "" });
    }
  });
  await page.route(`${SUPABASE}/auth/v1/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: options.loggedOut && route.request().url().includes("/token") ? fakeSession() : "{}",
    })
  );
  await page.goto(`/p/a8f3k2/${options.hash ?? ""}`);
  if (!options.loggedOut && !options.listFails) await expect(page.locator(".feed-card").first()).toBeVisible();
  return writes;
}

export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 720;
}

export async function openAddForm(page: Page): Promise<void> {
  if (isMobile(page)) {
    await page.locator("#links-tabbar").getByRole("button", { name: "Nova experiência" }).click();
  } else {
    await page.locator(".links-appbar__add").click();
  }
}
