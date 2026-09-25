import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/butchering-guide');
});

test('shows a cut from the chart and the guideline behind a hygiene step', async ({ page }) => {
  await expect(page).toHaveTitle(/部位と解体の手引き/);
  await page.getByRole('button', { name: 'シンタマ' }).click();
  await expect(page.getByRole('heading', { name: 'シンタマ' })).toBeVisible();
  await page.getByText('ガイドライン 第 4 の 5（5）イ').click();
  await expect(page.getByText(/弾丸が通過した部分を含む/)).toBeVisible();
});

test('reads in English and reflows at a narrow viewport', async ({ page }) => {
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Steps and hygiene points' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
