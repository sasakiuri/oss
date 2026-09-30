import { test, expect } from '@playwright/test';

test('recovers one initial chunk failure before exposing saved inputs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'nilay-labs-unit-converter-v1',
      JSON.stringify({
        version: 0,
        state: {
          settings: {
            quantity: 'pressure',
            entries: {
              pressure: { value: 345, unit: 'bar' },
              torque: { value: 2.5, unit: 'nm' },
              velocity: { value: 800, unit: 'mps' },
              mass: { value: 10, unit: 'g' },
              energy: { value: 3000, unit: 'j' },
              length: { value: 100, unit: 'm' },
              angle: { value: 1, unit: 'moa' },
            },
          },
        },
      }),
    );
  });
  let failures = 0;
  let failedUrl: string | undefined;
  let navigations = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1;
  });
  await page.route('**/_next/static/chunks/*.js', (route) => {
    if (navigations < 2 && (failedUrl === undefined || route.request().url() === failedUrl)) {
      failedUrl = route.request().url();
      failures += 1;
      return route.fulfill({
        status: 503,
        contentType: 'application/javascript',
        headers: { 'cache-control': 'no-store' },
        body: '',
      });
    }
    return route.continue();
  });
  // Raw navigation is intentional: this spec checks both the busy state and its recovery.
  await page.goto('/labs/unit-converter?startup=recovery#saved');
  await expect.poll(() => navigations).toBe(2);
  await expect(page.getByRole('spinbutton', { name: '値' })).toHaveValue('345');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  expect(failures).toBeGreaterThanOrEqual(1);
  expect(navigations).toBe(2);
  await expect(page).toHaveURL(/\/labs\/unit-converter\?startup=recovery#saved$/);
  await expect(page.locator('[data-labs-startup-failure]')).toBeHidden();
});

test('persistent chunk failures stop after one automatic reload and offer a manual retry', async ({ page }) => {
  let navigations = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1;
  });
  await page.route('**/_next/static/chunks/*.js', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/javascript',
      headers: { 'cache-control': 'no-store' },
      body: '',
    }),
  );
  await page.goto('/labs/unit-converter?startup=broken');
  const notice = page.locator('[data-labs-startup-failure]');
  await expect(notice).toBeVisible();
  await expect(page.locator('[data-labs-startup-content]')).toBeHidden();
  expect(navigations).toBe(2);
  await expect(notice.getByRole('button', { name: '再読み込み / Reload' })).toBeEnabled();
  await page.unroute('**/_next/static/chunks/*.js');
  await notice.getByRole('button', { name: '再読み込み / Reload' }).click();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(notice).toBeHidden();
  expect(navigations).toBe(3);
});
