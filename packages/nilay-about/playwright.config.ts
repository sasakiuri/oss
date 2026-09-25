import { defineConfig, devices } from '@playwright/test';

// Several tools make sound (the bear bell, the shot timer, the match commands read aloud). The browsers
// are given a sound server that does not exist, so a run is silent in every engine.
const silent = { env: { ...process.env, PULSE_SERVER: 'unix:/nonexistent/nilay-e2e-silent' } };
const silentChromium = { ...silent, args: ['--mute-audio'] };

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
    // Requests from a page the Labs service worker controls skip page.route in WebKit, so a spec that
    // stands in for an API would reach the real server once the worker took over. The offline spec,
    // which is about the worker, turns it back on.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: silentChromium },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], launchOptions: silent },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], launchOptions: silent },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'], launchOptions: silentChromium },
    },
  ],
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3001',
      LOG_MASKING_SECRET: 'nilay-about-local-test-fixture',
      MICROCMS_SERVICE_DOMAIN: '',
      MICROCMS_API_KEY: '',
      SLACK_WEBHOOK_URL: 'http://127.0.0.1:9/slack',
      UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:9',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
    timeout: 120 * 1000,
  },
});
