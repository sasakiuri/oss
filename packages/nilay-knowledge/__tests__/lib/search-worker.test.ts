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
    expect(first.groups.find((group) => group.id === '/articles/example-0/')?.matches).toHaveLength(1);
    expect(first.groups.find((group) => group.id === '/articles/example-0/')?.totalMatches).toBe(31);
    const second = await api.search('印刷', 'all', first.nextOffset!);
    expect(second).toMatchObject({ total: 25, totalMatches: 55, nextOffset: null });
    expect(second.groups).toHaveLength(5);
    const pages = [...first.groups, ...second.groups];
    expect(new Set(pages.map((group) => group.id)).size).toBe(25);
    const ids = pages.flatMap((group) => group.matches.map((match) => match.id));
    for (const group of pages) {
      let offset = group.nextMatchOffset;
      while (offset !== null) {
        const page = await api.matches(first.generation, group.id, offset);
        ids.push(...page.matches.map((match) => match.id));
        offset = page.nextOffset;
      }
    }
    expect(ids).toHaveLength(55);
    expect(new Set(ids).size).toBe(55);
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
    const more = await api.matches(response.generation, response.groups[0]!.id, 1);
    expect([...response.groups[0]!.matches, ...more.matches].map((match) => match.id).sort()).toEqual(
      pdfPages.map((page) => page.id),
    );
  });

  it('matches Japanese search ordering, totals and excerpts while paginating twenty distinct pages', async () => {
    const index = createSearchIndex(documents);
    for (const query of ['印刷', '所持許可', '資料', 'ＵＳＢ', '印刷 申請', '存在しない', '']) {
      const expected = index.search(query.trim());
      expect(await api.search(query)).toEqual({
        generation: expect.any(Number),
        total: expected.length,
        totalMatches: expected.length,
        nextOffset: expected.length > 20 ? 20 : null,
        groups: expected.slice(0, 20).map((result) => ({
          id: String(result.id).split('#')[0],
          type: result.type,
          title: String(result.title),
          totalMatches: 1,
          nextMatchOffset: null,
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
    expect(fetchIndex).toHaveBeenCalledExactlyOnceWith('/search-index.json', { signal: expect.any(AbortSignal) });
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
    expect(fetchIndex).toHaveBeenCalledExactlyOnceWith('/search-index.json', { signal: expect.any(AbortSignal) });
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
  it('shares one PDF record with results from any matching page', async () => {
    const metadata = {
      status: 'unverified' as const,
      references: [
        { title: 'First article', url: '/articles/first/' },
        { title: 'Second article', url: '/articles/second/' },
      ],
    };
    fetchIndex.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          ...documents[0]!,
          id: '/content/assets/shared.pdf#page=1',
          type: 'pdf',
          text: 'unrelated',
          title: 'PDF',
          section: '1',
          tags: [],
          pdf: metadata,
        },
        {
          ...documents[0]!,
          id: '/content/assets/shared.pdf#page=2',
          type: 'pdf',
          title: 'PDF',
          section: '2',
          tags: [],
        },
      ],
    });
    const response = await api.search('印刷', 'pdf');
    expect(response.groups[0]?.pdf).toEqual(metadata);
    expect(response.groups[0]?.matches[0]?.id).toBe('/content/assets/shared.pdf#page=2');
  });
  it('bounds a 500-page document and keeps every ordered match reachable', async () => {
    const pages = Array.from({ length: 500 }, (_, i) => ({
      ...documents[0]!,
      type: 'pdf',
      id: `/content/assets/long.pdf#page=${i + 1}`,
    }));
    fetchIndex.mockResolvedValueOnce({ ok: true, json: async () => pages });
    const first = await api.search('印刷', 'pdf');
    expect(first).toMatchObject({ total: 1, totalMatches: 500, groups: [{ totalMatches: 500, nextMatchOffset: 1 }] });
    expect(first.groups[0]!.matches).toHaveLength(1);
    const ordered = first.groups[0]!.matches.map((match) => match.id);
    let offset = 1;
    while (offset) {
      const page = await api.matches(first.generation, first.groups[0]!.id, offset);
      expect(page.matches.length).toBeLessThanOrEqual(20);
      ordered.push(...page.matches.map((match) => match.id));
      offset = page.nextOffset ?? 0;
    }
    const expected = createSearchIndex(pages as SearchDocument[])
      .search('印刷')
      .map((match) => String(match.id));
    expect(ordered).toEqual(expected);
    expect(new Set(ordered).size).toBe(500);
  });

  it('isolates continuation generations, concurrent groups, scope changes and empty queries', async () => {
    const duplicate = { ...documents[0]!, id: '/articles/example-0/#extra' };
    fetchIndex.mockResolvedValueOnce({ ok: true, json: async () => [...documents, duplicate] });
    const first = await api.search('印刷');
    const group = first.groups.find((group) => group.totalMatches > 1)!;
    const [one, two] = await Promise.all([
      api.matches(first.generation, group.id, 1),
      api.matches(first.generation, group.id, 1),
    ]);
    expect(one).toEqual(two);
    const scoped = await api.search('印刷', 'articles');
    await expect(api.matches(first.generation, group.id, 1)).rejects.toThrow('Stale search continuation');
    await expect(api.matches(scoped.generation, 'unknown', 1)).rejects.toThrow('Unknown search document');
    await expect(api.matches(scoped.generation, group.id, -1)).rejects.toThrow('Invalid search offset');
    expect((await api.matches(scoped.generation, group.id, 1)).matches).toHaveLength(1);
    await api.search('');
    await expect(api.matches(scoped.generation, group.id, 1)).rejects.toThrow('Stale search continuation');
  });
  it('does not replace a newer article continuation with a late PDF search', async () => {
    const articles = [...documents, { ...documents[0]!, id: '/articles/example-0/#extra' }];
    fetchIndex.mockResolvedValueOnce({ ok: true, json: async () => articles });
    await api.load();
    const download = Promise.withResolvers<{ ok: boolean; json: () => Promise<unknown> }>();
    fetchIndex.mockReturnValueOnce(download.promise);
    const late = api.search('印刷', 'pdf').catch((error: unknown) => error);
    const current = await api.search('印刷', 'articles');
    download.resolve({
      ok: true,
      json: async () => [{ ...documents[0]!, type: 'pdf', id: '/content/assets/late.pdf#page=1' }],
    });
    await expect(late).resolves.toMatchObject({ message: 'Stale search request' });
    const group = current.groups.find((group) => group.totalMatches === 2)!;
    expect((await api.matches(current.generation, group.id, 1)).matches).toHaveLength(1);
  });
});
