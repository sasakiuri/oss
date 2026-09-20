// @vitest-environment node
import path from 'node:path';

import { expect, it } from 'vitest';

import { articleCategories, getArticleNavigation } from '@/lib/content/navigation';
import { createContentRepository } from '@/lib/content/repository';

it('follows the curated index across categories without linking to the news landing page', () => {
  const first = getArticleNavigation('1378038316');
  expect(first.previous).toBeUndefined();
  expect(first.next?.slug).toBe('articles/1403944258');
  const categoryBoundary = getArticleNavigation('1403944258');
  expect(categoryBoundary.previous?.slug).toBe('articles/1378038316');
  expect(categoryBoundary.next?.slug).toBe('articles/1403250921');
  const last = getArticleNavigation('1418054543');
  expect(last.previous?.slug).toBe('articles/1414030655');
  expect(last.next).toBeUndefined();
  expect(getArticleNavigation('unlisted')).toEqual({});
});

it('keeps each curated article unique and all navigation destinations backed by content', async () => {
  const repository = createContentRepository(path.join(process.cwd(), 'content'));
  const slugs = await repository.listSlugs('articles');
  const links = articleCategories.flatMap((category) => category.articleList).filter((item) => item.slug !== 'news');
  expect(new Set(links.map((item) => item.slug)).size).toBe(links.length);
  for (const link of links) {
    expect(slugs.map((slug) => `articles/${slug}`)).toContain(link.slug);
  }
  const navigation = slugs.map((slug) => ({ slug, ...getArticleNavigation(slug) }));
  for (const { slug, previous } of navigation.filter((item) => item.previous)) {
    expect(getArticleNavigation(previous!.slug.slice('articles/'.length)).next?.slug).toBe(`articles/${slug}`);
  }
  for (const { slug, next } of navigation.filter((item) => item.next)) {
    expect(getArticleNavigation(next!.slug.slice('articles/'.length)).previous?.slug).toBe(`articles/${slug}`);
  }
});
