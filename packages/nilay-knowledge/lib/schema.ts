import type {
  AboutPage,
  Article,
  BreadcrumbList,
  CollectionPage,
  NewsArticle,
  Organization,
  WebSite,
  WithContext,
} from 'schema-dts';

import { siteConfig } from './config';
import { contentDescription } from './content/description';
import { contentImageUrl } from './content/metadata';
import { contentPath } from './content/paths';
import type { ContentSource, ContentSummary } from './content/types';

function publisher(): Organization {
  return {
    '@type': 'Organization',
    '@id': `${siteConfig.siteUrl}/#organization`,
    name: siteConfig.author.name,
    url: `${siteConfig.siteUrl}/about/`,
    logo: { '@type': 'ImageObject', url: `${siteConfig.siteUrl}/logo.png` },
    sameAs: [
      `https://twitter.com/${siteConfig.social.twitter}`,
      `https://www.facebook.com/${siteConfig.social.facebook}`,
      `https://www.youtube.com/channel/${siteConfig.social.youtube}`,
      `https://www.instagram.com/${siteConfig.social.instagram}`,
      `https://github.com/${siteConfig.social.github}`,
    ],
  };
}

export function createAboutSchema({
  title,
  description,
}: {
  title: string;
  description: string;
}): WithContext<AboutPage> {
  const url = `${siteConfig.siteUrl}/about/`;
  return {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    '@id': url,
    url,
    name: title,
    description,
    inLanguage: 'ja',
    isPartOf: { '@type': 'WebSite', '@id': `${siteConfig.siteUrl}/#website` },
    mainEntity: publisher(),
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
    // Social title cards are not representative article photographs or illustrations.
    ...(frontmatter.image ? { image: contentImageUrl(source) } : {}),
    author: publisher(),
    publisher: publisher(),
  };
}

export function createCollectionSchema({
  title,
  description,
  path,
  articles,
}: {
  title: string;
  description: string;
  path: string;
  articles: ContentSummary[];
}): WithContext<CollectionPage> {
  const url = new URL(path, siteConfig.siteUrl).href;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': url,
    url,
    name: title,
    description,
    inLanguage: 'ja',
    isPartOf: { '@type': 'WebSite', '@id': `${siteConfig.siteUrl}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: articles.length,
      itemListElement: articles.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: article.frontmatter.title,
        url: `${siteConfig.siteUrl}${contentPath(article.type, article.slug)}`,
      })),
    },
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
