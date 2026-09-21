import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { createContentRepository } from '../lib/content/repository';
import type { ContentSummary } from '../lib/content/types';

let articles: ContentSummary[];
test.beforeAll(async () => {
  articles = await createContentRepository(path.join(process.cwd(), 'content')).list('articles');
});

function resultCount(tags: string[] = [], category?: string) {
  const count = articles.filter(
    (article) =>
      (!category || article.frontmatter.category === category) &&
      tags.every((tag) => article.frontmatter.tags.includes(tag)),
  ).length;
  return `${articles.length}件中 ${count}件の記事`;
}

test('category guides connect home, matching articles and breadcrumbs', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: '分野から探す' })
    .getByRole('link', { name: /イントロダクション/ })
    .click();
  await expect(page).toHaveURL(/\/articles\/category\/getting-started\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('猟銃・空気銃の所持許可と狩猟免許の取得ガイド');
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page
    .getByRole('region', { name: /この分野の記事/ })
    .getByRole('link', { name: /^猟銃・空気銃所持許可の新規取得手順/ })
    .click();
  await expect(page).toHaveURL(/\/articles\/1378038316\/$/);
  await page
    .getByRole('navigation', { name: 'パンくずリスト' })
    .getByRole('link', { name: 'イントロダクション' })
    .click();
  await expect(page).toHaveURL(/\/articles\/category\/getting-started\/$/);
});

test('shared category links and existing anchors keep their heading below the header after hydration', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [url, id] of [
    ['/articles/?category=shooting#shooting', 'shooting'],
    ['/articles/?category=resources#resources', 'resources'],
    ['/articles/?category=getting-started#getting-started', 'getting-started'],
    ['/articles/#shooting', 'shooting'],
  ]) {
    await page.goto(url!);
    await expect(page.getByRole('status')).toBeVisible();
    const heading = page.locator(`h2#${id}`);
    await expect(heading).toBeInViewport();
    await expect
      .poll(async () => (await heading.boundingBox())!.y)
      .toBeGreaterThanOrEqual((await page.locator('#site-header').boundingBox())!.height);
  }
  expect(errors).toEqual([]);
});

test('article tags open a filter that can be combined, shared and restored through history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/articles/1378038316/');
  await page.locator('article header').getByRole('link', { name: '#猟銃・空気銃所持許可', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(resultCount(['猟銃・空気銃所持許可']));
  const category = page.getByRole('combobox', { name: 'カテゴリー' });
  await category.selectOption('getting-started');
  await expect(page.getByRole('status')).toHaveText(resultCount(['猟銃・空気銃所持許可'], 'getting-started'));
  await page.getByRole('button', { name: /^#チュートリアル \d+件$/ }).click();
  await expect(page).toHaveURL(/tag=.*tag=/);
  await page.reload();
  await expect(category).toHaveValue('getting-started');
  await expect(page.getByRole('button', { name: /^#チュートリアル \d+件$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'SNSで共有' }).click();
  const shared = new URL(
    (await page.getByRole('link', { name: 'Twitterで共有（新しいタブで開く）' }).getAttribute('href'))!,
  );
  const destination = new URL(shared.searchParams.get('url')!);
  expect(destination.searchParams.get('category')).toBe('getting-started');
  expect(destination.searchParams.getAll('tag')).toEqual(['猟銃・空気銃所持許可', 'チュートリアル']);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '絞り込みを解除' }).click();
  await expect(page.getByRole('status')).toHaveText(resultCount());
  await expect(page).toHaveURL(/\/articles\/$/);
  await page.goBack();
  await expect(page.getByRole('status')).toHaveText(
    resultCount(['猟銃・空気銃所持許可', 'チュートリアル'], 'getting-started'),
  );
  await expect(category).toHaveValue('getting-started');
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('unknown filters have an explicit empty state and a usable reset', async ({ page }) => {
  await page.goto('/articles/?tag=unknown%2B%2F%26&category=missing&source=shared');
  await expect(page.getByRole('status')).toHaveText(`${articles.length}件中 0件の記事`);
  await expect(page.getByText(/条件に一致する記事がありません/)).toBeVisible();
  await expect(page.getByRole('button', { name: '#unknown+/& 0件' })).toBeEnabled();
  await page.getByRole('button', { name: '絞り込みを解除' }).click();
  await expect(page).toHaveURL(/\/articles\/\?source=shared$/);
  await expect(page.getByRole('status')).toHaveText(resultCount());
});

test('related articles exclude the current article and link to real content', async ({ page }) => {
  await page.goto('/articles/1378038316/');
  const related = page.getByRole('complementary', { name: '関連記事' });
  await expect(related.locator('a[href="/articles/1378038316/"]')).toHaveCount(0);
  await related.getByRole('link', { name: '猟銃・空気銃所持許可の更新手順', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('猟銃・空気銃所持許可の更新手順');
});

test('the static directory remains readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3275/articles/');
  await expect(page.getByRole('link', { name: /^猟銃・空気銃所持許可の新規取得手順/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '官公庁・関連団体・メーカー', exact: true })).toHaveCount(1);
  await context.close();
});
