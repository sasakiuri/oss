import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/permit-deadlines');
});

test('works out the permit deadlines and keeps them after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/所持許可・狩猟免許の期限/);
  await page.getByLabel('生年月日').fill('1980-06-10');
  await page.getByLabel('許可を受けた日', { exact: true }).fill('2026-04-01');
  // The third birthday after 1 April 2026 is 10 June 2028; the renewal window is 10 April to 10 May.
  await expect(page.getByText('2028年6月10日', { exact: true })).toBeVisible();
  await expect(page.getByText('2028年4月10日 – 2028年5月10日')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('生年月日')).toHaveValue('1980-06-10');
});

test('ends a hunting licence on 14 September and exports a calendar file', async ({ page }) => {
  await page.getByRole('button', { name: '狩猟免許を追加' }).click();
  await page.getByLabel('試験を受けた日').fill('2026-07-20');
  await expect(page.getByText('2029年9月14日', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'カレンダー（.ics）に書き出す' }).click();
  expect((await download).suggestedFilename()).toMatch(/^permit-deadlines-\d{4}-\d{2}-\d{2}\.ics$/);
});

test('shows when a purpose reaches two years without use', async ({ page }) => {
  await page.getByLabel('狩猟に最後に使った日').fill('2020-01-10');
  await expect(
    page.getByText('すべての用途が条文の期間に達しています。許可の取消しの対象になりえます。'),
  ).toBeVisible();
});
