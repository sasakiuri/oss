import type { Metadata } from 'next';

import { siteConfig } from '../config';

import { contentPath, resolveContentUrl } from './paths';
import type { ContentSummary } from './types';

export function contentImageUrl({ type, slug, frontmatter }: ContentSummary): string {
  return frontmatter.image
    ? new URL(resolveContentUrl(frontmatter.image, type, slug), siteConfig.siteUrl).href
    : `${siteConfig.siteUrl}/api/og/?title=${encodeURIComponent(frontmatter.title)}`;
}

export function createContentMetadata(source: ContentSummary): Metadata {
  const { type, slug, frontmatter } = source;
  const image = contentImageUrl(source);
  const url = `${siteConfig.siteUrl}${contentPath(type, slug)}`;
  return {
    title: frontmatter.title,
    alternates: { canonical: url, types: { 'application/rss+xml': '/feed.xml' } },
    openGraph: {
      title: frontmatter.title,
      type: 'article',
      url,
      images: [{ url: image, width: 1200, height: 630 }],
      publishedTime: frontmatter.published,
      modifiedTime: frontmatter.updated,
    },
    twitter: { card: 'summary_large_image', title: frontmatter.title, images: [image] },
  };
}
