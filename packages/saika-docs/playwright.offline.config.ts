// SPDX-License-Identifier: MIT
import { defineConfig } from '@playwright/test';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export default defineConfig({
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  testDir: './tests/offline',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5184',
    launchOptions: {
      args: process.env.PLAYWRIGHT_DISABLE_SOFTWARE_RASTERIZER === '1' ? ['--disable-software-rasterizer'] : [],
    },
  },
  webServer: {
    command: 'node scripts/serve-static.mjs',
    url: `http://127.0.0.1:5184${basePath}/`,
    reuseExistingServer: false,
  },
});
