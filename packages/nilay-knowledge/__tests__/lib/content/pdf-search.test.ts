// @vitest-environment node
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPdfSearchIndex } from '@/lib/content/pdf-search';
import type { ContentSource } from '@/lib/content/types';

/** A small, valid two-page PDF: a searchable text page and a blank page without a text layer. */
function pdfFixture(): Buffer {
  const stream = 'BT /F1 12 Tf 72 720 Td (Searchable PDF attachment) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function source(content: string): ContentSource {
  return {
    type: 'articles',
    slug: 'example',
    frontmatter: { title: '資料の案内', published: '2024-01-01', tags: ['資料'] },
    content,
  };
}

describe('PDF search extraction', () => {
  let directory: string;
  let publicDirectory: string;
  let contentDirectory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'knowledge-pdf-'));
    publicDirectory = path.join(directory, 'public');
    contentDirectory = path.join(publicDirectory, 'content/articles/example');
    await mkdir(contentDirectory, { recursive: true });
    await writeFile(path.join(contentDirectory, 'document.pdf'), pdfFixture());
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('extracts real PDF text with page links and reports pages without a text layer', async () => {
    const { documents, report } = await createPdfSearchIndex(
      [source('[添付資料](./document.pdf#page=2)')],
      publicDirectory,
    );
    expect(documents).toEqual([
      {
        id: '/content/articles/example/document.pdf#page=1',
        type: 'pdf',
        title: '添付資料',
        section: '資料の案内 · 1ページ',
        tags: ['資料'],
        text: 'Searchable PDF attachment',
      },
    ]);
    expect(report).toEqual({
      files: 1,
      pages: 2,
      indexedPages: 1,
      pagesWithoutText: ['/content/articles/example/document.pdf#page=2'],
    });
  });

  it('finds Markdown reference and HTML links, deduplicates files, and merges tags', async () => {
    const { documents, report } = await createPdfSearchIndex(
      [
        source('[添付資料][download]\n\n[download]: ./document.pdf?download=1'),
        {
          ...source('<a href="/content/articles/example/document.pdf#page=1">重複した資料</a>'),
          frontmatter: { title: '別の記事', published: '2024-01-02', tags: ['別の記事'] },
        },
      ],
      publicDirectory,
    );
    expect(report.files).toBe(1);
    expect(documents[0]?.tags).toEqual(['資料', '別の記事']);
    expect(documents[0]?.title).toBe('添付資料');
  });

  it('excludes unlinked assets, external URLs, hidden anchors and code samples', async () => {
    await writeFile(path.join(contentDirectory, 'orphan.pdf'), 'This is deliberately not a PDF');
    const { documents, report } = await createPdfSearchIndex(
      [
        source(`
[Remote](https://example.com/remote.pdf)
[Protocol relative](//example.com/remote.pdf)
\`[Code sample](./orphan.pdf)\`

\`\`\`html
<a href="./orphan.pdf">Sample</a>
\`\`\`

<div hidden><a href="./orphan.pdf">Hidden</a></div>
<div aria-hidden="true"><a href="./orphan.pdf">Hidden</a></div>
`),
      ],
      publicDirectory,
    );
    expect(documents).toEqual([]);
    expect(report.files).toBe(0);
  });

  it('extracts Japanese text from an existing published PDF using local CMaps', async () => {
    await copyFile(
      path.join(process.cwd(), 'public/content/articles/1597956932/docs/juto06.pdf'),
      path.join(contentDirectory, 'japanese.pdf'),
    );
    const { documents } = await createPdfSearchIndex([source('[申請書](./japanese.pdf)')], publicDirectory);
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.map((document) => document.text).join('')).toContain('銃砲所持許可申請書');
  });

  it('uses an encoded public URL and a filename for a symbolic download label', async () => {
    await copyFile(path.join(contentDirectory, 'document.pdf'), path.join(contentDirectory, '添付 資料.pdf'));
    const { documents } = await createPdfSearchIndex(
      [source('[○](./%E6%B7%BB%E4%BB%98%20%E8%B3%87%E6%96%99.pdf)')],
      publicDirectory,
    );
    expect(documents[0]?.title).toBe('添付 資料.pdf');
    expect(documents[0]?.id).toBe('/content/articles/example/%E6%B7%BB%E4%BB%98%20%E8%B3%87%E6%96%99.pdf#page=1');
  });

  it('uses the table row to identify downloads whose link label is only a symbol', async () => {
    const { documents } = await createPdfSearchIndex(
      [source('| 書類 | PDF |\n| --- | --- |\n| 添付資料 | [○](./document.pdf) |')],
      publicDirectory,
    );
    expect(documents[0]?.title).toBe('添付資料 (document.pdf)');
  });

  it.each([
    './../../../outside.pdf',
    '/content/../outside.pdf',
    '/content/%2e%2e/outside.pdf',
    '/content/articles/example/..%2F..%2F..%2Foutside.pdf',
    '/content/articles/example/evil%5Coutside.pdf',
  ])('rejects PDF references outside the public content directory: %s', async (href) => {
    await expect(createPdfSearchIndex([source(`[Invalid](${href})`)], publicDirectory)).rejects.toThrow(
      'must stay within public/content',
    );
  });

  it('rejects symlinks escaping the published content tree', async () => {
    const outside = path.join(directory, 'private.pdf');
    await writeFile(outside, pdfFixture());
    await symlink(outside, path.join(contentDirectory, 'escape.pdf'));
    await expect(createPdfSearchIndex([source('[Private](./escape.pdf)')], publicDirectory)).rejects.toThrow(
      'PDF symlink must stay within public/content',
    );
  });

  it('fails explicitly for missing and malformed PDFs', async () => {
    await expect(createPdfSearchIndex([source('[Missing](./missing.pdf)')], publicDirectory)).rejects.toThrow(
      'Unable to index PDF /content/articles/example/missing.pdf',
    );
    await writeFile(path.join(contentDirectory, 'malformed.pdf'), 'This is not a PDF');
    await expect(createPdfSearchIndex([source('[Malformed](./malformed.pdf)')], publicDirectory)).rejects.toThrow(
      'Unable to index PDF /content/articles/example/malformed.pdf',
    );
  });
});
