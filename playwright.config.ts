import { defineConfig, devices } from "@playwright/test";

const useSystemChrome = !process.env.CI && process.platform === "darwin";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 15_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Local macOS: system Chrome → skip ms-playwright download (often hangs).
        // CI: Playwright Chromium from `npx playwright install chromium`.
        ...(useSystemChrome ? { channel: "chrome" as const } : {}),
      },
    },
  ],
  webServer: {
    // Built-in static server — no `npx -y serve` download per run.
    command: "python3 -m http.server 8080 --bind 127.0.0.1",
    url: "http://127.0.0.1:8080/p/a8f3k2/",
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:8080",
  },
});
