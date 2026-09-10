// SPDX-License-Identifier: MIT
import MiniSearch from 'minisearch';

import type { SearchDocument } from '@/entities/document/model';

export function createSearchIndex(documents: SearchDocument[]) {
  const index = new MiniSearch<SearchDocument>({
    fields: ['title', 'section', 'text'],
    storeFields: ['title', 'section', 'text'],
    // Browser ICU dictionaries segment compound Japanese words differently.
    // Stable bigrams also find terms within compounds such as 「射座番号」.
    tokenize: (text) =>
      (
        text.normalize('NFKC').match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+|[\p{L}\p{N}_]+/gu) ?? []
      ).flatMap((word) => {
        if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)) return [word];
        const characters = Array.from(word);
        return characters.length < 2
          ? characters
          : characters.slice(1).map((character, i) => characters[i] + character);
      }),
    searchOptions: { prefix: true, fuzzy: 0.1, boost: { title: 4, section: 6, text: 1 } },
  });
  index.addAll(documents);
  return index;
}
