import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lawQuestions } from '@/app/(standalone)/labs/law-quiz/questions';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { labsCategories, labsTools } from '@/lib/labs-tools';
import { GAME_SPECIES } from '@/lib/schemas/hunting-log';
import { labsToolJsonLd, labsToolMetadata, pageMetadata } from '@/lib/seo';

const toolDirectories = readdirSync(join(__dirname, '../../../app/(standalone)/labs'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('the Labs registry', () => {
  it('lists every tool that has a page, and no other', () => {
    expect(labsTools.map((tool) => tool.slug).sort()).toEqual(toolDirectories);
  });

  it('puts every tool in a category that exists', () => {
    const categories = new Set(labsCategories.map((category) => category.id));
    for (const tool of labsTools) expect(categories.has(tool.category)).toBe(true);
  });

  it('keeps each description to what a search result shows', () => {
    const outside = labsTools.filter((tool) => tool.description.length < 50 || tool.description.length > 130);
    expect(outside.map((tool) => tool.slug)).toEqual([]);
  });

  it('quotes the number of questions and species the tools really hold', () => {
    const text = (slug: string) => JSON.stringify(labsTools.find((tool) => tool.slug === slug));
    expect(text('law-quiz')).toContain(`${lawQuestions.length} 問`);
    expect(text('game-species-test')).toContain(`${GAME_SPECIES.length} 種`);
  });

  it('gives every tool its own title', () => {
    expect(new Set(labsTools.map((tool) => tool.title.ja)).size).toBe(labsTools.length);
  });
});

describe('page metadata', () => {
  it('points the canonical URL, Open Graph and the card at the page itself', () => {
    const metadata = labsToolMetadata('trajectory');
    expect(metadata.title).toBe('弾道計算とゼロイン');
    expect(metadata.alternates?.canonical).toBe('/labs/trajectory');
    expect(metadata.openGraph).toMatchObject({ url: '/labs/trajectory', title: '弾道計算とゼロイン | Nilay/About' });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: '弾道計算とゼロイン | Nilay/About',
    });
  });

  it('marks a news article as an article with its date', () => {
    const metadata = pageMetadata({
      title: 'x',
      description: 'y',
      path: '/news/a',
      type: 'article',
      publishedTime: '2026-01-01T00:00:00.000Z',
    });
    expect(metadata.openGraph).toMatchObject({ type: 'article', publishedTime: '2026-01-01T00:00:00.000Z' });
  });

  it('describes a tool as a free web application with its breadcrumb', () => {
    const [application, breadcrumb] = labsToolJsonLd('law-quiz')['@graph'] as [
      object,
      { itemListElement: { item: string }[] },
    ];
    expect(application).toMatchObject({
      '@type': 'WebApplication',
      url: 'https://about.nilay.jp/labs/law-quiz',
      inLanguage: 'ja',
      isAccessibleForFree: true,
    });
    expect(breadcrumb.itemListElement.map((item) => item.item)).toEqual([
      'https://about.nilay.jp/',
      'https://about.nilay.jp/labs',
      'https://about.nilay.jp/labs/law-quiz',
    ]);
  });
});

describe('crawling', () => {
  it('lists the pages and every tool in the sitemap', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain('https://about.nilay.jp/labs');
    for (const tool of labsTools) expect(urls).toContain(`https://about.nilay.jp/labs/${tool.slug}`);
  });

  it('keeps crawlers out of the API and names both sitemaps', () => {
    const rules = robots();
    expect(rules.rules).toMatchObject({ disallow: '/api/' });
    expect(rules.sitemap).toEqual(['https://about.nilay.jp/sitemap.xml', 'https://about.nilay.jp/news/sitemap.xml']);
  });
});
