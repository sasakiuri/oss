import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { newsRepository } from '@/features/news/server/repository';

const content = {
  id: '9HxUJ3aSPnSBXVbKFGZm',
  title: 'お知らせ',
  summary: '<p>本文</p>',
  date: '2021-02-16T15:00:00.000Z',
};
const fetchMock = vi.fn<typeof fetch>();

describe('microCMS news repository', () => {
  beforeEach(() => {
    vi.stubEnv('MICROCMS_SERVICE_DOMAIN', 'nilay-about-test');
    vi.stubEnv('MICROCMS_API_KEY', 'test-api-key');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('loads without credentials and only checks configuration on requests', async () => {
    vi.stubEnv('MICROCMS_SERVICE_DOMAIN', '');
    vi.stubEnv('MICROCMS_API_KEY', '');
    await expect(import('@/features/news/server/repository')).resolves.toBeDefined();
    await expect(newsRepository.list({ limit: 20, offset: 0 })).rejects.toThrow('configuration');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['https://example.com', 'example.com', 'user@host', '../other', '-invalid', 'invalid-'])(
    'rejects an invalid service domain %s before sending the API key',
    async (domain) => {
      vi.stubEnv('MICROCMS_SERVICE_DOMAIN', domain);
      await expect(newsRepository.list({ limit: 20, offset: 0 })).rejects.toThrow('configuration');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('requests the selected page in date order and keeps the existing response model', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ contents: [{ ...content, createdAt: 'private metadata' }], totalCount: 9 }),
    );
    expect(await newsRepository.list({ limit: 5, offset: 2 })).toEqual([{ ...content, date: new Date(content.date) }]);
    const [url, options] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.origin).toBe('https://nilay-about-test.microcms.io');
    expect(parsed.pathname).toBe('/api/v1/news');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      fields: 'id,title,summary,date',
      limit: '5',
      offset: '2',
      orders: '-date,-createdAt',
    });
    expect(options).toMatchObject({
      headers: { 'X-MICROCMS-API-KEY': 'test-api-key' },
      cache: 'no-store',
      redirect: 'error',
    });
    expect(options?.signal).toBeDefined();
  });

  it('preserves mixed-case IDs when loading a detail', async () => {
    fetchMock.mockResolvedValue(Response.json(content));
    expect(await newsRepository.find(content.id)).toEqual({ ...content, date: new Date(content.date) });
    expect(new URL(String(fetchMock.mock.calls[0]![0])).pathname).toBe(`/api/v1/news/${content.id}`);
  });

  it.each(['', '..', '../news', 'id?draftKey=secret', 'id/another', 'id#fragment'])(
    'does not request invalid content ID %s',
    async (id) => {
      expect(await newsRepository.find(id)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('returns null only for a missing detail', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    expect(await newsRepository.find('missing')).toBeNull();
    await expect(newsRepository.list({ limit: 20, offset: 0 })).rejects.toThrow('404');
  });

  it.each([401, 403, 429, 500, 503])('propagates upstream HTTP %i without its body', async (status) => {
    fetchMock.mockResolvedValue(new Response('private upstream details', { status }));
    await expect(newsRepository.find(content.id)).rejects.toThrow(`microCMS request failed (${status})`);
    await expect(newsRepository.list({ limit: 20, offset: 0 })).rejects.toThrow(`microCMS request failed (${status})`);
  });

  it('propagates network and timeout failures', async () => {
    fetchMock.mockRejectedValue(new DOMException('Request timed out', 'TimeoutError'));
    await expect(newsRepository.list({ limit: 20, offset: 0 })).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it.each([{ contents: [{ ...content, date: 'invalid' }] }, { contents: [{ ...content, summary: null }] }, {}])(
    'rejects malformed content instead of returning partial results',
    async (body) => {
      fetchMock.mockResolvedValue(Response.json(body));
      await expect(newsRepository.list({ limit: 20, offset: 0 })).rejects.toThrow();
    },
  );

  it('rejects a detail with the wrong ID', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...content, id: 'another' }));
    await expect(newsRepository.find(content.id)).rejects.toThrow('unexpected news ID');
  });
});
