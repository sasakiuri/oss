import { test, expect } from './fixtures';

// Written out rather than imported: this spec checks what the browser actually holds.
const STORAGE_KEY = 'nilay-labs-bear-bell-v1';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/bear-bell');
});

test('rings from the press and stops', async ({ page, browserName }) => {
  // Firefox cannot start audio without a sound server; some WebKit builds expose no Web Audio API.
  test.skip(browserName === 'firefox', 'Firefox has no audio without a sound server');
  const hasAudio = await page.evaluate(
    () => typeof window.AudioContext === 'function' || typeof Reflect.get(window, 'webkitAudioContext') === 'function',
  );
  test.skip(!hasAudio, 'This browser build does not expose Web Audio');
  await expect(page).toHaveTitle(/熊鈴と遭遇時の備え/);
  await page.getByRole('button', { name: '鳴らす', exact: true }).click();
  await expect(page.getByText(/鳴らしています（約 3 秒ごと）/).first()).toBeVisible();
  await page.getByRole('button', { name: '止める' }).click();
  await expect(page.getByText('止まっています。').first()).toBeVisible();
  await expect(page.getByText(/iPhone・iPad の Safari では止まります/)).toBeVisible();
});

test('explains unavailable Web Audio and stays stopped', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
  });
  await page.reload();
  await page.getByRole('button', { name: '鳴らす', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Web Audio' })).toHaveText(
    'このブラウザーでは音を鳴らせません（Web Audio 非対応）。',
  );
  await expect(page.getByText('止まっています。').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '止める', exact: true })).toHaveCount(0);
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
