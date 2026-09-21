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
  it('groups all sections before pagination and makes every match reachable without duplicate pages', async () => {
    const additionalSections = Array.from({ length: 30 }, (_, section) => ({
      ...documents[0]!,
      id: `/articles/example-0/#section-${section}`,
      section: `印刷 ${section}`,
    }));
    fetchIndex.mockResolvedValueOnce({ ok: true, json: async () => [...documents, ...additionalSections] });
    const first = await api.search('印刷');
    expect(first).toMatchObject({ total: 25, totalMatches: 55, nextOffset: 20 });
    expect(first.groups).toHaveLength(20);
    expect(first.groups.find((group) => group.id === '/articles/example-0/')?.matches).toHaveLength(31);
    const second = await api.search('印刷', 'all', first.nextOffset!);
    expect(second).toMatchObject({ total: 25, totalMatches: 55, nextOffset: null });
    expect(second.groups).toHaveLength(5);
    const pages = [...first.groups, ...second.groups];
    expect(new Set(pages.map((group) => group.id)).size).toBe(25);
    expect(new Set(pages.flatMap((group) => group.matches.map((match) => match.id))).size).toBe(55);
    expect((await api.search('印刷', 'all', 25)).groups).toEqual([]);
    expect(fetchIndex).toHaveBeenCalledOnce();
  });

  it.each([-1, 0.5, Infinity, NaN])('rejects the invalid page offset %s', async (offset) => {
    await expect(api.search('印刷', 'all', offset)).rejects.toThrow('Invalid search offset');
  });

  it('groups PDF pages by their file while preserving matching page destinations', async () => {
    const pdfPages = [2, 4, 7].map((page) => ({
      ...documents[0]!,
      type: 'pdf',
      id: `/content/articles/example/file.pdf#page=${page}`,
      section: `${page} ページ`,
    }));
    fetchIndex.mockResolvedValueOnce({ ok: true, json: async () => pdfPages });
    const response = await api.search('印刷', 'pdf');
    expect(response).toMatchObject({ total: 1, totalMatches: 3, nextOffset: null });
    expect(response.groups[0]).toMatchObject({ id: '/content/articles/example/file.pdf', type: 'pdf' });
    expect(response.groups[0]!.matches.map((match) => match.id).sort()).toEqual(pdfPages.map((page) => page.id));
  });

  it('matches Japanese search ordering, totals and excerpts while paginating twenty distinct pages', async () => {
    const index = createSearchIndex(documents);
    for (const query of ['印刷', '所持許可', '資料', 'ＵＳＢ', '印刷 申請', '存在しない', '']) {
      const expected = index.search(query.trim());
      expect(await api.search(query)).toEqual({
        total: expected.length,
        totalMatches: expected.length,
        nextOffset: expected.length > 20 ? 20 : null,
        groups: expected.slice(0, 20).map((result) => ({
          id: String(result.id).split('#')[0],
          type: result.type,
          title: String(result.title),
          matches: [
            {
              id: String(result.id),
              section: String(result.section),
              excerpt: searchExcerpt(String(result.text), query),
            },
          ],
        })),
      });
    }
    const response = await api.search('印刷');
    expect(response.total).toBe(25);
    expect(response.groups).toHaveLength(20);
    expect(response.groups[0].matches[0].excerpt).toContain('印刷する前に');
    expect(response.groups[0].matches[0].excerpt).toMatch(/^…/);
    expect(response.groups[0]).not.toHaveProperty('text');
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
  it('loads PDF data separately, filters before limiting, and reuses the PDF index', async () => {
    const pdf = { ...documents[0]!, type: 'pdf', id: '/content/articles/example/file.pdf#page=2' };
    const news = { ...documents[0]!, type: 'news', id: '/news/20260921/' };
    fetchIndex.mockImplementation(async (url) => ({
      ok: true,
      json: async () => (url === '/pdf-search-index.json' ? [pdf] : [...documents, news]),
    }));
    await api.load();
    expect(fetchIndex).toHaveBeenCalledExactlyOnceWith('/search-index.json');
    expect(await api.search('印刷', 'news')).toMatchObject({ total: 1, groups: [{ type: 'news' }] });
    expect(await api.search('印刷', 'articles')).toMatchObject({ total: 25 });
    expect(await api.search('印刷', 'pdf')).toMatchObject({
      total: 1,
      groups: [{ id: pdf.id.split('#')[0], type: 'pdf', matches: [{ id: pdf.id }] }],
    });
    await api.search('申請', 'pdf');
    expect(fetchIndex).toHaveBeenCalledTimes(2);
  });

  it('does not download PDF data for an empty query and retries failures without losing article data', async () => {
    await api.load();
    await api.search('', 'pdf');
    expect(fetchIndex).toHaveBeenCalledTimes(1);
    fetchIndex.mockResolvedValueOnce({ ok: false });
    await expect(api.search('印刷', 'pdf')).rejects.toThrow('PDF search unavailable');
    expect(await api.search('印刷')).toMatchObject({ total: 25 });
    const pdf = { ...documents[0]!, type: 'pdf', id: '/content/articles/example/file.pdf#page=2' };
    fetchIndex.mockResolvedValueOnce({ ok: true, json: async () => [pdf] });
    expect(await api.search('印刷', 'pdf')).toMatchObject({ total: 1 });
    expect(fetchIndex).toHaveBeenCalledTimes(3);
  });
});
