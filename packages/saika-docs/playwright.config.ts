// SPDX-License-Identifier: MIT
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5178';
const chromiumLaunch = {
  args: process.env.PLAYWRIGHT_DISABLE_SOFTWARE_RASTERIZER === '1' ? ['--disable-software-rasterizer'] : [],
};
const external = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === 'true';

export default defineConfig({
  failOnFlakyTests: Boolean(process.env.CI),
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: [
    ...(process.env.CI ? [['github'] as const] : [['list'] as const]),
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/playwright.xml' }],
  ],
  use: {
    baseURL,
    ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === 'true',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'], launchOptions: chromiumLaunch } },
    {
      name: 'webkit',
      use: { ...devices['iPhone 12'], launchOptions: { executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE } },
      grepInvert: /@visual/,
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grepInvert: /@visual/ },
  ],
  webServer: external
    ? undefined
    : {
        command: 'next start --hostname 127.0.0.1 --port 5178',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120000,
      },
});
