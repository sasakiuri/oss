// @vitest-environment node
import { expose } from 'comlink';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchDocument } from '@/lib/content/types';
import { searchIndexFormatHeader, searchIndexRevisionHeader } from '@/lib/search-index-format';
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
const pdf: SearchDocument = { ...article, id: '/content/articles/example/file.pdf#page=2', type: 'pdf' };
let api: SearchWorkerApi;
let fetchIndex: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  vi.mocked(expose).mockClear();
  fetchIndex = vi.fn(async (url: string) =>
    Response.json(url === '/pdf-search-index.json' ? [pdf] : [article], {
      headers: { [searchIndexFormatHeader]: '1' },
    }),
  );
  vi.stubGlobal('fetch', fetchIndex);
  await import('@/lib/search.worker');
  api = vi.mocked(expose).mock.calls[0]![0] as SearchWorkerApi;
});

afterEach(() => vi.unstubAllGlobals());

describe('search deployment transitions', () => {
  it.each([null, '1'])('accepts legacy and additive data: %s', async (format) => {
    fetchIndex.mockResolvedValueOnce(
      Response.json([{ ...article, optionalFutureField: { source: 'Explicit context' } }], {
        headers: format === null ? {} : { [searchIndexFormatHeader]: format },
      }),
    );
    await api.load();
    expect(await api.search('印刷')).toMatchObject({
      total: 1,
      groups: [{ id: '/articles/example/', title: '文書ガイド', matches: [{ id: article.id }] }],
    });
    expect(fetchIndex).toHaveBeenCalledOnce();
  });

  it.each(['2', '', '1.0'])('rejects unsupported format %s before reading its body', async (format) => {
    const response = Response.json([pdf], { headers: { [searchIndexFormatHeader]: format } });
    const readBody = vi.spyOn(response, 'json');
    fetchIndex.mockResolvedValueOnce(response);
    await expect(api.search('印刷', 'pdf')).rejects.toMatchObject({ name: 'SearchIndexCompatibilityError' });
    expect(readBody).not.toHaveBeenCalled();
    expect((fetchIndex.mock.calls[0]![1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('keeps a healthy index when the other target advertises an incompatible format', async () => {
    await api.load();
    fetchIndex.mockResolvedValueOnce(Response.json([pdf], { headers: { [searchIndexFormatHeader]: '2' } }));
    await expect(api.search('印刷', 'pdf')).rejects.toMatchObject({ name: 'SearchIndexCompatibilityError' });
    expect(await api.search('印刷', 'articles')).toMatchObject({ total: 1 });
    expect(fetchIndex).toHaveBeenCalledTimes(2);
    // A later explicit request can use a corrected v1 deployment; there is no automatic retry.
    expect(await api.search('印刷', 'pdf')).toMatchObject({ total: 1 });
    expect(fetchIndex).toHaveBeenCalledTimes(3);
  });

  it.each(['http', 'json', 'schema'])('%s failures remain retryable', async (kind) => {
    const response =
      kind === 'http'
        ? new Response('', { status: 503, headers: { [searchIndexFormatHeader]: '2' } })
        : new Response(kind === 'json' ? 'invalid' : '{"documents":[]}', {
            headers: { [searchIndexFormatHeader]: '1' },
          });
    fetchIndex.mockResolvedValueOnce(response);
    await expect(api.load()).rejects.toMatchObject({ name: 'SearchIndexError', message: 'Search unavailable' });
    await expect(api.load()).resolves.toBeUndefined();
  });

  it('permits independent compatible revisions without silently refreshing a cached target', async () => {
    let changed = false;
    fetchIndex.mockImplementation(async (url: string) => {
      const isPdf = url === '/pdf-search-index.json';
      return Response.json([isPdf ? pdf : { ...article, title: changed ? '更新後' : article.title }], {
        headers: {
          [searchIndexFormatHeader]: '1',
          [searchIndexRevisionHeader]: (isPdf || changed ? 'b' : 'a').repeat(64),
        },
      });
    });
    await api.load();
    changed = true;
    expect(await api.search('印刷', 'pdf')).toMatchObject({ total: 1 });
    expect(await api.search('印刷', 'articles')).toMatchObject({ groups: [{ title: article.title }] });
    expect(fetchIndex).toHaveBeenCalledTimes(2);
  });
});
