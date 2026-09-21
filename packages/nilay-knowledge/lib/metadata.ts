import type { Metadata } from 'next';

import { siteConfig } from './config';

export function createPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = new URL(path, siteConfig.siteUrl).href;
  const socialTitle = `${title} | ${siteConfig.title}`;
  return {
    // Root-page titles do not inherit the title template from the same layout segment.
    title: { absolute: socialTitle },
    description,
    alternates: { canonical: url, types: { 'application/rss+xml': '/feed.xml' } },
    openGraph: {
      type: 'website',
      locale: 'ja_JP',
      siteName: siteConfig.title,
      url,
      title: socialTitle,
      description,
      images: [{ url: '/ogp.png', width: 1280, height: 670, alt: siteConfig.title }],
    },
    twitter: {
      card: 'summary_large_image',
      site: `@${siteConfig.social.twitter}`,
      creator: `@${siteConfig.social.twitter}`,
      title: socialTitle,
      description,
      images: [{ url: '/ogp.png', alt: siteConfig.title }],
    },
  };
}
