import { defineConfig, devices } from "@playwright/test";

// Real-screen end-to-end test of the Maria demo (tests/e2e). Runs against
// production by default; E2E_BASE_URL=http://localhost:3000 for local.
// It resets the shared demo data (the team has agreed to resets).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 6 * 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "tests/e2e/report", open: "never" }]],
  outputDir: "tests/e2e/results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://echo-by-relay.vercel.app",
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: "on",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
