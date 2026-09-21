import 'server-only';

import path from 'node:path';

import { cache } from 'react';

import { createImageDimensionsResolver } from './images';
import { isContentSlug } from './paths';
import { renderContent, renderSearchDocuments } from './render';
import { createContentRepository } from './repository';
import { contentTypes, type ContentDocument, type ContentType } from './types';

const repository = createContentRepository(path.join(process.cwd(), 'content'));
const imageDimensions = createImageDimensionsResolver(path.join(process.cwd(), 'public/content'));

// Request-scoped memoization shares reads between metadata and pages without stale process caches.
export const listContentSlugs = cache(repository.listSlugs);
export const listContent = cache(repository.list);
export const getSearchDocuments = cache(async () => {
  const sources = (await Promise.all(contentTypes.map((type) => repository.listSources(type)))).flat();
  return (await Promise.all(sources.map(renderSearchDocuments))).flat();
});
// Invalid public route segments are not content; keep validation errors inside the repository boundary.
export const getContentSource = cache(async (type: ContentType, slug: string) => {
  if (!isContentSlug(slug)) return null;
  return repository.read(type, slug);
});

export const getContentDocument = cache(async (type: ContentType, slug: string): Promise<ContentDocument | null> => {
  const source = await getContentSource(type, slug);
  if (!source) return null;
  return { ...source, ...(await renderContent(source, { imageDimensions })) };
});
