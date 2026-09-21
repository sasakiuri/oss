import { createSearchIndex, parseSearchDocuments, searchExcerpt } from './search';
import type { SearchRequest, SearchResponse } from './search-protocol';

let index: Promise<ReturnType<typeof createSearchIndex>> | undefined;

async function loadIndex() {
  const response = await fetch('/search-index.json');
  if (!response.ok) throw new Error('Search index unavailable');
  return createSearchIndex(parseSearchDocuments(await response.json()));
}

self.onmessage = async (event: MessageEvent<SearchRequest>) => {
  const { id, query } = event.data;
  let response: SearchResponse;
  try {
    index ??= loadIndex();
    const loaded = await index;
    if (query === undefined) response = { id, ready: true };
    else {
      const results = loaded.search(query.trim());
      response = {
        id,
        results: {
          total: results.length,
          hits: results.slice(0, 20).map((result) => ({
            id: String(result.id),
            type: result.type,
            title: String(result.title),
            section: String(result.section),
            excerpt: searchExcerpt(String(result.text), query),
          })),
        },
      };
    }
  } catch {
    index = undefined;
    response = { id, error: 'Search unavailable' };
  }
  self.postMessage(response);
};
