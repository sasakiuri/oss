import type { Article, BreadcrumbList, NewsArticle, Organization, WebSite, WithContext } from 'schema-dts';

import { siteConfig } from './config';
import { contentDescription } from './content/description';
import { contentImageUrl } from './content/metadata';
import { contentPath } from './content/paths';
import type { ContentSource } from './content/types';

function publisher(): Organization {
  return {
    '@type': 'Organization',
    '@id': `${siteConfig.siteUrl}/#organization`,
    name: siteConfig.author.name,
    url: `${siteConfig.siteUrl}/about/`,
    logo: { '@type': 'ImageObject', url: `${siteConfig.siteUrl}/logo.png` },
  };
}

// Factory functions
export function createBreadcrumbSchema(items: { name: string; slug: string }[]): WithContext<BreadcrumbList> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.slug ? `${siteConfig.siteUrl}/${item.slug.replace(/\/$/, '')}/` : `${siteConfig.siteUrl}/`,
    })),
  };
}

export function createContentSchema(source: ContentSource): WithContext<Article | NewsArticle> {
  const { frontmatter } = source;
  const url = `${siteConfig.siteUrl}${contentPath(source.type, source.slug)}`;
  return {
    '@context': 'https://schema.org',
    '@type': source.type === 'news' ? 'NewsArticle' : 'Article',
    '@id': `${url}#article`,
    headline: frontmatter.title,
    description: contentDescription(source),
    datePublished: frontmatter.published,
    dateModified: frontmatter.updated ?? frontmatter.published,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: 'ja',
    image: contentImageUrl(source),
    author: publisher(),
    publisher: publisher(),
  };
}

export function createWebSiteSchema(): WithContext<WebSite> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteConfig.siteUrl}/#website`,
    name: siteConfig.title,
    url: `${siteConfig.siteUrl}/`,
    description: siteConfig.description,
    inLanguage: 'ja',
    publisher: publisher(),
  };
}
