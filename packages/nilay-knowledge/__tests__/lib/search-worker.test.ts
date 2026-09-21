// @vitest-environment node
import { expose } from 'comlink';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchDocument } from '@/lib/content/types';
import { createSearchIndex, searchExcerpt } from '@/lib/search';
import type { SearchWorkerApi } from '@/lib/search-protocol';

vi.mock('comlink', () => ({ expose: vi.fn() }));

const documents: SearchDocument[] = Array.from({ length: 25 }, (_, index) => ({
  id: `/articles/example-${index}/#print`,
  type: 'articles',
  title: `文書ガイド ${index}`,
  section: index === 0 ? '印刷の準備' : '所持許可申請',
  tags: ['資料'],
  text: `${'前の文章。'.repeat(40)}印刷する前に USB 接続と申請書類を確認します。 ${index}`,
}));

let api: SearchWorkerApi;
let fetchIndex: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  vi.mocked(expose).mockClear();
  fetchIndex = vi.fn().mockResolvedValue({ ok: true, json: async () => documents });
  vi.stubGlobal('fetch', fetchIndex);
  await import('@/lib/search.worker');
  api = vi.mocked(expose).mock.calls[0]![0] as SearchWorkerApi;
});

afterEach(() => vi.unstubAllGlobals());

describe('search worker API', () => {
  it('matches Japanese search ordering, totals and excerpts while returning only twenty hits', async () => {
    const index = createSearchIndex(documents);
    for (const query of ['印刷', '所持許可', '資料', 'ＵＳＢ', '印刷 申請', '存在しない', '']) {
      const expected = index.search(query.trim());
      expect(await api.search(query)).toEqual({
        total: expected.length,
        hits: expected.slice(0, 20).map((result) => ({
          id: String(result.id),
          type: result.type,
          title: String(result.title),
          section: String(result.section),
          excerpt: searchExcerpt(String(result.text), query),
        })),
      });
    }
    const response = await api.search('印刷');
    expect(response.total).toBe(25);
    expect(response.hits).toHaveLength(20);
    expect(response.hits[0].excerpt).toContain('印刷する前に');
    expect(response.hits[0].excerpt).toMatch(/^…/);
    expect(response.hits[0]).not.toHaveProperty('text');
    expect(fetchIndex).toHaveBeenCalledExactlyOnceWith('/search-index.json');
  });

  it('shares one pending download between initialization and concurrent searches', async () => {
    const download = Promise.withResolvers<{ ok: boolean; json: () => Promise<SearchDocument[]> }>();
    fetchIndex.mockReturnValueOnce(download.promise);
    const load = api.load();
    const search = api.search('印刷');
    expect(fetchIndex).toHaveBeenCalledOnce();
    download.resolve({ ok: true, json: async () => documents });
    await expect(load).resolves.toBeUndefined();
    await expect(search).resolves.toMatchObject({ total: 25 });
  });

  it.each(['http', 'network', 'json', 'invalid', 'destination', 'duplicate'])(
    'reports %s failures and permits a subsequent fresh download',
    async (failure) => {
      if (failure === 'network') fetchIndex.mockRejectedValueOnce(new Error('Offline'));
      else {
        fetchIndex.mockResolvedValueOnce({
          ok: failure !== 'http',
          json: async () => {
            if (failure === 'json') throw new Error('Invalid JSON');
            if (failure === 'destination') return [{ ...documents[0], id: 'https://example.com/' }];
            if (failure === 'duplicate') return [documents[0], documents[0]];
            return [{ id: '/articles/example/' }];
          },
        });
      }
      await expect(api.load()).rejects.toThrow('Search unavailable');
      await expect(api.load()).resolves.toBeUndefined();
      expect((await api.search('印刷')).total).toBe(25);
      expect(fetchIndex).toHaveBeenCalledTimes(2);
    },
  );
});
