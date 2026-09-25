import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCount', { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto('/labs/trace-gauge');
});

test('prints the chosen gauges and keeps the choice', async ({ page }) => {
  await expect(page).toHaveTitle(/足跡・糞の実寸ゲージ/);
  await page.getByRole('button', { name: 'すべて外す' }).click();
  await expect(page.getByText('ゲージを選んでください。')).toBeVisible();
  await page.getByLabel(/ツキノワグマ：後足（平均）/).check();
  await expect(page.getByRole('img', { name: '1 ページ目のプレビュー' })).toContainText('15.1×8.5 cm');
  await page.getByRole('button', { name: '印刷する' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(1);
  await page.reload();
  await expect(page.getByLabel(/ツキノワグマ：後足（平均）/)).toBeChecked();
  await expect(page.getByLabel(/タヌキ：前後とも/)).not.toBeChecked();
});
