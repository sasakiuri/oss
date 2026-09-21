import { test, expect } from '@playwright/test';

test('renders the news list and sanitized detail after loading', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const news = {
    id: 'migration-fixture',
    title: 'Migration fixture news',
    date: '2026-01-01T00:00:00.000Z',
    summary:
      '<p>Imported news content</p><img src="https://images.microcms-assets.io/assets/fixture/photo.jpg" alt="News photo" width="800" height="600" onerror="window.untrustedNews = true"><script>window.untrustedNews = true</script>',
  };

  // Keep browser verification independent of microCMS.
  await page.route('https://images.microcms-assets.io/assets/fixture/photo.jpg', (route) =>
    route.fulfill({ path: 'public/images/game-species/004_001.jpg', contentType: 'image/jpeg' }),
  );
  await page.route('**/api/news', (route) => route.fulfill({ json: { newsList: [news] } }));
  await page.route('**/api/news/migration-fixture', (route) => route.fulfill({ json: { news } }));
  await page.goto('/news');
  await page.getByRole('link', { name: news.title }).click();
  await expect(page.getByRole('main').getByRole('heading', { name: news.title })).toBeVisible();
  await expect(page.locator('article').getByText('Imported news content', { exact: true })).toBeVisible();
  await expect(page.locator('article script')).toHaveCount(0);
  const image = page.getByRole('img', { name: 'News photo' });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(image).not.toHaveAttribute('onerror');
  expect(
    await image.evaluate(
      (element) => element.getBoundingClientRect().width <= element.parentElement!.getBoundingClientRect().width,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
