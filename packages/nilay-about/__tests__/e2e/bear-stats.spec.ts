import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/bear-stats');
});

test('shows the national injuries of the last whole year and keeps the choices after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/クマの出没・被害統計/);
  // injury-qe.pdf 計 R07: 216 件.
  await expect(page.getByText('令和7年度・全国・被害件数')).toBeVisible();
  await expect(page.getByText('内訳：ツキノワグマ 211・ヒグマ 5')).toBeVisible();
  await expect(page.getByRole('img', { name: /年度別の棒グラフ/ })).toBeVisible();
  await page.getByRole('group', { name: '統計' }).getByText('捕獲数', { exact: true }).click();
  await page.getByLabel('地域').selectOption('akita');
  // capture-qe.pdf 秋田 R07: 2,691 頭.
  await expect(page.getByText('令和7年度・秋田県・捕獲数（計）').locator('..')).toContainText('2,691');
  await page.reload();
  await expect(page.getByLabel('地域')).toHaveValue('akita');
  // Exact: the measure group offers 「捕獲数（計）」, a different control whose name contains this one.
  await expect(page.getByRole('radio', { name: '捕獲数', exact: true })).toBeChecked();
});

test('sets a part year against the same months of the year before', async ({ page }) => {
  await page.getByRole('group', { name: '統計' }).getByText('出没件数', { exact: true }).click();
  // Exact: the charts and tables below are named 「…年度別の…」, which a partial match would also take.
  await page.getByLabel('年度', { exact: true }).selectOption('2026');
  await expect(page.getByText('年度途中（7月分まで）', { exact: false })).toBeVisible();
  await expect(page.getByText('前年度の同じ期間（4月〜7月）').locator('..')).toContainText('12,716');
  await page.getByText('月別の表', { exact: true }).click();
  const monthly = page.getByRole('table', { name: /月別/ });
  await expect(monthly.getByRole('row', { name: /^8月/ })).toContainText('未集計');
});

test('lists emergency shootings with wild boar kept apart', async ({ page }) => {
  await page.getByRole('group', { name: '統計' }).getByText('緊急銃猟', { exact: true }).click();
  await expect(page.getByText('同じ資料のイノシシ 3 件は含みません', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /緊急銃猟の事例一覧/ }).click();
  await expect(page.getByRole('table', { name: /発砲まで至った緊急銃猟の事例/ }).getByRole('row')).toHaveCount(61);
});

test('shows the sources with the date they were read', async ({ page }) => {
  await page.getByRole('button', { name: /出典/ }).click();
  await expect(page.getByRole('link', { name: 'クマ類による人身被害について［速報値］' })).toHaveAttribute(
    'href',
    'https://www.env.go.jp/nature/choju/effort/effort12/injury-qe.pdf',
  );
  await expect(page.getByRole('button', { name: /出典/ })).toContainText('2026-09-23 確認');
});

test('fits a phone without scrolling the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();
  await expect(page.getByLabel('地域')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
