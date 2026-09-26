import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: true,
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Keep large document diffs out of reports and avoid fetch/diff work during CI startup.
  captureGitInfo: { diff: false },
  use: {
    baseURL: 'http://127.0.0.1:3275',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      // Leave room for Windows Firefox startup without changing assertion deadlines.
      timeout: process.platform === 'win32' ? 60_000 : 30_000,
      use: { ...devices['Desktop Firefox'] },
    },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 568 } } },
  ],
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3275',
    url: 'http://127.0.0.1:3275',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
