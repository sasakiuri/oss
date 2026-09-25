import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCount', { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto('/labs/village-check');
});

test('saves an inspection and compares the next one with it', async ({ page }) => {
  await expect(page).toHaveTitle(/集落点検・誘引物チェック/);
  await page.getByLabel('点検日').fill('2026-09-01');
  await page.getByRole('group', { name: '庭の柿の木等の実の放置' }).getByLabel('あり').check();
  await page.getByRole('button', { name: '点検を保存' }).click();
  await expect(page.getByText(/点検を保存しました。/)).toBeVisible();

  await page.getByLabel('点検日').fill('2026-10-01');
  await page.getByRole('group', { name: '庭の柿の木等の実の放置' }).getByLabel('なし').check();
  await expect(page.getByText('前回（2026-09-01）との比較')).toBeVisible();
  await expect(page.getByText('解消')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: /保存した点検/ }).click();
  await expect(page.getByText('2026-09-01', { exact: false }).first()).toBeVisible();
});

test('prints the sheet', async ({ page }) => {
  await page.getByRole('button', { name: '点検表を印刷する' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(1);
  await expect(page.getByTestId('village-check-sheet')).toBeAttached();
});
