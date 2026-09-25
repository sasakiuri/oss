import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/hunting-seasons');
});

test('says a prefecture has not been collected and links to its page', async ({ page }) => {
  await expect(page).toHaveTitle(/猟期と捕獲数制限の早見表/);
  await page.getByLabel('都道府県').selectOption('北海道');
  await expect(page.getByText(/この県の延長・制限は未収録です。/)).toBeVisible();
  await expect(page.getByRole('link', { name: /北海道の狩猟に関するページ/ })).toBeVisible();
});

test('places a day after 15 February in the Tokyo deer extension and keeps the prefecture', async ({ page }) => {
  await page.getByLabel('都道府県').selectOption('東京都');
  await page.getByLabel('日付').fill('2027-02-20');
  await expect(page.getByText(/^法定の狩猟期間外ですが、県の延長の期間内です/)).toBeVisible();
  await expect(page.getByText('この日は期間内').first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('都道府県')).toHaveValue('東京都');
});

test('exports the season as a calendar file', async ({ page }) => {
  await page.getByLabel('都道府県').selectOption('長野県');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /年度の猟期をカレンダー（\.ics）に書き出す/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^hunting-season-\d{4}-長野県\.ics$/);
});
