import { test, expect, type Page } from './fixtures';

// Service workers are driven the same way in every engine, but Playwright only reports and routes
// through them reliably in Chromium, so the offline run is checked there.
test.skip(({ browserName }) => browserName !== 'chromium', 'Service worker support is exercised in Chromium');
test.use({ serviceWorkers: 'allow' });

/** Waits until the Labs service worker is installed, activated and in charge of this page. */
async function waitForOfflineSupport(page: Page) {
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/labs');
    return registration?.active?.state === 'activated' && navigator.serviceWorker.controller !== null;
  });
}

/** Waits until the page open now is kept for offline use: the page asks for it once the worker is in charge. */
async function waitUntilKept(page: Page) {
  await page.waitForFunction(async () => Boolean(await caches.match(location.pathname, { ignoreSearch: true })));
}

test('opens the list and a tool opened before without a connection, with the saved inputs', async ({
  page,
  context,
}) => {
  await page.goto('/labs');
  await waitForOfflineSupport(page);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/labs'))?.scope)).toMatch(
    /\/labs$/,
  );

  await page.goto('/labs/twist-stability');
  await waitUntilKept(page);
  await page.getByRole('spinbutton', { name: /ツイスト/ }).fill('9');
  await expect(
    page.getByText('ジャイロ安定係数 Sg', { exact: true }).locator('xpath=following-sibling::p[1]'),
  ).toContainText('2.97');

  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveTitle(/ツイストと安定性の計算/);
  await expect(page.getByRole('spinbutton', { name: /ツイスト/ })).toHaveValue('9');
  await expect(
    page.getByText('ジャイロ安定係数 Sg', { exact: true }).locator('xpath=following-sibling::p[1]'),
  ).toContainText('2.97');

  // The way back to the list works offline too.
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '狩猟・射撃のツール (Labs)' })).toBeVisible();
  await context.setOffline(false);
});

test('never answers the API from the cache', async ({ page, context }) => {
  await page.goto('/labs/home-target');
  await waitForOfflineSupport(page);
  await context.setOffline(true);
  const status = await page.evaluate(() =>
    fetch('/api/home-targets', { method: 'POST', body: '{}' }).then(
      (response) => response.status,
      () => 'failed',
    ),
  );
  expect(status).toBe('failed');
  await context.setOffline(false);
});
