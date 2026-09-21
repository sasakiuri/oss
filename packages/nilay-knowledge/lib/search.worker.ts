import { expose } from 'comlink';

import { createSearchIndex, parseSearchDocuments, searchExcerpt } from './search';
import type { SearchScope, SearchWorkerApi } from './search-protocol';

let index: Promise<ReturnType<typeof createSearchIndex>> | undefined;
let pdfIndex: Promise<ReturnType<typeof createSearchIndex>> | undefined;

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
  async search(query: string, scope: SearchScope = 'all') {
    if (!query.trim()) return { total: 0, hits: [] };
    const loaded = await (scope === 'pdf' ? getPdfIndex() : getIndex());
    const results = loaded.search(query.trim(), {
      filter: (result) => scope === 'all' || result.type === scope,
    });
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
