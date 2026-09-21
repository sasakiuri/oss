// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchDocument } from '@/lib/content/types';
import { createSearchIndex, searchExcerpt } from '@/lib/search';
import type { SearchRequest } from '@/lib/search-protocol';

const documents: SearchDocument[] = Array.from({ length: 25 }, (_, index) => ({
  id: `/articles/example-${index}/#print`,
  type: 'articles',
  title: `文書ガイド ${index}`,
  section: index === 0 ? '印刷の準備' : '所持許可申請',
  tags: ['資料'],
  text: `${'前の文章。'.repeat(40)}印刷する前に USB 接続と申請書類を確認します。 ${index}`,
}));

let scope: {
  onmessage: ((event: MessageEvent<SearchRequest>) => Promise<void>) | null;
  postMessage: ReturnType<typeof vi.fn>;
};
let fetchIndex: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  scope = { onmessage: null, postMessage: vi.fn() };
  fetchIndex = vi.fn().mockResolvedValue({ ok: true, json: async () => documents });
  vi.stubGlobal('self', scope);
  vi.stubGlobal('fetch', fetchIndex);
  await import('@/lib/search.worker');
});

afterEach(() => vi.unstubAllGlobals());

async function request(data: SearchRequest) {
  await scope.onmessage?.({ data } as MessageEvent<SearchRequest>);
  return scope.postMessage.mock.lastCall?.[0];
}

describe('search worker', () => {
  it('matches Japanese search ordering, totals and excerpts while returning only twenty hits', async () => {
    const index = createSearchIndex(documents);
    for (const [id, query] of ['印刷', '所持許可', '資料', 'ＵＳＢ', '印刷 申請', '存在しない', ''].entries()) {
      const expected = index.search(query.trim());
      const response = await request({ id, query });
      expect(response).toEqual({
        id,
        results: {
          total: expected.length,
          hits: expected.slice(0, 20).map((result) => ({
            id: String(result.id),
            type: result.type,
            title: String(result.title),
            section: String(result.section),
            excerpt: searchExcerpt(String(result.text), query),
          })),
        },
      });
    }
    const response = await request({ id: 100, query: '印刷' });
    expect(response.results.total).toBe(25);
    expect(response.results.hits).toHaveLength(20);
    expect(response.results.hits[0].excerpt).toContain('印刷する前に');
    expect(response.results.hits[0].excerpt).toMatch(/^…/);
    expect(response.results.hits[0]).not.toHaveProperty('text');
    expect(fetchIndex).toHaveBeenCalledExactlyOnceWith('/search-index.json');
  });

  it('shares one pending download between initialization and concurrent searches', async () => {
    let finish!: (response: { ok: boolean; json: () => Promise<SearchDocument[]> }) => void;
    fetchIndex.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const load = request({ id: 1 });
    const search = request({ id: 2, query: '印刷' });
    expect(fetchIndex).toHaveBeenCalledOnce();
    finish({ ok: true, json: async () => documents });
    await Promise.all([load, search]);
    expect(scope.postMessage).toHaveBeenCalledWith({ id: 1, ready: true });
    expect(scope.postMessage).toHaveBeenCalledWith({
      id: 2,
      results: expect.objectContaining({ total: 25 }),
    });
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
      expect(await request({ id: 1 })).toEqual({ id: 1, error: 'Search unavailable' });
      expect(await request({ id: 2 })).toEqual({ id: 2, ready: true });
      expect((await request({ id: 3, query: '印刷' })).results.total).toBe(25);
      expect(fetchIndex).toHaveBeenCalledTimes(2);
    },
  );
});
