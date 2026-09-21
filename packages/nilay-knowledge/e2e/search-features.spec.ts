import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('shared search conditions restore on reload and preserve unrelated query parameters', async ({ page }) => {
  await page.goto('/?q=申請&type=articles&source=shared');
  const dialog = page.getByRole('dialog', { name: '記事・ニュースを検索' });
  const input = dialog.getByRole('combobox', { name: '検索キーワード' });
  await expect(input).toHaveValue('申請');
  await expect(dialog.getByRole('combobox', { name: '検索対象' })).toHaveValue('articles');
  const options = dialog.getByRole('listbox').getByRole('option');
  await expect(options.first()).toBeVisible();
  expect(
    await options.evaluateAll((items) => items.every((item) => item.getAttribute('href')?.startsWith('/articles/'))),
  ).toBe(true);
  await input.fill('所持許可');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('所持許可');
  expect(new URL(page.url()).searchParams.get('source')).toBe('shared');
  await page.reload();
  await expect(input).toHaveValue('所持許可');
  await expect(options.first()).toBeVisible();
  await expect(dialog.locator('mark').first()).toBeVisible();
});

test('command navigation respects composition and opens the selected section', async ({ page }) => {
  await page.goto('/?q=申請&type=articles');
  const dialog = page.getByRole('dialog');
  const input = dialog.getByRole('combobox', { name: '検索キーワード' });
  const options = dialog.getByRole('listbox').getByRole('option');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
  await expect(dialog).toBeVisible();
  await options.first().focus();
  await options.first().press('ArrowDown');
  await expect(input).toBeFocused();
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  const href = await options.nth(1).getAttribute('href');
  await input.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).hash).toBe(href);
  const targetId = new URL(href!, 'http://localhost').hash.slice(1);
  if (targetId) await expect(page.locator(`[id=${JSON.stringify(decodeURIComponent(targetId))}]`)).toBeFocused();
});

test('PDF search downloads a separate index only when requested and links to the matching page', async ({
  page,
  request,
}) => {
  const downloads: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/pdf-search-index.json') downloads.push(request.url());
  });
  await page.goto('/?q=銃砲所持許可申請書');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('status')).toContainText('件の検索結果');
  expect(downloads).toHaveLength(0);
  await dialog.getByRole('combobox', { name: '検索対象' }).selectOption('pdf');
  const result = dialog.getByRole('listbox').getByRole('option').first();
  await expect(result).toBeVisible({ timeout: 20_000 });
  const href = await result.getAttribute('href');
  expect(href).toMatch(/^\/content\/.*\.pdf#page=[1-9]\d*$/);
  const response = await request.get(href!.split('#')[0]!);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('application/pdf');
  await expect(dialog.locator('mark').first()).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(audit.violations).toEqual([]);
  await dialog.getByRole('combobox', { name: '検索対象' }).selectOption('articles');
  await dialog.getByRole('combobox', { name: '検索対象' }).selectOption('pdf');
  await expect(result).toBeVisible();
  expect(downloads).toHaveLength(1);
});

test('Control+Enter opens a search result in a new tab and keeps the search dialog', async ({ page }) => {
  await page.goto('/?q=申請&type=articles');
  const dialog = page.getByRole('dialog');
  const input = dialog.getByRole('combobox', { name: '検索キーワード' });
  const result = dialog.getByRole('listbox').getByRole('option').first();
  await expect(result).toHaveAttribute('aria-selected', 'true');
  const href = await result.getAttribute('href');
  // Chromium may create a modifier-opened tab without an opener reference.
  const popupPromise = page.context().waitForEvent('page');
  await input.press('Control+Enter');
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(new URL(popup.url()).pathname + new URL(popup.url()).hash).toBe(href);
  await expect(dialog).toBeVisible();
  await popup.close();
});
