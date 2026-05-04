import { defineConfig } from "@playwright/test";

/**
 * Live room, private session, and signaling specs assume exclusive fixture state.
 * Run them with `--workers=1` (see docs/production-checklist.md). Default workers>1 is fine for isolated tests.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
