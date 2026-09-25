import { test, expect } from './fixtures';

// The E2E browsers get no sound server, so nothing is heard while the suite runs. Firefox cannot start
// audio without one, so the tools that make sound are checked in Chromium and WebKit.
test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no audio without a sound server');

// Written out rather than imported: this spec checks what the browser actually holds.
const STORAGE_KEY = 'nilay-labs-bear-bell-v1';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/bear-bell');
});

test('rings from the press and stops', async ({ page }) => {
  await expect(page).toHaveTitle(/熊鈴と遭遇時の備え/);
  await page.getByRole('button', { name: '鳴らす', exact: true }).click();
  await expect(page.getByText(/鳴らしています（約 3 秒ごと）/).first()).toBeVisible();
  await page.getByRole('button', { name: '止める' }).click();
  await expect(page.getByText('止まっています。').first()).toBeVisible();
  await expect(page.getByText(/iPhone・iPad の Safari では止まります/)).toBeVisible();
});

test('keeps the pre-trip ticks across a reload', async ({ page }) => {
  await page.getByLabel('1 人で入らない。同行者と離れない').check();
  await page.reload();
  await expect(page.getByLabel('1 人で入らない。同行者と離れない')).toBeChecked();
  const saved = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  expect(JSON.parse(saved ?? 'null').state.settings.checked).toEqual(['company']);
});

test('shows the encounter guide with the ministry’s words', async ({ page }) => {
  await page.getByRole('button', { name: /遭遇したときの行動/ }).click();
  await expect(page.getByRole('heading', { name: '近くにクマがいる・こちらに気づいた' })).toBeVisible();
  await expect(page.getByText(/慌てて走って逃げてはいけません。/)).toBeVisible();
});

test('is reached from the bear statistics', async ({ page }) => {
  await page.goto('/labs/bear-stats');
  await page
    .getByRole('link', { name: /熊鈴と遭遇時の備え/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/labs\/bear-bell$/);
});
