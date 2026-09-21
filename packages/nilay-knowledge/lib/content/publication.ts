import RSS from 'rss';

import { siteConfig } from '../config';

import { getArticleCategoryPages } from './category-pages';
import { contentDescription } from './description';
import { contentPath } from './paths';
import { comparePublished } from './repository';
import { createArticleDirectory } from './taxonomy';
import type { ContentSource, ContentSummary } from './types';

export function createFeed(items: ContentSource[], now = new Date()): string {
  const feed = new RSS({
    title: siteConfig.title,
    description: siteConfig.description,
    site_url: siteConfig.siteUrl,
    feed_url: `${siteConfig.siteUrl}/feed.xml`,
    language: 'ja',
    pubDate: now,
    copyright: `© ${now.getFullYear()} ${siteConfig.author.name}`,
  });
  for (const item of [...items].sort(comparePublished)) {
    feed.item({
      title: item.frontmatter.title,
      description: contentDescription(item),
      url: `${siteConfig.siteUrl}${contentPath(item.type, item.slug)}`,
      date: new Date(item.frontmatter.published),
    });
  }
  return feed.xml({ indent: true });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function createSitemap(items: ContentSummary[]): string {
  const pages: { url: string; priority: string; modified?: string }[] = [
    { url: `${siteConfig.siteUrl}/`, priority: '1.0' },
    { url: `${siteConfig.siteUrl}/articles/`, priority: '0.8' },
    { url: `${siteConfig.siteUrl}/news/`, priority: '0.8' },
    { url: `${siteConfig.siteUrl}/about/`, priority: '0.5' },
    ...getArticleCategoryPages(createArticleDirectory(items)).map((category) => ({
      url: `${siteConfig.siteUrl}${category.path}`,
      priority: '0.8',
    })),
    ...[...items].sort(comparePublished).map((item) => ({
      url: `${siteConfig.siteUrl}${contentPath(item.type, item.slug)}`,
      priority: item.type === 'articles' ? '0.7' : '0.5',
      modified: item.frontmatter.updated ?? item.frontmatter.published,
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${escapeXml(page.url)}</loc>${page.modified ? `\n    <lastmod>${escapeXml(page.modified)}</lastmod>` : ''}
    <priority>${page.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;
}
