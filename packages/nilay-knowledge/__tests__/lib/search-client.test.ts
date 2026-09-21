// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSearchClient } from '@/lib/search-client';
import type { SearchResults, SearchWorkerApi } from '@/lib/search-protocol';

import { TestWorker } from '../support/worker';

let worker: TestWorker;
let api: SearchWorkerApi;
const results: SearchResults = { total: 0, hits: [] };

beforeEach(() => {
  api = { load: vi.fn(async () => {}), search: vi.fn(async () => results) };
  worker = new TestWorker(api);
  vi.stubGlobal(
    'Worker',
    vi.fn(function () {
      return worker;
    }),
  );
});

afterEach(() => {
  worker.terminate();
  vi.unstubAllGlobals();
});

describe('search worker client with real Comlink transport', () => {
  it('correlates concurrent requests even when responses arrive out of order', async () => {
    const first = Promise.withResolvers<SearchResults>();
    const second = Promise.withResolvers<SearchResults>();
    vi.mocked(api.search).mockImplementation((query) => (query === '印刷' ? first.promise : second.promise));
    const client = createSearchClient();
    const load = client.load();
    const firstSearch = client.search('印刷');
    const secondSearch = client.search('所持許可');
    await vi.waitFor(() => expect(api.search).toHaveBeenCalledTimes(2));
    second.resolve({ total: 4, hits: [] });
    await expect(secondSearch).resolves.toEqual({ total: 4, hits: [] });
    first.resolve(results);
    await expect(firstSearch).resolves.toEqual(results);
    await expect(load).resolves.toBeUndefined();
    expect(api.search).toHaveBeenNthCalledWith(1, '印刷');
    expect(api.search).toHaveBeenNthCalledWith(2, '所持許可');
    client.dispose();
  });

  it('propagates remote exceptions and allows retrying', async () => {
    vi.mocked(api.load).mockRejectedValueOnce(new Error('Search unavailable'));
    const client = createSearchClient();
    await expect(client.load()).rejects.toThrow('Search unavailable');
    await expect(client.load()).resolves.toBeUndefined();
    await expect(client.search('印刷')).resolves.toEqual(results);
    client.dispose();
  });

  it.each(['dispose', 'error', 'messageerror'] as const)(
    'rejects pending and future requests after %s',
    async (reason) => {
      const pending = Promise.withResolvers<SearchResults>();
      vi.mocked(api.search).mockReturnValue(pending.promise);
      const client = createSearchClient();
      const search = client.search('印刷');
      const rejected = search.catch((error: unknown) => error);
      await vi.waitFor(() => expect(api.search).toHaveBeenCalledOnce());
      if (reason === 'dispose') client.dispose();
      else worker.dispatchEvent(new Event(reason));
      expect(await rejected).toEqual(new Error('Search worker stopped'));
      expect(worker.terminate).toHaveBeenCalledOnce();
      await expect(client.search('次の検索')).rejects.toThrow('Search worker stopped');
      await expect(client.load()).rejects.toThrow('Search worker stopped');
      client.dispose();
      expect(worker.terminate).toHaveBeenCalledOnce();
      pending.resolve(results);
    },
  );

  it('rejects postMessage failures and can accept a later request', async () => {
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('Cannot post message');
    });
    const client = createSearchClient();
    await expect(client.load()).rejects.toThrow('Cannot post message');
    await expect(client.load()).resolves.toBeUndefined();
    client.dispose();
  });

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
