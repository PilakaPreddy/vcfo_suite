import { defineConfig, devices } from "@playwright/test";

// The login helper reads DATABASE_URL, and a machine with no local env file simply goes without it.
try {
  process.loadEnvFile(".env.local");
} catch {}

// A worktree on its own port sets PLAYWRIGHT_BASE_URL, and the server check follows it.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Tests tagged @mobile run only in the phone project.
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/, testIgnore: "**/uat/**" },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/, testIgnore: "**/uat/**" },
    // The user acceptance run (docs/specs/uat/TEST-PLAN.md): one worker, in plan order, against a
    // production build started with `next start`. Run with `--project=uat`.
    {
      name: "uat",
      testDir: "./e2e/uat",
      fullyParallel: false,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        trace: "off",
        actionTimeout: 20_000,
        navigationTimeout: 45_000,
        // A machine whose browser build differs from the pinned Playwright points UAT_CHROMIUM at its own.
        launchOptions: process.env.UAT_CHROMIUM ? { executablePath: process.env.UAT_CHROMIUM } : {},
      },
      timeout: 15 * 60_000,
      expect: { timeout: 15_000 },
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${new URL(baseURL).port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // Ask VCFO is on for browser tests. Suggestions are deterministic, so no
    // API key is needed; an already-running dev server keeps its own env.
    env: { ASK_VCFO_ENABLED: "true" },
  },
});
