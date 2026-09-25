import { test, expect } from './fixtures';

// The E2E browsers get no sound server, so nothing is heard while the suite runs. Firefox cannot start
// audio without one, so the tools that make sound are checked in Chromium and WebKit.
test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no audio without a sound server');

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/shot-timer');
});

test('runs a par string without the microphone and keeps the settings', async ({ page }) => {
  await expect(page).toHaveTitle(/ショットタイマー/);
  await page.getByLabel('マイクで発砲音を検出する').uncheck();
  await page.getByRole('group', { name: '開始までの時間' }).getByText('固定').click();
  await page.getByLabel('開始までの秒数').fill('0');
  await page.getByLabel('par タイム（空欄でなし）').fill('0.5');
  await page.getByRole('button', { name: 'スタート' }).click();
  await expect(page.getByText('待機中')).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('heading', { name: '直前のストリング' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('par タイム（空欄でなし）')).toHaveValue('0.5');
  await expect(page.getByLabel('マイクで発砲音を検出する')).not.toBeChecked();
});

test('explains what the microphone can and cannot tell apart', async ({ page }) => {
  await page.getByRole('heading', { name: /^注意/ }).getByRole('button').click();
  await expect(page.getByText('隣の射座の発砲や反響も拾い', { exact: false })).toBeVisible();
});
