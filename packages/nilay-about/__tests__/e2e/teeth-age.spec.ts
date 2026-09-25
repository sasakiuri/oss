import { test, expect, type Page } from './fixtures';

const choose = (page: Page, group: string | RegExp, option: string | RegExp) =>
  page
    .getByRole('group', { name: group })
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: option }) })
    .click();

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/teeth-age');
});

test('gives a deer age class from the first incisor', async ({ page }) => {
  await expect(page).toHaveTitle(/歯による年齢の目安/);
  await choose(page, /下あごの中央の前歯/, '永久歯');
  await choose(page, /第一切歯の摩滅/, /^IV：/);
  await expect(page.getByRole('region', { name: '年齢の目安' })).toContainText('6 歳以上');
});

test('gives a wild boar age class from the molars and cites the study', async ({ page }) => {
  await choose(page, '動物', 'イノシシ');
  await choose(page, /第三後臼歯/, '第 1・第 2 咬頭まで出ている');
  await expect(page.getByRole('region', { name: '年齢の目安' })).toContainText('1 歳（秋〜冬）〜2 歳');
  await page.getByRole('button', { name: /^出典/ }).click();
  await expect(page.getByRole('link', { name: /ニホンイノシシの年齢査定方法/ })).toBeVisible();
});

test('reflows at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
