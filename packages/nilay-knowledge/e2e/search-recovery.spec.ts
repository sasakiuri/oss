import { expect, test } from '@playwright/test';

const article = {
  id: '/articles/example/#print',
  type: 'articles',
  title: '文書ガイド',
  section: '印刷の準備',
  tags: [],
  text: '印刷する前に確認します。',
};
const pdf = {
  ...article,
  id: '/content/articles/example/file.pdf#page=2',
  type: 'pdf',
  title: 'PDF資料ガイド',
};

test('PDF-only search does not request an unavailable article index', async ({ page, context }) => {
  let articleRequests = 0;
  await context.route('**/search-index.json', async (route) => {
    articleRequests += 1;
    await route.fulfill({ status: 503, body: '' });
  });
  await context.route('**/pdf-search-index.json', async (route) => {
    await route.fulfill({ json: [pdf] });
  });
  await page.goto('/?q=印刷&type=pdf');
  await expect(page.getByRole('option', { name: /PDF資料ガイド/ })).toHaveAttribute(
    'href',
    '/content/articles/example/file.pdf#page=2',
  );
  expect(articleRequests).toBe(0);
});

test('PDF recovery preserves the worker, cache and focus', async ({ page, context }) => {
  let articleRequests = 0;
  let pdfRequests = 0;
  let failPdf = true;
  await context.route('**/search-index.json', async (route) => {
    articleRequests += 1;
    await route.fulfill({ json: [article] });
  });
  await context.route('**/pdf-search-index.json', async (route) => {
    pdfRequests += 1;
    if (failPdf) await route.fulfill({ status: 503, body: '' });
    else await route.fulfill({ json: [pdf] });
  });
  await page.goto('/?q=印刷');
  await expect(page.getByRole('option', { name: /文書ガイド/ })).toBeVisible();
  const workers = page.workers();
  const target = page.getByRole('combobox', { name: '検索対象' });
  await target.selectOption('pdf');
  await expect(page.getByRole('button', { name: '再試行' })).toBeVisible();
  await target.selectOption('all');
  await expect(page.getByRole('option', { name: /文書ガイド/ })).toBeVisible();
  expect(articleRequests).toBe(1);
  expect(page.workers()).toEqual(workers);
  await target.selectOption('pdf');
  await expect(page.getByRole('button', { name: '再試行' })).toBeVisible();
  failPdf = false;
  await page.getByRole('button', { name: '再試行' }).click();
  await expect(page.getByRole('option', { name: /PDF資料ガイド/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '検索キーワード' })).toBeFocused();
  await expect(target).toHaveValue('pdf');
  expect(articleRequests).toBe(1);
  expect(pdfRequests).toBe(3);
  expect(page.workers()).toEqual(workers);
});
