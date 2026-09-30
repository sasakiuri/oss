import { expose } from 'comlink';

import { createSearchIndex, parseSearchDocuments } from './search';
import { SearchIndexCompatibilityError, SearchIndexError } from './search-errors';
import { assertSearchIndexFormat, searchIndexFormatHeader } from './search-index-format';
import { type SearchScope, type SearchWorkerApi } from './search-protocol';
import { createSearchSession } from './search-results';

type LoadedIndex = {
  index: ReturnType<typeof createSearchIndex>;
  metadata: Map<string, NonNullable<import('./content/types').SearchDocument['pdf']>>;
};
let index: Promise<LoadedIndex> | undefined;
let pdfIndex: Promise<LoadedIndex> | undefined;
let generation = 0;
let requestedSearch: { query: string; scope: SearchScope; generation: number } | undefined;
let lastSearch:
  | { query: string; scope: SearchScope; session: ReturnType<typeof createSearchSession>; generation: number }
  | undefined;

async function loadIndex(pdf = false) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // One deadline covers both response headers and the complete JSON body.
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Search index download deadline exceeded'));
    }, 15_000);
  });
  const download = async () => {
    const response = await fetch(pdf ? '/pdf-search-index.json' : '/search-index.json', {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Search index unavailable');
    try {
      assertSearchIndexFormat(response.headers?.get(searchIndexFormatHeader));
    } catch (error) {
      // Do not continue downloading a body that this reader cannot decode.
      controller.abort();
      throw error;
    }
    const data: unknown = await response.json();
    // A late response from a transport that ignores abort cannot populate a cache.
    controller.signal.throwIfAborted();
    const documents = parseSearchDocuments(data);
    if (documents.some((document) => (document.type === 'pdf') !== pdf)) throw new Error('Unexpected index type');
    return {
      index: createSearchIndex(documents),
      metadata: new Map(
        documents.flatMap((document) => (document.pdf ? [[document.id.split('#')[0]!, document.pdf] as const] : [])),
      ),
    };
  };
  try {
    return await Promise.race([download(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function getIndex(pdf = false) {
  const existing = pdf ? pdfIndex : index;
  if (existing) return existing;
  const pending = loadIndex(pdf).catch((error: unknown) => {
    // Clear only this failed attempt, never another target or a newer request.
    if (pdf && pdfIndex === pending) pdfIndex = undefined;
    if (!pdf && index === pending) index = undefined;
    if (error instanceof SearchIndexCompatibilityError) throw error;
    throw new SearchIndexError(pdf ? 'PDF search unavailable' : 'Search unavailable');
  });
  if (pdf) pdfIndex = pending;
  else index = pending;
  return pending;
}

expose({
  async load() {
    await getIndex();
  },
  async search(query: string, scope: SearchScope = 'all', offset = 0) {
    query = query.trim();
    if (!query) {
      requestedSearch = undefined;
      lastSearch = undefined;
      return { generation: ++generation, total: 0, totalMatches: 0, groups: [], nextOffset: null };
    }
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid search offset');
    if (requestedSearch?.query !== query || requestedSearch.scope !== scope)
      requestedSearch = { query, scope, generation: ++generation };
    const request = requestedSearch;
    const loaded = await getIndex(scope === 'pdf');
    if (requestedSearch !== request) throw new Error('Stale search request');
    if (lastSearch?.query !== query || lastSearch.scope !== scope || lastSearch.generation !== request.generation) {
      const results = loaded.index.search(query, {
        filter: (result) => scope === 'all' || result.type === scope,
      });
      const current = request.generation;
      lastSearch = {
        query,
        scope,
        generation: current,
        session: createSearchSession(results, query, current, loaded.metadata),
      };
    }
    return lastSearch.session.page(offset);
  },
  async matches(requestGeneration: number, id: string, offset: number) {
    if (!lastSearch || requestGeneration !== lastSearch.generation || requestGeneration !== requestedSearch?.generation)
      throw new Error('Stale search continuation');
    return lastSearch.session.matches(id, offset);
  },
} satisfies SearchWorkerApi);
