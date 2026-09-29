import { SearchIndexCompatibilityError } from './search-errors';
import type { SearchScope } from './search-protocol';

export const searchIndexFormat = '1';
export const searchIndexFormatHeader = 'X-Nilay-Search-Format';
export const searchIndexRevisionHeader = 'X-Nilay-Search-Revision';

/** Missing metadata is the supported legacy v1 array, including rollback responses. */
export function assertSearchIndexFormat(format: string | null | undefined): void {
  if (format != null && format !== searchIndexFormat) throw new SearchIndexCompatibilityError();
}

/** Preserve the latest input even when the shallow URL update has not yet flushed. */
export function searchRecoveryUrl(href: string, query: string, scope: SearchScope): string {
  const url = new URL(href);
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  if (scope === 'all') url.searchParams.delete('type');
  else url.searchParams.set('type', scope);
  return url.href;
}

/** A same-fragment assignment can be only an in-page navigation; explicitly reload the document. */
export function refreshSearchPage(query: string, scope: SearchScope): void {
  const url = searchRecoveryUrl(window.location.href, query, scope);
  window.history.replaceState(window.history.state, '', url);
  window.location.reload();
}
