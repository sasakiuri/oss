// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { docsRoot, documentHref, repositoryFileUrl, resolveDocLink, siteLinkUrl } from '@/entities/document/links';
import { adjacentDocuments } from '@/entities/document/navigation';
import { documentLinks, parseDocument } from '@/entities/document/parse';
import { createSearchIndex } from '@/features/search/search-index';

describe('document URLs', () => {
  it('keeps README and INDEX distinct on case-insensitive hosts', () => {
    expect(documentHref('README.md')).toBe('/');
    expect(documentHref('INDEX.md')).toBe('/documents/');
    expect(documentHref('lane/devices/kohto/mt201/README.md')).toBe('/lane/devices/kohto/mt201/');
  });
  it('resolves nested Markdown links and preserves queries and Japanese fragments', () => {
    expect(
      resolveDocLink('../../../../common/TARGET_SPEC.md?view=full#標的', 'lane/devices/kohto/mt201/README.md'),
    ).toBe('/common/target-spec/?view=full#標的');
    expect(resolveDocLink('../README.md', 'lane/README.md')).toBe('/');
  });
  it('sends repository files, directories, and licenses to the selected GitHub ref', () => {
    expect(resolveDocLink('../../saika-lane/README.md#supported-devices', 'lane/README.md', 'v0.3.0')).toBe(
      'https://github.com/sasakiuri/oss/blob/v0.3.0/packages/saika-lane/README.md#supported-devices',
    );
    expect(resolveDocLink('../saika-director/', 'README.md', 'feature/docs')).toBe(
      'https://github.com/sasakiuri/oss/tree/feature%2Fdocs/packages/saika-director',
    );
    expect(resolveDocLink('../LICENSE', 'lane/README.md')).toBe(
      'https://github.com/sasakiuri/oss/blob/1.x/packages/saika-docs/LICENSE',
    );
  });
  it('preserves safe external links, fragments, and local assets', () => {
    for (const href of [
      'https://example.com/README.md',
      'mailto:docs@example.com',
      '#接続構成',
      '/getting-started/',
      './diagram.svg',
    ])
      expect(resolveDocLink(href, 'README.md')).toBe(href);
  });
  it('links each document to its Markdown source at the selected ref', () => {
    expect(repositoryFileUrl(`${docsRoot}/lane/README.md`, 'release/1.x')).toBe(
      'https://github.com/sasakiuri/oss/blob/release%2F1.x/packages/saika-docs/lane/README.md',
    );
  });
  it('resolves site links against the linking document and leaves other links alone', () => {
    const page = siteLinkUrl('/common/target-spec/#標的', '/lane/');
    expect(page?.pathname).toBe('/common/target-spec/');
    expect(decodeURIComponent(page?.hash ?? '')).toBe('#標的');
    const section = siteLinkUrl('#1-接続', '/lane/devices/');
    expect(section?.pathname).toBe('/lane/devices/');
    expect(decodeURIComponent(section?.hash ?? '')).toBe('#1-接続');
    expect(siteLinkUrl('https://github.com/sasakiuri/oss/blob/1.x/LICENSE', '/')).toBeUndefined();
    expect(siteLinkUrl('mailto:docs@example.com', '/')).toBeUndefined();
  });
});

describe('Markdown catalog', () => {
  it('extracts headings with GitHub-compatible Japanese and duplicate anchors', () => {
    const doc = parseDocument('TEST.md', '# タイトル\n\n本文です。\n\n## 1. 接続\n\n### 重複\n\n### 重複');
    expect(doc.title).toBe('タイトル');
    expect(doc.description).toBe('本文です。');
    expect(doc.headings.map((heading) => heading.id)).toEqual(['タイトル', '1-接続', '重複', '重複-1']);
  });
  it('validates frontmatter and keeps it out of the document', () => {
    const doc = parseDocument('TEST.md', '---\ntitle: 案内\ndescription: 操作説明\n---\n\n## 手順');
    expect(doc.title).toBe('案内');
    expect(doc.description).toBe('操作説明');
    expect(doc.markdown).not.toContain('description:');
    expect(() => parseDocument('TEST.md', '---\ntitle: 42\n---\n本文')).toThrow();
  });
  it('supports documents without a title and extracts reference-style links', () => {
    const doc = parseDocument('TEST.md', '[手順][guide]\n\n[guide]: ./GETTING_STARTED.md');
    expect(doc.title).toBe('TEST.md');
    expect(documentLinks(doc)).toEqual(['/getting-started/']);
    expect(parseDocument('EMPTY.md', '').description).toBe('');
  });
  it('finds the previous and next documents in navigation order', () => {
    const documents = ['README.md', 'GETTING_STARTED.md', 'admin/BACKUP.md', 'NOTICE.md'].map((path) =>
      parseDocument(path, `# ${path}`),
    );
    const adjacent = (href: string) => {
      const { previous, next } = adjacentDocuments(documents, href);
      return [previous?.title, next?.title];
    };
    expect(adjacent('/')).toEqual([undefined, 'GETTING_STARTED.md']);
    expect(adjacent('/getting-started/')).toEqual(['README.md', undefined]);
    expect(adjacent('/admin/backup/')).toEqual([undefined, 'NOTICE.md']);
    expect(adjacent('/notice/')).toEqual(['admin/BACKUP.md', undefined]);
  });
});

it('finds Japanese words inside unspaced text and English technical terms', () => {
  const index = createSearchIndex([
    { id: '/lane/', title: 'Lane 操作ガイド', section: '', text: '各射座番号に標的装置を接続します。' },
    { id: '/director/#mqtt', title: 'Director', section: 'MQTT 接続', text: '' },
  ]);
  expect(index.search('射座').map((result) => result.id)).toContain('/lane/');
  expect(index.search('mqtt').map((result) => result.id)).toContain('/director/#mqtt');
  expect(index.search('存在しない語彙')).toEqual([]);
});
