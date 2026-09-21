import { expect, test } from '@playwright/test';

import { createContentRepository } from '../lib/content/repository';
import { formatDate } from '../lib/utils';

test.use({ javaScriptEnabled: false });

test('article review evidence is visible without JavaScript and remains separate from publication metadata', async ({
  page,
}) => {
  const repository = createContentRepository(`${process.cwd()}/content`);
  const sources = await repository.list('articles');
  const reviewed = sources.filter((source) => source.frontmatter.review);
  expect(reviewed.length).toBeGreaterThan(0);
  for (const source of reviewed) {
    const { review } = source.frontmatter;
    await page.goto(`/articles/${source.slug}/`);
    const record = page.getByRole('complementary', { name: '情報の確認記録' });
    await expect(record).toBeVisible();
    await expect(record.locator('time')).toHaveAttribute('datetime', review!.checked);
    await expect(record.locator('time')).toHaveText(formatDate(review!.checked));
    await expect(record).toContainText(review!.region);
    await expect(record).toContainText(review!.scope);
    for (const evidence of review!.sources) {
      await expect(record.getByRole('link', { name: evidence.title, exact: true })).toHaveAttribute(
        'href',
        evidence.url,
      );
    }
    await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute(
      'content',
      source.frontmatter.published,
    );
    await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute(
      'content',
      source.frontmatter.updated ?? source.frontmatter.published,
    );
  }
});

test('articles without review evidence do not imply a recent verification', async ({ page }) => {
  const repository = createContentRepository(`${process.cwd()}/content`);
  const source = (await repository.list('articles')).find((article) => !article.frontmatter.review)!;
  await page.goto(`/articles/${source.slug}/`);
  await expect(page.getByText('情報の最終確認日：未記録', { exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '情報の確認記録' })).toHaveCount(0);
});
