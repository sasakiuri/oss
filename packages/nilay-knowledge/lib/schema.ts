import type { Article, BreadcrumbList, WebSite, WithContext } from 'schema-dts';

import { siteConfig } from './config';

// Factory functions
export function createBreadcrumbSchema(items: { name: string; slug: string }[]): WithContext<BreadcrumbList> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${siteConfig.siteUrl}/${item.slug}`,
    })),
  };
}

export function createArticleSchema(params: {
  title: string;
  description: string;
  published: string;
  updated?: string;
  slug: string;
  image?: string;
}): WithContext<Article> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: params.title,
    description: params.description,
    datePublished: params.published,
    dateModified: params.updated || params.published,
    url: `${siteConfig.siteUrl}/articles/${params.slug}/`,
    image: params.image ? new URL(params.image, siteConfig.siteUrl).href : undefined,
    author: {
      '@type': 'Organization',
      name: siteConfig.author.name,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.author.name,
    },
  };
}

export function createWebSiteSchema(): WithContext<WebSite> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.title,
    url: siteConfig.siteUrl,
    description: siteConfig.description,
  };
}
