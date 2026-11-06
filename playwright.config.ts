import { defineConfig, devices } from "@playwright/test";

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
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
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
