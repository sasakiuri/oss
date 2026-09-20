import type { ContentType } from './types';

export function isContentSlug(slug: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(slug);
}

export function contentPath(type: ContentType, slug: string): string {
  return `/${type}/${slug}/`;
}

/** Resolve only relative references. Schemes, fragments and root paths retain their meaning. */
export function resolveContentUrl(url: string, type: ContentType, slug: string): string {
  if (!url || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(url)) return url;
  const resolved = new URL(url, `https://content.invalid/content/${type}/${slug}/`);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
