import { expect, test } from '@playwright/test';

const pages = Array.from({ length: 500 }, (_, index) => ({
  id: `/content/assets/long.pdf#page=${index + 1}`,
  type: 'pdf',
  title: 'Synthetic long PDF',
  section: `${index + 1}ページ`,
  tags: [],
  text: '申請書の印刷手順',
}));

test('loads a long PDF in bounded batches and reaches every original page without duplicates', async ({ page }) => {
  await page.route('**/pdf-search-index.json', (route) => route.fulfill({ json: pages }));
  await page.goto('/?q=申請&type=pdf');
  const group = page.locator('[data-search-group]');
  await expect(group.locator('a[cmdk-item]')).toHaveCount(1);
  const toggle = group.getByRole('option', { name: /ほか 499 件の一致箇所を表示/ });
  await toggle.click();
  await expect(group.locator('a[cmdk-item]')).toHaveCount(21);
  await expect(page.getByRole('combobox', { name: '検索キーワード' })).toBeFocused();
  let count = 21;
  while (count < 500) {
    await group.getByRole('option', { name: /一致箇所をさらに表示/ }).click();
    count = Math.min(500, count + 20);
    await expect(group.locator('a[cmdk-item]')).toHaveCount(count);
  }
  const destinations = await group
    .locator('a[cmdk-item]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(new Set(destinations).size).toBe(500);
  expect([...destinations].sort()).toEqual(pages.map((entry) => entry.id).sort());
  await group.getByRole('option', { name: /一致箇所を閉じる/ }).click();
  await expect(group.locator('a[cmdk-item]')).toHaveCount(1);
  await group.getByRole('option', { name: /一致箇所を表示/ }).click();
  await expect(group.locator('a[cmdk-item]')).toHaveCount(500);
});

test('ignores an expanded PDF response after a query or target change', async ({ page }) => {
  await page.route('**/pdf-search-index.json', (route) => route.fulfill({ json: pages }));
  await page.goto('/?q=申請&type=pdf');
  await page.getByRole('option', { name: /ほか 499 件の一致箇所を表示/ }).click();
  await page.getByRole('combobox', { name: '検索キーワード' }).fill('存在しない語');
  await expect(page.locator('[data-search-group]')).toHaveCount(0);
  await page.getByRole('combobox', { name: '検索対象' }).selectOption('articles');
  await expect(page.locator('[data-search-group]')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '検索キーワード' })).toBeFocused();
});
