// SPDX-License-Identifier: MIT
import type { MetadataRoute } from 'next';

import { site, withBasePath } from '@/shared/config/site';

export const dynamic = 'force-static';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: 'Saika',
    description: site.description,
    lang: 'ja',
    start_url: withBasePath('/'),
    scope: withBasePath('/'),
    display: 'standalone',
    background_color: '#fcfcfb',
    theme_color: '#fcfcfb',
    icons: [
      { src: withBasePath('/icon.svg'), sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: withBasePath('/icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: withBasePath('/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
