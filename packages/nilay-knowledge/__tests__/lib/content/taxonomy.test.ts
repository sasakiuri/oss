import { describe, expect, it } from 'vitest';

import type { ArticleCategoryId } from '@/lib/content/categories';
import {
  articleDirectoryHref,
  createArticleDirectory,
  filterArticles,
  getArticleTags,
  getDirectoryCategories,
  getRelatedArticles,
} from '@/lib/content/taxonomy';
import type { ContentSummary } from '@/lib/content/types';

const summary = (
  slug: string,
  tags: string[],
  type: 'articles' | 'news' = 'articles',
  category?: ArticleCategoryId,
): ContentSummary => ({
  type,
  slug,
  frontmatter: { title: `Title ${slug}`, published: '2024-01-01', tags, category },
});
const content = [
  summary('1403250921', ['許可', '更新'], 'articles', 'procedures'),
  summary('1378038316', ['許可', '入門'], 'articles', 'getting-started'),
  summary('1403944258', ['狩猟', '入門'], 'articles', 'getting-started'),
  summary('new-article', ['入門', '資料']),
  summary('news-item', ['ニュース'], 'news'),
];

describe('article taxonomy', () => {
  it('uses frontmatter for new articles and category changes without editing the reading order', () => {
    const articles = createArticleDirectory([
      summary('1378038316', ['入門'], 'articles', 'shooting'),
      summary('new-guide', ['入門'], 'articles', 'hunting'),
    ]);
    expect(getDirectoryCategories(articles).map((category) => category.id)).toEqual(['hunting', 'shooting']);
    expect(filterArticles(articles, { category: 'shooting', tags: [] }).map((article) => article.slug)).toEqual([
      '1378038316',
    ]);
    expect(filterArticles(articles, { category: 'hunting', tags: [] }).map((article) => article.slug)).toEqual([
      'new-guide',
    ]);
  });
  it('uses actual article metadata in editorial order and includes unclassified articles', () => {
    const articles = createArticleDirectory(content);
    expect(articles.map((article) => article.slug)).toEqual(['1378038316', '1403944258', '1403250921', 'new-article']);
    expect(articles[0]?.frontmatter.title).toBe('Title 1378038316');
    expect(articles[3]?.category).toEqual({ id: 'uncategorized', title: '未分類' });
    expect(content[0]?.slug).toBe('1403250921');
    expect(getDirectoryCategories(articles).map((category) => category.id)).toEqual([
      'getting-started',
      'procedures',
      'uncategorized',
    ]);
    expect(getArticleTags(articles)).not.toContain('ニュース');
    expect(getArticleTags(articles).filter((tag) => tag === '入門')).toHaveLength(1);
  });

  it('intersects categories and every selected tag, including unknown filters', () => {
    const articles = createArticleDirectory(content);
    expect(filterArticles(articles, { category: '', tags: [] })).toHaveLength(4);
    expect(
      filterArticles(articles, { category: 'getting-started', tags: ['許可', '入門'] }).map((article) => article.slug),
    ).toEqual(['1378038316']);
    expect(filterArticles(articles, { category: 'procedures', tags: ['入門'] })).toEqual([]);
    expect(filterArticles(articles, { category: '', tags: ['unknown'] })).toEqual([]);
    expect(filterArticles(articles, { category: 'unknown', tags: [] })).toEqual([]);
    expect(filterArticles(articles, { category: 'uncategorized', tags: [] })).toHaveLength(1);
  });

  it('round-trips Japanese and reserved characters in shared filter URLs', () => {
    const tags = ['日本語', 'C++', 'A/B', 'A&B', 'a,b', '#', '%', '..'];
    const url = new URL(
      articleDirectoryHref({ category: 'getting-started', tags: [...tags, tags[0]!] }),
      'https://example.test',
    );
    expect(url.pathname).toBe('/articles/');
    expect(url.searchParams.get('category')).toBe('getting-started');
    expect(url.searchParams.getAll('tag')).toEqual(tags);
    expect(url.hash).toBe('');
    expect(articleDirectoryHref()).toBe('/articles/');
  });

  it('ranks shared tags before a shared category and excludes unrelated articles and self', () => {
    const articles = createArticleDirectory(content);
    expect(getRelatedArticles(articles, '1378038316').map((article) => article.slug)).toEqual([
      '1403944258',
      '1403250921',
      'new-article',
    ]);
    expect(getRelatedArticles(articles, '1378038316', 1).map((article) => article.slug)).toEqual(['1403944258']);
    expect(getRelatedArticles(articles, 'missing')).toEqual([]);
    expect(getRelatedArticles(createArticleDirectory([summary('one', []), summary('two', [])]), 'one')).toEqual([]);
    expect(getRelatedArticles(articles, '1378038316', 0)).toEqual([]);
  });
});
