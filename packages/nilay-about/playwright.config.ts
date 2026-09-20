import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  failOnFlakyTests: Boolean(process.env.CI),
  testDir: './__tests__/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3001',
      LOG_MASKING_SECRET: 'nilay-about-local-test-fixture',
      DATABASE_URL: 'postgresql://ci:ci@127.0.0.1:9/nilay_about?connect_timeout=1',
      SLACK_WEBHOOK_URL: 'http://127.0.0.1:9/slack',
      UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:9',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
    timeout: 120 * 1000,
  },
});
