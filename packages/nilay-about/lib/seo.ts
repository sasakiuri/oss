import type { Metadata } from 'next';

import { siteConfig } from '@/lib/config';
import { labsTool, type LabsToolSlug } from '@/lib/labs-tools';

interface PageMetadataInput {
  /** The page's own title. The root layout's template adds the site name. */
  title: string;
  description: string;
  /** Site-relative, starting with `/`. */
  path: string;
  type?: 'website' | 'article';
  publishedTime?: string;
}

/**
 * Canonical URL, Open Graph and Twitter card for one page.
 *
 * Next.js replaces `openGraph` and `twitter` as whole objects rather than merging them with the
 * layout's, so every page states all of it; otherwise it would be shared with the site's title.
 */
export function pageMetadata({
  title,
  description,
  path,
  type = 'website',
  publishedTime,
}: PageMetadataInput): Metadata {
  const fullTitle = `${title} | ${siteConfig.title}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      siteName: siteConfig.title,
      locale: 'ja_JP',
      type,
      ...(publishedTime ? { publishedTime } : {}),
      images: [{ url: siteConfig.image, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      site: `@${siteConfig.social.twitter}`,
      images: [siteConfig.image],
    },
  };
}

export function labsToolMetadata(slug: LabsToolSlug): Metadata {
  const tool = labsTool(slug);
  return pageMetadata({ title: tool.title.ja, description: tool.description, path: `/labs/${slug}` });
}

export const absoluteUrl = (path: string) => new URL(path, siteConfig.siteUrl).toString();

const organizationId = `${siteConfig.siteUrl}/#organization`;
/** Named where it is referenced, so the reference holds even if a reader does not join the blocks. */
const organizationRef = { '@type': 'Organization', '@id': organizationId, name: 'Nilay', url: siteConfig.siteUrl };

const organization = {
  '@type': 'Organization',
  '@id': organizationId,
  name: 'Nilay',
  url: siteConfig.siteUrl,
  email: siteConfig.contact.email,
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'JP',
    addressRegion: siteConfig.location.prefecture,
    addressLocality: siteConfig.location.city,
    streetAddress: siteConfig.location.street,
  },
  sameAs: [
    `https://x.com/${siteConfig.social.twitter}`,
    `https://www.facebook.com/${siteConfig.social.facebook}`,
    `https://www.instagram.com/${siteConfig.social.instagram}`,
    `https://www.youtube.com/channel/${siteConfig.social.youtube}`,
    `https://github.com/${siteConfig.social.github}`,
  ],
};

export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      {
        '@type': 'WebSite',
        '@id': `${siteConfig.siteUrl}/#website`,
        name: siteConfig.title,
        url: siteConfig.siteUrl,
        inLanguage: 'ja',
        publisher: organizationRef,
      },
    ],
  };
}

function breadcrumb(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function labsToolJsonLd(slug: LabsToolSlug) {
  const tool = labsTool(slug);
  const path = `/labs/${slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: tool.title.ja,
        alternateName: tool.title.en,
        description: tool.description,
        url: absoluteUrl(path),
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        inLanguage: tool.japaneseOnly ? 'ja' : ['ja', 'en'],
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'JPY' },
        publisher: organizationRef,
      },
      breadcrumb([
        { name: 'ホーム', path: '/' },
        { name: 'Labs', path: '/labs' },
        { name: tool.title.ja, path },
      ]),
    ],
  };
}

export function labsIndexJsonLd(tools: readonly { slug: string; title: { ja: string } }[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Labs',
        url: absoluteUrl('/labs'),
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: tools.map((tool, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: tool.title.ja,
            url: absoluteUrl(`/labs/${tool.slug}`),
          })),
        },
      },
      breadcrumb([
        { name: 'ホーム', path: '/' },
        { name: 'Labs', path: '/labs' },
      ]),
    ],
  };
}

export function newsArticleJsonLd(news: { id: string; title: string; date: Date }) {
  const path = `/news/${encodeURIComponent(news.id)}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsArticle',
        headline: news.title,
        datePublished: news.date.toISOString(),
        url: absoluteUrl(path),
        mainEntityOfPage: absoluteUrl(path),
        image: [siteConfig.image],
        author: organizationRef,
        publisher: organizationRef,
      },
      breadcrumb([
        { name: 'ホーム', path: '/' },
        { name: 'お知らせ', path: '/news' },
        { name: news.title, path },
      ]),
    ],
  };
}
