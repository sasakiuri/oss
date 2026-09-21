// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createContentRepository } from '@/lib/content/repository';
import { parseArticleOptions } from '@/scripts/article-options';
import { formatTaxonomyReport } from '@/scripts/article-taxonomy';

describe('article classification management', () => {
  it('parses repeated tags and quoted titles without splitting punctuation', () => {
    expect(parseArticleOptions(['申請の手順', '--category', 'procedures', '--tag', 'A/B', '--tag', 'a,b'])).toEqual({
      title: '申請の手順',
      category: 'procedures',
      tags: ['A/B', 'a,b'],
      help: false,
    });
    expect(parseArticleOptions(['--help']).help).toBe(true);
  });

  it.each([['--unknown'], ['--category'], ['one', 'two']])('rejects malformed arguments %j', (...args) => {
    expect(() => parseArticleOptions(args)).toThrow();
  });

  it('reports usage and unclassified or untagged articles without counting news', () => {
    const report = formatTaxonomyReport([
      {
        type: 'articles',
        slug: 'guide',
        frontmatter: { title: '案内', published: '2024-01-01', category: 'procedures', tags: ['手続き'] },
      },
      { type: 'articles', slug: 'draft', frontmatter: { title: '未整理', published: '2024-01-01', tags: [] } },
      { type: 'news', slug: 'news', frontmatter: { title: 'ニュース', published: '2024-01-01', tags: ['手続き'] } },
    ]);
    expect(report).toContain('記事: 2件');
    expect(report).toContain('procedures / 制度と法令 / 1件');
    expect(report).toContain('手続き / 1件');
    expect(report).toContain('未分類の記事: 1件\n  draft: 未整理');
    expect(report).toContain('タグなしの記事: 1件\n  draft: 未整理');
  });

  it('keeps authored articles and their published copies synchronized', async () => {
    const repository = createContentRepository(path.join(process.cwd(), 'content'));
    const articles = await repository.list('articles');
    expect(articles.length).toBeGreaterThan(0);
    for (const article of articles) {
      const relative = `articles/${article.slug}/index.md`;
      const [source, published] = await Promise.all(
        ['content', 'public/content'].map((root) => readFile(path.join(process.cwd(), root, relative), 'utf8')),
      );
      expect(source).toBe(published);
    }
  });
});
