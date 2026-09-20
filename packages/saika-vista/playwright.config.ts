// SPDX-License-Identifier: MIT
import { defineConfig } from '@playwright/test';

export default defineConfig({
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
