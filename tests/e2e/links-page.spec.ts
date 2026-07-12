import { test, expect } from "@playwright/test";

test.describe("Links admin page — unconfigured fallback", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/a8f3k2/");
  });

  test("page loads with title 'Links'", async ({ page }) => {
    await expect(page).toHaveTitle("Links");
  });

  test("meta CSP tag contains required directives", async ({ page }) => {
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");

    expect(csp).toBeTruthy();
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://*.supabase.co");
  });

  test("meta robots contains noindex", async ({ page }) => {
    const robots = await page
      .locator('meta[name="robots"]')
      .getAttribute("content");

    expect(robots).toContain("noindex");
  });

  test("nav#links-list eventually contains exactly 1 fallback .link-card", async ({
    page,
  }) => {
    const list = page.locator("nav#links-list");
    await expect(list).toBeVisible();

    // Wait for app.js to run and render the fallback card
    await expect(list.locator(".link-card")).toHaveCount(1);

    const card = list.locator(".link-card").first();
    await expect(card).toHaveAttribute(
      "href",
      "https://www.instagram.com/museudomar.aleixobelov/"
    );
  });

  test("no visible button inside #links-admin-root (admin UI absent in fallback mode)", async ({
    page,
  }) => {
    const adminRoot = page.locator("#links-admin-root");
    await expect(adminRoot).toBeAttached();

    // Wait for app.js to settle before asserting no button
    await expect(page.locator("nav#links-list .link-card")).toHaveCount(1);

    // In fallback mode the admin root must have no visible buttons
    await expect(adminRoot.locator("button")).toHaveCount(0);
  });

  test("app.js script tag is present with defer attribute", async ({
    page,
  }) => {
    const script = page.locator('script[src="app.js"]');
    await expect(script).toBeAttached();
    const defer = await script.getAttribute("defer");
    // defer is a boolean attribute; presence means defer="" or defer (both are non-null)
    expect(defer).not.toBeNull();
  });
});
