import MiniSearch from 'minisearch';

import { searchDocumentsSchema } from './content/schemas';
import type { SearchDocument } from './content/types';

// Based on saika-docs: normalize full-width text and use stable Japanese bigrams.
function tokenize(text: string): string[] {
  return text
    .normalize('NFKC')
    .split(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+)/u)
    .flatMap((word) => {
      // Split Japanese runs first so USB接続 and 2024年 retain their Latin/numeric tokens.
      if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(word))
        return word.match(/[\p{L}\p{N}_]+/gu) ?? [];
      const characters = Array.from(word);
      return [...characters, ...characters.slice(1).map((character, i) => characters[i] + character)];
    });
}

export function createSearchIndex(documents: SearchDocument[]) {
  const index = new MiniSearch<SearchDocument>({
    fields: ['title', 'section', 'tags', 'text'],
    storeFields: ['type', 'title', 'section', 'text'],
    extractField: (document, field) =>
      field === 'tags' ? document.tags.join(' ') : document[field as keyof SearchDocument],
    tokenize,
    searchOptions: { prefix: true, combineWith: 'AND', boost: { title: 4, section: 6, tags: 3, text: 1 } },
  });
  index.addAll(documents);
  return index;
}

/** Validate the fetched index, including destinations, before rendering links. */
export function parseSearchDocuments(value: unknown): SearchDocument[] {
  const result = searchDocumentsSchema.safeParse(value);
  if (!result.success) {
    throw new Error(result.error.issues[0]!.path.length === 0 ? 'Invalid search index' : 'Invalid search document');
  }
  return result.data;
}

export function searchExcerpt(text: string, query: string): string {
  const normalized = text.normalize('NFKC');
  const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/);
  const positions = terms.map((term) => normalized.toLowerCase().indexOf(term)).filter((position) => position >= 0);
  const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 40);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, start + 160)}${normalized.length > start + 160 ? '…' : ''}`;
}
