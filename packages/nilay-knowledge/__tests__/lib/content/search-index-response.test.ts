// @vitest-environment node
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { searchDocumentsSchema } from '@/lib/content/schemas';
import { createSearchIndexResponse } from '@/lib/content/search-index-response';
import type { SearchDocument } from '@/lib/content/types';
import { searchIndexFormatHeader, searchIndexRevisionHeader } from '@/lib/search-index-format';

const article: SearchDocument = {
  id: '/articles/example/#print',
  type: 'articles',
  title: '文書ガイド',
  section: '印刷の準備',
  tags: [],
  text: '印刷する前に確認します。',
};
const pdf: SearchDocument = { ...article, id: '/content/articles/example/file.pdf#page=2', type: 'pdf' };

describe('backward-compatible index responses', () => {
  it.each([article, pdf])('retains the v1 array and destinations for %s', async (document) => {
    const response = createSearchIndexResponse([document]);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get(searchIndexFormatHeader)).toBe('1');
    const body = await response.text();
    // Independently fixed v1 body expectation: a reader that ignores new headers still sees its array.
    expect(body).toBe(JSON.stringify([document]));
    expect(JSON.parse(body)).toEqual([document]);
    expect(response.headers.get(searchIndexRevisionHeader)).toBe(createHash('sha256').update(body).digest('hex'));
  });

  it('retains compatible additive fields and the existing legacy validation contract', async () => {
    const additive = { ...article, optionalFutureField: { label: 'Extra context' } };
    const payload = await createSearchIndexResponse([additive]).json();
    expect(payload).toEqual([additive]);
    expect(searchDocumentsSchema.parse(payload)).toEqual([additive]);
  });

  it('makes revisions deterministic and independent from format identity', async () => {
    const first = createSearchIndexResponse([article]);
    const same = createSearchIndexResponse([article]);
    const changed = createSearchIndexResponse([{ ...article, text: '更新した本文。' }]);
    expect(first.headers.get(searchIndexRevisionHeader)).toBe(same.headers.get(searchIndexRevisionHeader));
    expect(changed.headers.get(searchIndexRevisionHeader)).not.toBe(first.headers.get(searchIndexRevisionHeader));
    expect(changed.headers.get(searchIndexFormatHeader)).toBe(first.headers.get(searchIndexFormatHeader));
    expect(await same.text()).toBe(await first.text());
    expect(await changed.json()).toEqual([{ ...article, text: '更新した本文。' }]);
  });

  it('refuses malformed data and duplicate destinations instead of publishing invalid v1 output', () => {
    expect(() => createSearchIndexResponse([article, article])).toThrow('Duplicate search destination');
    expect(() => createSearchIndexResponse([{ ...article, id: 'https://example.com/private' }])).toThrow(
      'Invalid search destination',
    );
    expect(() => createSearchIndexResponse({ documents: [article] } as unknown as SearchDocument[])).toThrow();
  });
});
