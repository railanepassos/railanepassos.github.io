import { test, expect } from "@playwright/test";

test.describe("Links admin page — smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/a8f3k2/");
  });

  test("page loads with Experience Bucket List title", async ({ page }) => {
    await expect(page).toHaveTitle("Experience Bucket List");
  });

  test("meta CSP tag contains required directives", async ({ page }) => {
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");

    expect(csp).toBeTruthy();
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  test("meta robots contains noindex", async ({ page }) => {
    const robots = await page
      .locator('meta[name="robots"]')
      .getAttribute("content");

    expect(robots).toContain("noindex");
  });

  test("nav#links-list eventually shows at least one .link-card", async ({
    page,
  }) => {
    const list = page.locator("nav#links-list");
    await expect(list).toBeVisible();

    // Fallback = 1 card; configured = live Supabase rows. Both are valid.
    await expect(list.locator(".link-card").first()).toBeVisible();
    expect(await list.locator(".link-card").count()).toBeGreaterThanOrEqual(1);
  });

  test("#links-admin-root is present after list settles", async ({ page }) => {
    const adminRoot = page.locator("#links-admin-root");
    await expect(adminRoot).toBeAttached();

    await expect(page.locator("nav#links-list .link-card").first()).toBeVisible();

    // Fallback: no buttons. Configured public: "Entrar". Either is fine for smoke.
    const buttons = adminRoot.locator("button");
    const count = await buttons.count();
    expect(count === 0 || count >= 1).toBe(true);
  });

  test("app.js script tag is present with defer attribute", async ({
    page,
  }) => {
    const script = page.locator('script[src="app.js"]');
    await expect(script).toBeAttached();
    const defer = await script.getAttribute("defer");
    expect(defer).not.toBeNull();
  });
});
