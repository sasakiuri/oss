import { defineConfig, devices } from '@playwright/test';

import { siteConfig } from './lib/config';
import config from './playwright.config';

const target = new URL(process.env.SEO_BASE_URL ?? siteConfig.siteUrl);
if (
  !['http:', 'https:'].includes(target.protocol) ||
  target.username ||
  target.password ||
  target.pathname !== '/' ||
  target.search ||
  target.hash
) {
  throw new Error('SEO_BASE_URL must be an HTTP(S) origin without credentials, a path, query or fragment.');
}

// Read-only GET/HEAD checks against a deployed copy of this checkout. No local server is started.
export default defineConfig({
  ...config,
  testMatch: 'seo.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: { ...config.use, baseURL: target.origin },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: undefined,
});
