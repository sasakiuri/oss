import type { MetadataRoute } from 'next';

import { newsRepository } from '@/features/news/server/repository';
import { absoluteUrl } from '@/lib/seo';

// Read from microCMS on each request, like the news pages, so a build needs no CMS credentials.
export const dynamic = 'force-dynamic';

const pageSize = 100;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await newsRepository.list({ limit: pageSize, offset });
    entries.push(...page.map((news) => ({ url: absoluteUrl(`/news/${encodeURIComponent(news.id)}`) })));
    if (page.length < pageSize) return entries;
  }
}
