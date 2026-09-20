import { test, expect } from '@playwright/test';

test('renders the news list and sanitized detail after loading', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const news = {
    id: 'migration-fixture',
    title: 'Migration fixture news',
    date: '2026-01-01T00:00:00.000Z',
    summary: '<p>Imported news content</p><script>window.untrustedNews = true</script>',
  };

  // Keep browser verification independent of any PostgreSQL service.
  await page.route('**/api/news', (route) => route.fulfill({ json: { newsList: [news] } }));
  await page.route('**/api/news/migration-fixture', (route) => route.fulfill({ json: { news } }));
  await page.goto('/news');
  await page.getByRole('link', { name: news.title }).click();
  await expect(page.getByRole('main').getByRole('heading', { name: news.title })).toBeVisible();
  await expect(page.locator('article').getByText('Imported news content', { exact: true })).toBeVisible();
  await expect(page.locator('article script')).toHaveCount(0);
  expect(errors).toEqual([]);
});
