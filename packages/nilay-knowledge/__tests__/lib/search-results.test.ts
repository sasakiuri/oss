// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createSearchIndex } from '@/lib/search';
import { createSearchSession } from '@/lib/search-results';

it('generates only visible excerpts and requested continuation batches', () => {
  const documents = Array.from({ length: 500 }, (_, i) => ({
    id: `/content/assets/long.pdf#page=${i + 1}`,
    type: 'pdf' as const,
    title: 'PDF',
    section: `${i + 1}`,
    tags: [],
    text: '申請 '.repeat(100),
  }));
  const excerpt = vi.fn(() => '申請');
  const session = createSearchSession(createSearchIndex(documents).search('申請'), '申請', 1, new Map(), excerpt);
  expect(excerpt).not.toHaveBeenCalled();
  expect(session.page().groups[0]!.matches).toHaveLength(1);
  expect(excerpt).toHaveBeenCalledTimes(1);
  expect(session.matches('/content/assets/long.pdf', 1).matches).toHaveLength(20);
  expect(excerpt).toHaveBeenCalledTimes(21);
});

describe('independent relevance examples', () => {
  const index = createSearchIndex([
    {
      id: '/articles/renewal/#procedure',
      type: 'articles',
      title: '所持許可の更新',
      section: '更新手順',
      tags: ['申請'],
      text: '所持許可の更新申請を行います。',
    },
    {
      id: '/articles/printer/#usb',
      type: 'articles',
      title: 'プリンター設定',
      section: 'USB 接続',
      tags: ['印刷'],
      text: 'USB ケーブルで接続して申請書を印刷します。',
    },
    { id: '/news/update/', type: 'news', title: 'サイト更新', section: '', tags: [], text: '更新のお知らせです。' },
  ]);
  // Editor-defined destinations; no engine call creates the expected answers.
  it.each([
    ['所持許可 更新', 'articles', '/articles/renewal/'],
    ['ＵＳＢ 接続', 'articles', '/articles/printer/'],
    ['更新', 'news', '/news/update/'],
  ])('finds the intended destination for %s in %s', (query, scope, destination) => {
    const results = createSearchSession(
      index.search(query, { filter: (result) => result.type === scope }),
      query,
      1,
    ).page();
    expect(results.groups.slice(0, 3).map((group) => group.id)).toContain(destination);
  });
});
