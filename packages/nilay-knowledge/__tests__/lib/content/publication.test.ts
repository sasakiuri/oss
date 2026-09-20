// cspell:ignore parsererror
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { siteConfig } from '@/lib/config';
import { createFeed, createSitemap } from '@/lib/content/publication';
import { createContentRepository } from '@/lib/content/repository';
import type { ContentSource } from '@/lib/content/types';

const older: ContentSource = {
  type: 'articles',
  slug: 'older',
  content: 'An example <with> & text.',
  frontmatter: { title: 'Title <one> & two', published: '2024-01-01', updated: '2024-03-01', tags: [] },
};
const newer: ContentSource = {
  type: 'news',
  slug: 'newer',
  content: 'News text.',
  frontmatter: { title: 'News', published: '2024-02-01', updated: '2024-02-02', tags: [] },
};

function xml(source: string) {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  expect(document.querySelector('parsererror')).toBeNull();
  return document;
}

describe('publication artifacts', () => {
  it('creates valid RSS in publication order while preserving source text', () => {
    const items = [older, newer];
    const document = xml(createFeed(items, new Date('2024-04-01T00:00:00Z')));
    expect([...document.querySelectorAll('item link')].map((node) => node.textContent)).toEqual([
      `${siteConfig.siteUrl}/news/newer/`,
      `${siteConfig.siteUrl}/articles/older/`,
    ]);
    const entry = document.querySelectorAll('item')[1]!;
    expect(entry.querySelector('title')?.textContent).toBe(older.frontmatter.title);
    expect(entry.querySelector('description')?.textContent).toBe(older.content);
    expect(items).toEqual([older, newer]);
  });

  it('uses actual update dates and lists only existing static routes', () => {
    const document = xml(createSitemap([older, newer]));
    const entries = [...document.querySelectorAll('url')];
    expect(entries.map((node) => node.querySelector('loc')?.textContent)).toEqual([
      siteConfig.siteUrl,
      `${siteConfig.siteUrl}/articles/`,
      `${siteConfig.siteUrl}/news/`,
      `${siteConfig.siteUrl}/about/`,
      `${siteConfig.siteUrl}/news/newer/`,
      `${siteConfig.siteUrl}/articles/older/`,
    ]);
    expect(entries.slice(0, 4).every((entry) => !entry.querySelector('lastmod'))).toBe(true);
    expect(entries.slice(4).map((entry) => entry.querySelector('lastmod')?.textContent)).toEqual([
      '2024-02-02',
      '2024-03-01',
    ]);
    const unchanged = xml(createSitemap([{ ...older, frontmatter: { ...older.frontmatter, updated: undefined } }]));
    expect(unchanged.querySelector('lastmod')?.textContent).toBe('2024-01-01');
  });

  it('publishes exactly the repository detail URLs in both artifacts', async () => {
    const repository = createContentRepository(path.join(process.cwd(), 'content'));
    const items = [...(await repository.listSources('articles')), ...(await repository.listSources('news'))];
    expect(items.length).toBeGreaterThan(0);
    const expected = items.map((item) => `${siteConfig.siteUrl}/${item.type}/${item.slug}/`).sort();
    const feed = xml(createFeed(items));
    const sitemap = xml(createSitemap(items));
    expect([...feed.querySelectorAll('item link')].map((node) => node.textContent).sort()).toEqual(expected);
    expect(
      [...sitemap.querySelectorAll('url')]
        .filter((entry) => entry.querySelector('lastmod'))
        .map((entry) => entry.querySelector('loc')?.textContent)
        .sort(),
    ).toEqual(expected);
  });
});
