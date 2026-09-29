import { expect, test } from '@playwright/test';

const pdf = {
  id: '/content/articles/example/file.pdf#page=2',
  type: 'pdf',
  title: 'PDF資料ガイド',
  section: '印刷の準備',
  tags: [],
  text: '印刷する前に確認します。',
};

test('static search outputs keep their arrays and compatibility metadata', async ({ request }) => {
  for (const path of ['/search-index.json', '/pdf-search-index.json']) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()['x-nilay-search-format']).toBe('1');
    expect(response.headers()['x-nilay-search-revision']).toMatch(/^[a-f0-9]{64}$/);
    expect(Array.isArray(await response.json())).toBe(true);
  }
});

test('refresh preserves the query, target and fragment', async ({ page, context }) => {
  let incompatible = true;
  await context.route('**/pdf-search-index.json', async (route) => {
    await route.fulfill({ json: [pdf], headers: { 'x-nilay-search-format': incompatible ? '2' : '1' } });
  });
  await page.goto('/?q=印刷&type=pdf#search-fixture');
  await expect(page.getByRole('button', { name: 'ページを更新' })).toBeVisible();
  await expect(page.getByRole('button', { name: '再試行' })).toHaveCount(0);
  const oldWorkers = page.workers();
  await page.getByRole('combobox', { name: '検索キーワード' }).fill('印刷 確認');
  await expect(page.getByRole('button', { name: 'ページを更新' })).toBeVisible();
  incompatible = false;
  const navigation = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
  await page.getByRole('button', { name: 'ページを更新' }).click();
  await navigation;
  await expect(page.getByRole('option', { name: /PDF資料ガイド/ })).toHaveAttribute('href', pdf.id);
  await expect(page.getByRole('combobox', { name: '検索キーワード' })).toHaveValue('印刷 確認');
  await expect(page.getByRole('combobox', { name: '検索対象' })).toHaveValue('pdf');
  const url = new URL(page.url());
  expect(url.searchParams.get('q')).toBe('印刷 確認');
  expect(url.searchParams.get('type')).toBe('pdf');
  expect(url.hash).toBe('#search-fixture');
  expect(page.workers().some((worker) => !oldWorkers.includes(worker))).toBe(true);
});
