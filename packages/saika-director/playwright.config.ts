// SPDX-License-Identifier: MIT
import { defineConfig } from '@playwright/test';

export default defineConfig({
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  globalTimeout: 600_000,
  retries: process.env.CI === 'true' ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/playwright-junit.xml' }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
});
