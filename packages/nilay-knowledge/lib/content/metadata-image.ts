import { decodeContentAssetPathname } from './asset-path';
import { resolveContentUrl } from './paths';
import type { ContentType } from './types';

/** Metadata images support content-relative paths, /content paths, and HTTP(S) URLs. */
export function resolveMetadataImage(value: string, type: ContentType, slug: string): string {
  if (!value || value !== value.trim() || /[\\\u0000-\u0020\u007f]/.test(value)) {
    throw new Error('Expected a metadata image URL without whitespace or backslashes');
  }
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.username || url.password) throw new Error('Metadata image URLs must not contain credentials');
    decodeURI(value); // Reject malformed percent encoding rather than serializing it into metadata.
    return value;
  }
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(value)) {
    throw new Error('Expected a content image path or HTTP(S) URL');
  }
  const resolved = resolveContentUrl(value, type, slug);
  if (!decodeContentAssetPathname(resolved.split(/[?#]/, 1)[0]!)) {
    throw new Error('Metadata image must use a published /content asset path');
  }
  return resolved;
}

export function isMetadataImage(value: string): boolean {
  try {
    resolveMetadataImage(value, 'articles', 'validation');
    return true;
  } catch {
    return false;
  }
}
