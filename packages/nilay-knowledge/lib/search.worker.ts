import { expose } from 'comlink';

import { createSearchIndex, parseSearchDocuments, searchExcerpt } from './search';
import { searchPageSize, type SearchGroup, type SearchScope, type SearchWorkerApi } from './search-protocol';

let index: Promise<ReturnType<typeof createSearchIndex>> | undefined;
let pdfIndex: Promise<ReturnType<typeof createSearchIndex>> | undefined;
let lastSearch: { query: string; scope: SearchScope; groups: SearchGroup[]; totalMatches: number } | undefined;

async function loadIndex(pdf = false) {
  const response = await fetch(pdf ? '/pdf-search-index.json' : '/search-index.json');
  if (!response.ok) throw new Error('Search index unavailable');
  const documents = parseSearchDocuments(await response.json());
  if (documents.some((document) => (document.type === 'pdf') !== pdf)) throw new Error('Unexpected index type');
  return createSearchIndex(documents);
}

async function getIndex() {
  try {
    index ??= loadIndex();
    return await index;
  } catch {
    index = undefined;
    throw new Error('Search unavailable');
  }
}

async function getPdfIndex() {
  try {
    pdfIndex ??= loadIndex(true);
    return await pdfIndex;
  } catch {
    pdfIndex = undefined;
    throw new Error('PDF search unavailable');
  }
}

expose({
  async load() {
    await getIndex();
  },
  async search(query: string, scope: SearchScope = 'all', offset = 0) {
    query = query.trim();
    if (!query) return { total: 0, totalMatches: 0, groups: [], nextOffset: null };
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid search offset');
    const loaded = await (scope === 'pdf' ? getPdfIndex() : getIndex());
    if (lastSearch?.query !== query || lastSearch.scope !== scope) {
      const results = loaded.search(query, {
        filter: (result) => scope === 'all' || result.type === scope,
      });
      const groups = new Map<string, SearchGroup>();
      for (const result of results) {
        const id = String(result.id);
        const page = id.split('#')[0]!;
        let group = groups.get(page);
        if (!group) {
          group = { id: page, type: result.type, title: String(result.title), matches: [] };
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
