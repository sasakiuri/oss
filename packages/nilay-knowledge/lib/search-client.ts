import type { SearchScope, SearchWorkerApi } from './search-protocol';
import { createWorkerClient } from './worker-client';

/** One lazily-created worker per mounted site header; no index work on the UI thread. */
export function createSearchClient() {
  const client = createWorkerClient<SearchWorkerApi>(
    new Worker(new URL('./search.worker.ts', import.meta.url)),
    'Search worker stopped',
  );

  return {
    load: () => client.call((api) => api.load()),
    search: (query: string, scope?: SearchScope, offset?: number) =>
      client.call((api) =>
        offset !== undefined
          ? api.search(query, scope, offset)
          : scope === undefined
            ? api.search(query)
            : api.search(query, scope),
      ),
    dispose: () => client.dispose(),
  };
}
