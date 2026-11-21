import { defineConfig, devices } from "@playwright/test";

// Browser tests (e2e/). `npm run test:e2e` builds the app into .next-e2e, starts it on port
// 3123 and runs the "app" project against recorded chart data. `npm run test:e2e:live` runs a
// few checks against real Yahoo data instead. To test a server that's already running, set
// E2E_BASE_URL (e.g. E2E_BASE_URL=http://localhost:3000) and no server is started.

const PORT = 3123;
const external = process.env.E2E_BASE_URL;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  // The suites walk through whole features, so each test is long
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: CI ? 2 : 3,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "app", testIgnore: /live\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "live", testMatch: /live\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: external
    ? undefined
    : {
        // The old build is removed first: Next's own clean-up fails on OneDrive-synced folders
        command: `node -e "require('fs').rmSync('.next-e2e', { recursive: true, force: true })" && npx next build && npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        env: { NEXT_DIST_DIR: ".next-e2e" },
        // A server left on this port could be an old build, so always start a fresh one
        reuseExistingServer: false,
        timeout: 10 * 60_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
