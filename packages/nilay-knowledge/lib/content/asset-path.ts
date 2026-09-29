/** Logical segments are already decoded. Never decode route parameters again. */
export function isPublishableContentPath(segments: readonly string[]): boolean {
  return (
    segments.length > 0 &&
    segments.every(
      (segment) => Boolean(segment) && !segment.startsWith('.') && !/[\\/\u0000-\u001f\u007f]/.test(segment),
    )
  );
}

/**
 * Decode an encoded /content pathname exactly once, segment by segment.
 * Returns null for unpublished paths; malformed percent encoding throws URIError.
 * Callers strip query/fragment components before entering this boundary.
 */
export function decodeContentAssetPathname(pathname: string): string[] | null {
  if (!pathname.startsWith('/content/')) return null;
  const segments = pathname.slice('/content/'.length).split('/').map(decodeURIComponent);
  return isPublishableContentPath(segments) ? segments : null;
}
