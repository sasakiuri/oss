import { describe, expect, it } from 'vitest';

import { siteConfig } from '@/lib/config';
import { contentImageUrl, createContentMetadata } from '@/lib/content/metadata';
import type { ContentSummary } from '@/lib/content/types';
import { createArticleSchema } from '@/lib/schema';

const summary: ContentSummary = {
  type: 'articles',
  slug: 'example',
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
      images: [{ url: expected, width: 1200, height: 630 }],
    });
    expect(createArticleSchema({ ...source.frontmatter, slug: source.slug, description: '', image: url }).image).toBe(
      expected,
    );
  });

  it('includes canonical URLs and update dates for both collections without HTML', () => {
    for (const type of ['articles', 'news'] as const) {
      const metadata = createContentMetadata({ ...summary, type });
      expect(metadata.alternates?.canonical).toBe(`${siteConfig.siteUrl}/${type}/example/`);
      expect(metadata.alternates?.types).toEqual({ 'application/rss+xml': '/feed.xml' });
      expect(metadata.openGraph).toMatchObject({ publishedTime: '2024-01-01', modifiedTime: '2024-02-01' });
    }
  });
});
