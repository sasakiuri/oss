// SPDX-License-Identifier: MIT
import type { Metadata } from 'next';

import { absoluteUrl, site } from './site';

export function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: {
      type: 'website',
      locale: 'ja_JP',
      siteName: site.name,
      title,
      description,
      url: absoluteUrl(path),
      images: [{ url: absoluteUrl('/opengraph-image.png'), width: 1200, height: 630, alt: site.name }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [absoluteUrl('/opengraph-image.png')] },
  };
}
