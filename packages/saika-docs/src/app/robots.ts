// SPDX-License-Identifier: MIT
import type { MetadataRoute } from 'next';

import { readServerEnv } from '@/shared/config/env';
import { absoluteUrl } from '@/shared/config/site';

export const dynamic = 'force-static';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: [
      absoluteUrl('/sitemap.xml'),
      ...(readServerEnv().DOCS_OUTPUT !== 'export' ? [absoluteUrl('/reference/news/sitemap.xml/')] : []),
    ],
  };
}
