// SPDX-License-Identifier: MIT
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.NILAY_BROWSER_PORT ?? 4179);
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.CI
        ? undefined
        : process.env.NILAY_BROWSER_EXECUTABLE,
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "narrow-chromium", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "node tests/browser/server.ts",
    url: `${origin}/__test/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
