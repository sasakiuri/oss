import 'server-only';

import path from 'node:path';

import { cache } from 'react';

import { isContentSlug } from './paths';
import { renderContent } from './render';
import { createContentRepository } from './repository';
import type { ContentDocument, ContentType } from './types';

const repository = createContentRepository(path.join(process.cwd(), 'content'));

// Request-scoped memoization shares reads between metadata and pages without stale process caches.
export const listContentSlugs = cache(repository.listSlugs);
export const listContent = cache(repository.list);
// Invalid public route segments are not content; keep validation errors inside the repository boundary.
export const getContentSource = cache(async (type: ContentType, slug: string) => {
  if (!isContentSlug(slug)) return null;
  return repository.read(type, slug);
});

export const getContentDocument = cache(async (type: ContentType, slug: string): Promise<ContentDocument | null> => {
  const source = await getContentSource(type, slug);
  if (!source) return null;
  return { ...source, ...(await renderContent(source)) };
});
