import type { SearchRequest, SearchResponse, SearchResults } from './search-protocol';

/** One lazily-created worker per mounted site header; no index work on the UI thread. */
export function createSearchClient() {
  const worker = new Worker(new URL('./search.worker.ts', import.meta.url));
  let sequence = 0;
  let stopped = false;
  const pending = new Map<number, { resolve: (value: SearchResponse) => void; reject: (error: Error) => void }>();

  function dispose() {
    stopped = true;
    worker.terminate();
    for (const request of pending.values()) request.reject(new Error('Search worker stopped'));
    pending.clear();
  }

  worker.onerror = dispose;
  worker.onmessageerror = dispose;
  worker.onmessage = (event: MessageEvent<SearchResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if ('error' in response) request.reject(new Error(response.error));
    else request.resolve(response);
  };

  function request(query?: string): Promise<SearchResponse> {
    if (stopped) return Promise.reject(new Error('Search worker stopped'));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, query } satisfies SearchRequest);
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error('Search worker unavailable'));
      }
    });
  }

  return {
    async load() {
      await request();
    },
    async search(query: string): Promise<SearchResults> {
      const response = await request(query);
      if (!('results' in response)) throw new Error('Invalid search response');
      return response.results;
    },
    dispose,
  };
}
