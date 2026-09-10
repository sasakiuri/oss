// SPDX-License-Identifier: MIT
import type { MetadataRoute } from 'next';

import { getDocuments } from '@/entities/document/server/repository';
import { absoluteUrl } from '@/shared/config/site';

export const dynamic = 'force-static';
export default function sitemap(): MetadataRoute.Sitemap {
  return getDocuments().map((document) => ({ url: absoluteUrl(document.href) }));
}
