import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/course-schedules');
});

test('links to the Tokyo schedule pages and marks a prefecture not collected', async ({ page }) => {
  await expect(page).toHaveTitle(/講習会・試験の日程リンク集/);
  await page.getByLabel('住所地の都道府県').selectOption('東京都');
  await expect(page.getByRole('link', { name: /技能講習の日程/ }).first()).toHaveAttribute('href', /keishicho/);
  await page.getByLabel('住所地の都道府県').selectOption('沖縄県');
  await expect(page.getByText('この都道府県のページは未収録です。', { exact: false })).toBeVisible();
});

test('exports the dates entered and keeps them after reload', async ({ page }) => {
  await page.getByRole('button', { name: '予定を追加' }).click();
  await page.getByLabel('日付（開始日）').fill('2026-12-02');
  await page.reload();
  await expect(page.getByLabel('日付（開始日）')).toHaveValue('2026-12-02');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'カレンダー（.ics）に書き出す' }).click();
  expect((await download).suggestedFilename()).toMatch(/^course-schedules-\d{4}-\d{2}-\d{2}\.ics$/);
});
