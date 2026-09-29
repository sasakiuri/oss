// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isSearchIndexCompatibilityError,
  isSearchIndexError,
  normalizeSearchError,
  SearchIndexCompatibilityError,
  SearchIndexError,
} from '@/lib/search-errors';
import { assertSearchIndexFormat, refreshSearchPage, searchRecoveryUrl } from '@/lib/search-index-format';

// Full-document refresh must preserve query, target, unrelated parameters and the original fragment.
afterEach(() => vi.unstubAllGlobals());

describe('search index format and page recovery', () => {
  it.each([null, undefined, '1'])('accepts a legacy or supported response: %s', (format) => {
    expect(() => assertSearchIndexFormat(format)).not.toThrow();
  });

  it.each(['2', '', 'v1', '1.0', 'unknown'])('rejects unsupported format metadata: %s', (format) => {
    expect(() => assertSearchIndexFormat(format)).toThrow(SearchIndexCompatibilityError);
  });

  it('recognizes serialized compatibility errors without retaining their class prototype', () => {
    const original = new SearchIndexCompatibilityError();
    const transferred = Object.assign(new Error(original.message), { name: original.name });
    expect(isSearchIndexCompatibilityError(original)).toBe(true);
    expect(isSearchIndexCompatibilityError(transferred)).toBe(true);
    expect(isSearchIndexError(transferred)).toBe(true);
    expect(normalizeSearchError(transferred)).toBe(transferred);
    for (const error of [null, undefined, false, '', 'SearchIndexCompatibilityError', {}]) {
      expect(isSearchIndexCompatibilityError(error)).toBe(false);
      expect(isSearchIndexError(error)).toBe(false);
      expect(normalizeSearchError(error)).toEqual(new Error('Search unavailable'));
    }
    const retryable = new SearchIndexError('Offline');
    expect(isSearchIndexCompatibilityError(retryable)).toBe(false);
    expect(isSearchIndexError(retryable)).toBe(true);
    expect(isSearchIndexError(new Error('Worker stopped'))).toBe(false);
  });

  it('overrides pending query state without changing the page or unrelated parameters', () => {
    const url = new URL(
      searchRecoveryUrl('https://example.com/articles/example/?q=old&type=news&keep=1#section', '印刷 & 確認', 'pdf'),
    );
    expect(url.origin + url.pathname).toBe('https://example.com/articles/example/');
    expect(url.searchParams.get('q')).toBe('印刷 & 確認');
    expect(url.searchParams.get('type')).toBe('pdf');
    expect(url.searchParams.get('keep')).toBe('1');
    expect(url.hash).toBe('#section');
    expect(searchRecoveryUrl('https://example.com/?q=old&type=pdf&keep=1', '', 'all')).toBe(
      'https://example.com/?keep=1',
    );
  });

  it('updates URL state before explicitly reloading even an unchanged fragment URL', () => {
    const state = { preserved: true };
    const replaceState = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal('window', {
      location: { href: 'https://example.com/?q=old&type=pdf#section', reload },
      history: { state, replaceState },
    });
    refreshSearchPage('印刷', 'pdf');
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(
      state,
      '',
      'https://example.com/?q=%E5%8D%B0%E5%88%B7&type=pdf#section',
    );
    expect(reload).toHaveBeenCalledOnce();
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]!);
  });
});
