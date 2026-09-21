import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSearchClient } from '@/lib/search-client';
import type { SearchResponse, SearchResults } from '@/lib/search-protocol';

function fakeWorker() {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null as ((event: MessageEvent<SearchResponse>) => void) | null,
    onerror: null as (() => void) | null,
    onmessageerror: null as (() => void) | null,
  };
}

let worker: ReturnType<typeof fakeWorker>;
const results: SearchResults = { total: 0, hits: [] };

beforeEach(() => {
  worker = fakeWorker();
  vi.stubGlobal(
    'Worker',
    vi.fn(function () {
      return worker;
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function reply(response: SearchResponse) {
  worker.onmessage?.({ data: response } as MessageEvent<SearchResponse>);
}

describe('search worker client', () => {
  it('correlates concurrent requests even when responses arrive out of order', async () => {
    const client = createSearchClient();
    const load = client.load();
    const first = client.search('印刷');
    const second = client.search('所持許可');
    expect(worker.postMessage.mock.calls.map(([request]) => request)).toEqual([
      { id: 1, query: undefined },
      { id: 2, query: '印刷' },
      { id: 3, query: '所持許可' },
    ]);
    reply({ id: 100, error: 'Unrelated response' });
    reply({ id: 3, results: { total: 4, hits: [] } });
    reply({ id: 1, ready: true });
    reply({ id: 2, results });
    await expect(load).resolves.toBeUndefined();
    await expect(first).resolves.toEqual(results);
    await expect(second).resolves.toEqual({ total: 4, hits: [] });
    client.dispose();
  });

  it('rejects worker-reported errors and unexpected search responses', async () => {
    const client = createSearchClient();
    const failedLoad = client.load();
    reply({ id: 1, error: 'Search unavailable' });
    await expect(failedLoad).rejects.toThrow('Search unavailable');
    const invalidSearch = client.search('印刷');
    reply({ id: 2, ready: true });
    await expect(invalidSearch).rejects.toThrow('Invalid search response');
    client.dispose();
  });

  it.each(['dispose', 'onerror', 'onmessageerror'] as const)(
    'rejects pending and future requests after %s',
    async (reason) => {
      const client = createSearchClient();
      const load = client.load();
      const search = client.search('印刷');
      if (reason === 'dispose') client.dispose();
      else worker[reason]?.();
      await expect(load).rejects.toThrow('Search worker stopped');
      await expect(search).rejects.toThrow('Search worker stopped');
      expect(worker.terminate).toHaveBeenCalledOnce();
      await expect(client.search('次の検索')).rejects.toThrow('Search worker stopped');
      await expect(client.load()).rejects.toThrow('Search worker stopped');
      expect(worker.postMessage).toHaveBeenCalledTimes(2);
      reply({ id: 1, ready: true });
    },
  );

  it.each([new Error('Cannot post message'), 'unavailable'])(
    'rejects synchronous postMessage failures and can accept a later request',
    async (error) => {
      worker.postMessage.mockImplementationOnce(() => {
        throw error;
      });
      const client = createSearchClient();
      await expect(client.load()).rejects.toThrow(error instanceof Error ? error.message : 'Search worker unavailable');
      const retry = client.load();
      reply({ id: 2, ready: true });
      await expect(retry).resolves.toBeUndefined();
      client.dispose();
    },
  );

  it('propagates worker construction failures', () => {
    vi.stubGlobal(
      'Worker',
      vi.fn(function () {
        throw new Error('Worker blocked');
      }),
    );
    expect(createSearchClient).toThrow('Worker blocked');
  });
});
