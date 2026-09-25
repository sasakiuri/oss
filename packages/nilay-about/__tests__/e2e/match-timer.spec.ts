import { test, expect } from './fixtures';

// The E2E browsers get no sound server, so nothing is heard while the suite runs. Firefox cannot start
// audio without one, so the tools that make sound are checked in Chromium and WebKit.
test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no audio without a sound server');

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/match-timer');
});

test('starts the qualification clock, skips to the next command and keeps the event', async ({ page }) => {
  await expect(page).toHaveTitle(/競技の号令タイマー/);
  await page.getByRole('group', { name: '号令の読み上げ' }).getByText('音だけ').click();
  await page.getByRole('button', { name: 'スタート' }).click();
  await expect(page.getByText('PREPARATION AND SIGHTING TIME … START（準備・試射時間…開始）').first()).toBeVisible();
  await page.getByRole('button', { name: '次の号令へ進む' }).click();
  await expect(page.getByRole('status').filter({ hasText: '30 SECONDS' })).toBeVisible();
  await page.getByRole('button', { name: '一時停止' }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByLabel('種目').selectOption('air-final');
  await expect(page.getByText('TAKE YOUR POSITIONS（位置につけ）')).toBeAttached();
  await page.reload();
  await expect(page.getByLabel('種目')).toHaveValue('air-final');
});

test('says which wordings are not in the rules', async ({ page }) => {
  await page
    .getByRole('heading', { name: /^号令の一覧/ })
    .getByRole('button')
    .click();
  await expect(page.getByText('（規則に文言なし）', { exact: false })).toHaveCount(2);
});
