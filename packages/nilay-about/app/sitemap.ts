import type { MetadataRoute } from 'next';

import { labsTools } from '@/lib/labs-tools';
import { absoluteUrl } from '@/lib/seo';

/** The pages that exist at build time. The news articles have their own sitemap under /news. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/'), changeFrequency: 'monthly', priority: 1 },
    { url: absoluteUrl('/labs'), changeFrequency: 'weekly', priority: 0.9 },
    ...labsTools.map((tool) => ({
      url: absoluteUrl(`/labs/${tool.slug}`),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    { url: absoluteUrl('/news'), changeFrequency: 'weekly', priority: 0.6 },
    { url: absoluteUrl('/contact'), changeFrequency: 'yearly', priority: 0.3 },
  ];
}
