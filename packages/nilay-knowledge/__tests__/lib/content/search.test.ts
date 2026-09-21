import { describe, expect, it } from 'vitest';

import { renderContent, renderSearchDocuments } from '@/lib/content/render';
import type { ContentSource, SearchDocument } from '@/lib/content/types';
import { createSearchIndex, parseSearchDocuments, searchExcerpt } from '@/lib/search';

const source: ContentSource = {
  type: 'articles',
  slug: 'example',
  frontmatter: { title: '文書の案内', published: '2024-01-01', tags: ['手続き'] },
  content: `前書きの本文です。

## **申請書類**
必要な書類をダウンロードできます。

## **申請書類**
こちらは再発行の手続きです。

### 印刷の準備
プリンターの USB 接続を確認します。

<div><h2 id="custom">別の資料</h2><p>HTML の<strong>表示内容</strong>です。</p></div>
<script>secretScript</script><style>secretStyle</style>
<p hidden>secretHidden</p><p aria-hidden="true">secretAria</p>

![図の説明](image.png)
`,
};

describe('search content', () => {
  it('indexes visible text and section destinations from the real Markdown pipeline', async () => {
    const documents = parseSearchDocuments(await renderSearchDocuments(source));
    const { html } = await renderContent(source);
    const page = new DOMParser().parseFromString(html, 'text/html');
    expect(documents).toHaveLength(5);
    expect(documents[0]).toMatchObject({ id: '/articles/example/', text: '前書きの本文です。' });
    expect(documents[1]).toMatchObject({ section: '申請書類', text: '申請書類 必要な書類をダウンロードできます。' });
    expect(documents[2]?.id).not.toBe(documents[1]?.id);
    for (const document of documents.slice(1)) {
      const fragment = new URL(document.id, 'https://example.com').hash.slice(1);
      expect(page.getElementById(decodeURIComponent(fragment))).not.toBeNull();
    }
    const text = documents.map((document) => document.text).join(' ');
    expect(text).toContain('HTML の表示内容です。');
    expect(text).toContain('図の説明');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('image.png');
    expect(text).not.toContain('**');
  });

  it('finds Japanese compounds, single characters, tags, normalized English and news', async () => {
    const documents = await renderSearchDocuments(source);
    const news = await renderSearchDocuments({
      ...source,
      type: 'news',
      slug: 'announcement',
      frontmatter: { ...source.frontmatter, title: 'サイト更新' },
      content: '更新のお知らせです。',
    });
    const index = createSearchIndex([...documents, ...news]);
    expect(index.search('申請')[0]?.section).toBe('申請書類');
    expect(index.search('印刷 ＵＳＢ')[0]?.section).toBe('印刷の準備');
    expect(index.search('再発行')[0]?.id).toBe(documents[2]?.id);
    expect(index.search('書').length).toBeGreaterThan(0);
    expect(index.search('手続き').length).toBeGreaterThan(0);
    expect(index.search('更新')[0]?.id).toBe('/news/announcement/');
    expect(index.search('存在しない検索語')).toEqual([]);
    expect(index.search('')).toEqual([]);
  });

  it('rejects malformed indexes, duplicate IDs and destinations outside content routes', async () => {
    const document = (await renderSearchDocuments(source))[0]!;
    expect(() => parseSearchDocuments({ documents: [] })).toThrow('Invalid search index');
    expect(() => parseSearchDocuments([document, document])).toThrow('Invalid search document');
    for (const id of [
      'javascript:alert(1)',
      '//example.com/',
      '/news/example/',
      '/articles/../',
      '/articles/example/#bad hash',
    ]) {
      expect(() => parseSearchDocuments([{ ...document, id }])).toThrow('Invalid search document');
    }
    expect(() => parseSearchDocuments([{ ...document, text: null }])).toThrow();
    expect(() => parseSearchDocuments([{ ...document, tags: [1] }])).toThrow();
  });

  it('preserves empty content and extra fields without sharing duplicate tracking between parses', () => {
    const documents = [
      { id: '/articles/example/', type: 'articles', title: '', section: '', text: '', tags: [''], extra: true },
      { id: '/news/example/#%E8%A6%8B%E5%87%BA%E3%81%97', type: 'news', title: '', section: '', text: '', tags: [] },
    ];
    expect(parseSearchDocuments([])).toEqual([]);
    expect(parseSearchDocuments(documents)).toEqual(documents);
    expect(() => parseSearchDocuments([...documents, documents[0]])).toThrow('Invalid search document');
    expect(parseSearchDocuments(documents)).toEqual(documents);
  });

  it.each([null, [], {}, 42, 'document'])('rejects malformed search entries %j', (document) => {
    expect(() => parseSearchDocuments([document])).toThrow('Invalid search document');
  });

  it('preserves Latin and numeric tokens adjacent to Japanese text', async () => {
    const index = createSearchIndex(
      await renderSearchDocuments({ ...source, content: 'USB接続、2024年、3500円、25kg以下、ＰＤＦ資料' }),
    );
    for (const query of ['usb', '接続', '2024', '3500', '25kg', 'pdf', 'ＵＳＢ接続']) {
      expect(index.search(query)[0]?.id).toBe('/articles/example/');
    }
  });

  it('starts a new search section at every rendered heading level', async () => {
    const documents = await renderSearchDocuments({
      ...source,
      content: '## 前の節\n前文\n\n# 次の章\n章の本文\n\n#### 詳細\n詳細の本文',
    });
    expect(documents.map(({ section, text }) => ({ section, text }))).toEqual([
      { section: '', text: '' },
      { section: '前の節', text: '前の節 前文' },
      { section: '次の章', text: '次の章 章の本文' },
      { section: '詳細', text: '詳細 詳細の本文' },
    ]);
  });

  it('prioritizes matching headings over body-only results', () => {
    const document: SearchDocument = {
      id: '/articles/body/',
      type: 'articles',
      title: '案内',
      section: '',
      tags: [],
      text: '印刷できます',
    };
    const index = createSearchIndex([document, { ...document, id: '/articles/heading/', section: '印刷' }]);
    expect(index.search('印刷')[0]?.id).toBe('/articles/heading/');
  });

  it('shows an excerpt near a body match rather than always starting at the beginning', () => {
    const excerpt = searchExcerpt(
      `${'前の文章。'.repeat(60)}印刷について説明します。${'後の文章。'.repeat(60)}`,
      '印刷',
    );
    expect(excerpt).toContain('印刷について');
    expect(excerpt.startsWith('…')).toBe(true);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(162);
  });
  it.each([
    'https://evil.example/file.pdf#page=1',
    '/content/articles/a/../../secret.pdf#page=1',
    '/content/articles/a/%2e%2e/secret.pdf#page=1',
    '/content/articles/a/%2fsecret.pdf#page=1',
    '/content/articles/a/secret.pdf?download=1#page=1',
    '/content/articles/a/secret.pdf#page=0',
    '/content/articles/a/secret.html#page=1',
  ])('rejects unsafe PDF search destination %s', (id) => {
    expect(() =>
      parseSearchDocuments([{ id, type: 'pdf', title: 'PDF', section: '1ページ', tags: [], text: '本文' }]),
    ).toThrow();
  });
});
