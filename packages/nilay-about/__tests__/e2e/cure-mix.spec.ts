import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/cure-mix');
});

test('weighs out a recipe and keeps it after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/塩漬け・ソーセージの配合計算/);
  await page.getByLabel(/^食塩 \(%\)/).fill('2');
  await expect(page.getByRole('row', { name: /食塩（加える分）/ })).toContainText('20');
  await page.reload();
  await expect(page.getByLabel(/^食塩 \(%\)/)).toHaveValue('2');
});

test('gives the nitrite added without judging it, and cites the standard', async ({ page }) => {
  await page.getByLabel('亜硝酸ナトリウムを含む製剤を使う').check();
  await page.getByLabel(/^製剤の量/).fill('0.25');
  await page.getByLabel(/^製剤の亜硝酸含有率/).fill('6.25');
  await expect(page.getByText(/残存量は検査で確かめます/)).toBeVisible();
  // Scoped: Next.js keeps its route announcer, an empty alert, outside the main content.
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: /^加熱と使用基準/ }).click();
  await expect(page.getByRole('link', { name: /食品、添加物等の規格基準/ }).first()).toBeVisible();
  await expect(page.getByText(/75℃ で 1 分間以上/)).toBeVisible();
});

test('reads in English and reflows at a narrow viewport', async ({ page }) => {
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'What to weigh' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
