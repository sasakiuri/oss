import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/freezer-stock');
});

test('adds frozen packs, keeps them after reload and takes one out', async ({ page }) => {
  await expect(page).toHaveTitle(/冷凍庫の在庫/);
  await page.getByLabel('部位・品名').fill('ロース');
  await page.getByLabel(/^1 パックの重さ/).fill('500');
  await page.getByLabel(/^パック数/).fill('2');
  await page.getByRole('button', { name: '追加する' }).click();
  await page.reload();
  const list = page.getByRole('region', { name: '冷凍庫の中身' });
  await expect(list).toContainText('2 パック・1 kg');
  await page.getByRole('button', { name: 'シカ・ロース を 1 パック取り出す' }).click();
  await expect(list).toContainText('1 パック・0.5 kg');
});

test('quotes the storage temperature', async ({ page }) => {
  await page.getByRole('button', { name: /^保存温度と出典/ }).click();
  await expect(page.getByText(/摂氏−15度以下で保存すること/)).toBeVisible();
});

test('reflows at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await expect(page.getByRole('button', { name: '追加する' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
