import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { articleCategoryHref, getArticleCategoryPages } from '@/lib/content/category-pages';
import { articleReadingOrder } from '@/lib/content/navigation';
import { createSitemap } from '@/lib/content/publication';
import { createContentRepository } from '@/lib/content/repository';
import { createArticleDirectory } from '@/lib/content/taxonomy';
import type { ContentSummary } from '@/lib/content/types';

const summary = (slug: string, category: ContentSummary['frontmatter']['category']): ContentSummary => ({
  type: 'articles',
  slug,
  frontmatter: { title: slug, published: '2024-01-01', tags: [], category, description: `Summary for ${slug}` },
});

describe('category landing pages', () => {
  it('publishes only curated subjects with multiple articles, excluding news and unclassified content', () => {
    const items = [
      summary('one', 'procedures'),
      summary('two', 'procedures'),
      summary('single', 'equipment'),
      summary('unknown-one', undefined),
      summary('unknown-two', undefined),
      { ...summary('news', 'equipment'), type: 'news' as const },
    ];
    const directory = createArticleDirectory(items);
    const pages = getArticleCategoryPages(directory, { published: [] });
    expect(pages.map((page) => page.path)).toEqual(['/articles/category/procedures/']);
    expect(pages[0]?.articles.map((article) => article.slug)).toEqual(['one', 'two']);
    expect(articleCategoryHref(directory, 'procedures')).toBe('/articles/category/procedures/');
    expect(articleCategoryHref(directory, 'equipment')).toBe('/articles/category/equipment/');
    expect(articleCategoryHref(directory, 'uncategorized')).toBe('/articles/?category=uncategorized#uncategorized');
    expect(createSitemap(items)).toContain('/articles/category/procedures/');
    expect(createSitemap(items)).toContain('/articles/category/equipment/');
    expect(getArticleCategoryPages(createArticleDirectory(items.slice(1)), { published: [] })).toEqual([]);
  });

  it('shares editorial descriptions with search snippets and links using current article titles', async () => {
    const repository = createContentRepository(path.join(process.cwd(), 'content'));
    const articles = await repository.list('articles');
    const directory = createArticleDirectory(articles);
    expect(directory.every((article) => article.description === article.frontmatter.description)).toBe(true);
    for (const entry of articleReadingOrder) {
      expect(entry.title).toBe(
        articles.find((article) => `articles/${article.slug}` === entry.slug)?.frontmatter.title,
      );
    }
    const pages = getArticleCategoryPages(directory);
    expect(pages.map((page) => page.id)).toEqual(['getting-started', 'procedures', 'equipment', 'resources']);
    expect(new Set(pages.map((page) => page.description)).size).toBe(pages.length);
  });

  it('prefers an updated content summary over the old reading-order description', () => {
    const article = summary('1378038316', 'getting-started');
    expect(createArticleDirectory([article])[0]?.description).toBe(article.frontmatter.description);
  });
});

describe('published category revision compatibility', () => {
  const initial = [summary('first', 'procedures'), summary('second', 'procedures')];
  const initialPages = getArticleCategoryPages(createArticleDirectory(initial), { published: [] });
  const published = initialPages.map(({ id }) => id);

  it.each([
    ['one article', [initial[0]!], ['first']],
    ['zero articles', [], []],
    ['reclassification', [initial[0]!, summary('second', 'equipment')], ['first']],
  ])('retains the published route with %s', (_case, revision, slugs) => {
    const pages = getArticleCategoryPages(createArticleDirectory(revision), { published });
    expect(pages.map(({ path }) => path)).toEqual(['/articles/category/procedures/']);
    expect(pages[0]?.articles.map(({ slug }) => slug)).toEqual(slugs);
    expect(createSitemap(revision)).toContain('/articles/category/procedures/');
    expect(articleCategoryHref(createArticleDirectory(revision), 'procedures')).toBe('/articles/category/procedures/');
  });

  it('retains a useful route when its editorial introduction is removed', () => {
    const pages = getArticleCategoryPages([], { published, introductions: {} });
    expect(pages[0]).toMatchObject({ id: 'procedures', path: '/articles/category/procedures/', articles: [] });
    expect(pages[0]?.introduction).toContain('すべての記事');
  });

  it('does not publish a category that has never qualified', () => {
    expect(getArticleCategoryPages(createArticleDirectory([summary('one', 'shooting')]), { published })).toHaveLength(
      1,
    );
    expect(articleCategoryHref(createArticleDirectory([summary('one', 'shooting')]), 'shooting')).toBe(
      '/articles/?category=shooting#shooting',
    );
  });
});
