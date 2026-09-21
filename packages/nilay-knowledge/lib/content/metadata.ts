import type { Metadata } from 'next';

import { siteConfig } from '../config';

import { contentDescription } from './description';
import { contentPath, resolveContentUrl } from './paths';
import type { ContentSource, ContentSummary } from './types';

export function contentImageUrl({ type, slug, frontmatter }: ContentSummary): string {
  return frontmatter.image
    ? new URL(resolveContentUrl(frontmatter.image, type, slug), siteConfig.siteUrl).href
    : `${siteConfig.siteUrl}/api/og/?title=${encodeURIComponent(frontmatter.title)}`;
}

export function createContentMetadata(source: ContentSource): Metadata {
  const { type, slug, frontmatter } = source;
  const image = contentImageUrl(source);
  const description = contentDescription(source);
  const url = `${siteConfig.siteUrl}${contentPath(type, slug)}`;
  return {
    title: frontmatter.title,
    description,
    alternates: { canonical: url, types: { 'application/rss+xml': '/feed.xml' } },
    openGraph: {
      title: frontmatter.title,
      description,
      type: 'article',
      locale: 'ja_JP',
      siteName: siteConfig.title,
      url,
      images: [{ url: image, alt: frontmatter.title, ...(!frontmatter.image ? { width: 1200, height: 630 } : {}) }],
      publishedTime: frontmatter.published,
      modifiedTime: frontmatter.updated ?? frontmatter.published,
      authors: [`${siteConfig.siteUrl}/about/`],
      tags: frontmatter.tags,
    },
    twitter: {
      card: 'summary_large_image',
      site: `@${siteConfig.social.twitter}`,
      creator: `@${siteConfig.social.twitter}`,
      title: frontmatter.title,
      description,
      images: [{ url: image, alt: frontmatter.title }],
    },
  };
}
