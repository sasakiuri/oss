import { describe, expect, it } from 'vitest';

import { siteConfig } from '@/lib/config';
import { contentImageUrl, createContentMetadata } from '@/lib/content/metadata';
import type { ContentSource } from '@/lib/content/types';
import { createPageMetadata } from '@/lib/metadata';
import { createContentSchema } from '@/lib/schema';

const summary: ContentSource = {
  type: 'articles',
  slug: 'example',
  content: 'A **specific** description with a [link](https://example.com).',
  frontmatter: { title: 'A title & text', published: '2024-01-01', updated: '2024-02-01', tags: [] },
};

describe('content metadata', () => {
  it.each([
    ['cover.png', `${siteConfig.siteUrl}/content/articles/example/cover.png`],
    ['/content/assets/cover.png', `${siteConfig.siteUrl}/content/assets/cover.png`],
    ['https://example.com/cover.png', 'https://example.com/cover.png'],
    [undefined, `${siteConfig.siteUrl}/api/og/?title=A%20title%20%26%20text`],
  ])('uses the same image in metadata and structured data for %j', (image, expected) => {
    const source = { ...summary, frontmatter: { ...summary.frontmatter, image } };
    const url = contentImageUrl(source);
    expect(url).toBe(expected);
    expect(createContentMetadata(source).openGraph).toMatchObject({
      images: [{ url: expected, alt: summary.frontmatter.title }],
    });
    expect(createContentSchema(source).image).toBe(expected);
    const serialized = JSON.stringify(createContentMetadata(source).openGraph);
    expect(serialized.includes('"width":1200')).toBe(image === undefined);
  });

  it('includes canonical URLs and update dates for both collections without HTML', () => {
    for (const type of ['articles', 'news'] as const) {
      const metadata = createContentMetadata({ ...summary, type });
      expect(metadata.alternates?.canonical).toBe(`${siteConfig.siteUrl}/${type}/example/`);
      expect(metadata.alternates?.types).toEqual({ 'application/rss+xml': '/feed.xml' });
      expect(metadata.openGraph).toMatchObject({ publishedTime: '2024-01-01', modifiedTime: '2024-02-01' });
      expect(metadata.description).toBe('A specific description with a link.');
      expect(metadata.openGraph).toMatchObject({ description: metadata.description, locale: 'ja_JP' });
      expect(metadata.twitter).toMatchObject({ description: metadata.description });
      expect(createContentSchema({ ...summary, type })).toMatchObject({
        '@type': type === 'news' ? 'NewsArticle' : 'Article',
        url: metadata.alternates?.canonical,
        description: metadata.description,
        mainEntityOfPage: { '@id': metadata.alternates?.canonical },
        author: { name: 'Nilay', url: `${siteConfig.siteUrl}/about/` },
        datePublished: '2024-01-01',
        dateModified: '2024-02-01',
      });
    }
  });

  it('keeps static page identity consistent across canonical, Open Graph and Twitter', () => {
    const metadata = createPageMetadata({ title: 'ニュース', description: 'ニュースの記録', path: '/news/' });
    expect(metadata.title).toEqual({ absolute: `ニュース | ${siteConfig.title}` });
    expect(metadata.alternates?.canonical).toBe(`${siteConfig.siteUrl}/news/`);
    expect(metadata.openGraph).toMatchObject({
      url: metadata.alternates?.canonical,
      title: `ニュース | ${siteConfig.title}`,
      description: metadata.description,
    });
    expect(metadata.twitter).toMatchObject({
      title: `ニュース | ${siteConfig.title}`,
      description: metadata.description,
    });
  });
});
