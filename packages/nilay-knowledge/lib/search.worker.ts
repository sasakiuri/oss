import { expose } from 'comlink';

import { createSearchIndex, parseSearchDocuments, searchExcerpt } from './search';
import type { SearchWorkerApi } from './search-protocol';

let index: Promise<ReturnType<typeof createSearchIndex>> | undefined;

async function loadIndex() {
  const response = await fetch('/search-index.json');
  if (!response.ok) throw new Error('Search index unavailable');
  return createSearchIndex(parseSearchDocuments(await response.json()));
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

expose({
  async load() {
    await getIndex();
  },
  async search(query: string) {
    const loaded = await getIndex();
    const results = loaded.search(query.trim());
    return {
      total: results.length,
      hits: results.slice(0, 20).map((result) => ({
        id: String(result.id),
        type: result.type,
        title: String(result.title),
        section: String(result.section),
        excerpt: searchExcerpt(String(result.text), query),
      })),
    };
  },
} satisfies SearchWorkerApi);
