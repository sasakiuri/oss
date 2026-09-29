// @vitest-environment node
import { expose } from 'comlink';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchDocument } from '@/lib/content/types';
import { isSearchIndexError, SearchIndexError } from '@/lib/search-errors';
import type { SearchWorkerApi } from '@/lib/search-protocol';

vi.mock('comlink', () => ({ expose: vi.fn() }));

const article: SearchDocument = {
  id: '/articles/example/#print',
  type: 'articles',
  title: '文書ガイド',
  section: '印刷の準備',
  tags: [],
  text: '印刷する前に確認します。',
};
const pdf: SearchDocument = { ...article, type: 'pdf', id: '/content/articles/example/file.pdf#page=2' };
let api: SearchWorkerApi;
let fetchIndex: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  vi.mocked(expose).mockClear();
  fetchIndex = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url === '/pdf-search-index.json' ? [pdf] : [article]),
  }));
  vi.stubGlobal('fetch', fetchIndex);
  await import('@/lib/search.worker');
  api = vi.mocked(expose).mock.calls[0]![0] as SearchWorkerApi;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('independent search index recovery', () => {
  it('recognizes the name preserved by Comlink without depending on subclass identity', () => {
    expect(isSearchIndexError(new SearchIndexError('Unavailable'))).toBe(true);
    expect(isSearchIndexError(Object.assign(new Error('Unavailable'), { name: 'SearchIndexError' }))).toBe(true);
    for (const error of [null, undefined, 'SearchIndexError', {}, new Error('Worker stopped')]) {
      expect(isSearchIndexError(error)).toBe(false);
    }
  });

  it('does not request either index for an empty PDF query', async () => {
    expect(await api.search('  ', 'pdf')).toMatchObject({ total: 0, groups: [] });
    expect(fetchIndex).not.toHaveBeenCalled();
  });

  it('serves PDF results while article initialization fails, then retries only the article index', async () => {
    const pending = Promise.withResolvers<never>();
    fetchIndex.mockReturnValueOnce(pending.promise);
    const loadFailure = api.load().catch((error: unknown) => error);
    expect(await api.search('印刷', 'pdf')).toMatchObject({ total: 1 });
    pending.reject(new Error('Offline'));
    await expect(loadFailure).resolves.toMatchObject({ name: 'SearchIndexError' });
    expect(await api.search('印刷', 'pdf')).toMatchObject({ total: 1 });
    expect(fetchIndex).toHaveBeenCalledTimes(2);
    await api.load();
    expect(await api.search('印刷', 'articles')).toMatchObject({ total: 1 });
    expect(fetchIndex).toHaveBeenCalledTimes(3);
  });

  it('shares a failed PDF attempt and preserves the healthy article cache during retry', async () => {
    await api.load();
    const pending = Promise.withResolvers<never>();
    fetchIndex.mockReturnValueOnce(pending.promise);
    const first = api.search('印刷', 'pdf').catch((error: unknown) => error);
    const second = api.search('確認', 'pdf').catch((error: unknown) => error);
    expect(fetchIndex).toHaveBeenCalledTimes(2);
    pending.reject(new Error('Offline'));
    await expect(first).resolves.toMatchObject({ name: 'SearchIndexError' });
    await expect(second).resolves.toMatchObject({ name: 'SearchIndexError' });
    expect(await api.search('印刷', 'articles')).toMatchObject({ total: 1 });
    expect(fetchIndex).toHaveBeenCalledTimes(2);
    expect(await api.search('印刷', 'pdf')).toMatchObject({ total: 1 });
    expect(fetchIndex).toHaveBeenCalledTimes(3);
  });

  it.each(['headers', 'body'] as const)('bounds stalled %s and ignores late data', async (stage) => {
    vi.useFakeTimers();
    await api.load();
    const response = Promise.withResolvers<{ ok: boolean; json: () => Promise<SearchDocument[]> }>();
    const body = Promise.withResolvers<SearchDocument[]>();
    fetchIndex.mockReturnValueOnce(
      stage === 'headers' ? response.promise : Promise.resolve({ ok: true, json: () => body.promise }),
    );
    const failure = api.search('印刷', 'pdf').catch((error: unknown) => error);
    const signal = (fetchIndex.mock.calls[1]![1] as RequestInit).signal!;
    await vi.advanceTimersByTimeAsync(14_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(failure).resolves.toMatchObject({ name: 'SearchIndexError', message: 'PDF search unavailable' });
    expect(signal.aborted).toBe(true);
    expect(await api.search('印刷', 'articles')).toMatchObject({ total: 1 });
    expect(await api.search('印刷', 'pdf')).toMatchObject({ total: 1 });
    response.resolve({ ok: true, json: async () => [] });
    body.resolve([]);
    await Promise.resolve();
    expect(await api.search('確認', 'pdf')).toMatchObject({ total: 1 });
    expect(fetchIndex).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects wrong-collection data as recoverable and clears the download timer', async () => {
    vi.useFakeTimers();
    fetchIndex.mockResolvedValueOnce({ ok: true, json: async () => [article] });
    await expect(api.search('印刷', 'pdf')).rejects.toMatchObject({ name: 'SearchIndexError' });
    expect(vi.getTimerCount()).toBe(0);
    expect(await api.search('印刷', 'pdf')).toMatchObject({ total: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
