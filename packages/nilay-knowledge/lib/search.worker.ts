import { expose } from 'comlink';

import { createSearchIndex, parseSearchDocuments, searchExcerpt } from './search';
import { SearchIndexCompatibilityError, SearchIndexError } from './search-errors';
import { assertSearchIndexFormat, searchIndexFormatHeader } from './search-index-format';
import { searchPageSize, type SearchGroup, type SearchScope, type SearchWorkerApi } from './search-protocol';

type LoadedIndex = {
  index: ReturnType<typeof createSearchIndex>;
  metadata: Map<string, NonNullable<import('./content/types').SearchDocument['pdf']>>;
};
let index: Promise<LoadedIndex> | undefined;
let pdfIndex: Promise<LoadedIndex> | undefined;
let lastSearch: { query: string; scope: SearchScope; groups: SearchGroup[]; totalMatches: number } | undefined;

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
    if (!query) return { total: 0, totalMatches: 0, groups: [], nextOffset: null };
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid search offset');
    const loaded = await getIndex(scope === 'pdf');
    if (lastSearch?.query !== query || lastSearch.scope !== scope) {
      const results = loaded.index.search(query, {
        filter: (result) => scope === 'all' || result.type === scope,
      });
      const groups = new Map<string, SearchGroup>();
      for (const result of results) {
        const id = String(result.id);
        const page = id.split('#')[0]!;
        let group = groups.get(page);
        if (!group) {
          group = { id: page, type: result.type, title: String(result.title), matches: [] };
          const metadata = loaded.metadata.get(page);
          if (metadata) group.pdf = metadata;
          groups.set(page, group);
        }
        group.matches.push({
          id,
          section: String(result.section),
          excerpt: searchExcerpt(String(result.text), query),
        });
      }
      // Map insertion order ranks each page by its most relevant matching section.
      lastSearch = { query, scope, groups: [...groups.values()], totalMatches: results.length };
    }
    const total = lastSearch.groups.length;
    return {
      total,
      totalMatches: lastSearch.totalMatches,
      groups: lastSearch.groups.slice(offset, offset + searchPageSize),
      nextOffset: offset + searchPageSize < total ? offset + searchPageSize : null,
    };
  },
} satisfies SearchWorkerApi);
