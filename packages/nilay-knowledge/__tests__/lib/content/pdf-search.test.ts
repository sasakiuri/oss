// @vitest-environment node
import { copyFile, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { serveContentAsset } from '@/lib/content/assets';
import { createPdfSearchIndex } from '@/lib/content/pdf-search';
import { searchDocumentsSchema } from '@/lib/content/schemas';
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
  let contentRoot: string;
  let contentDirectory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'knowledge-pdf-'));
    contentRoot = path.join(directory, 'content');
    contentDirectory = path.join(contentRoot, 'articles/example');
    await mkdir(contentDirectory, { recursive: true });
    await writeFile(path.join(contentDirectory, 'document.pdf'), pdfFixture());
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  // The first extraction also loads PDF.js and initializes its worker on the CI runner.
  it('extracts real PDF text with page links and reports pages without a text layer', { timeout: 15_000 }, async () => {
    const { documents, report } = await createPdfSearchIndex(
      [source('[添付資料](./document.pdf#page=2)')],
      contentRoot,
    );
    expect(documents).toEqual([
      {
        id: '/content/articles/example/document.pdf#page=1',
        type: 'pdf',
        title: '添付資料',
        section: '資料の案内 · 1ページ',
        tags: ['資料'],
        text: 'Searchable PDF attachment',
        pdf: { status: 'unverified', references: [{ title: '資料の案内', url: '/articles/example/' }] },
      },
    ]);
    expect(report).toMatchObject({
      files: 1,
      pages: 2,
      indexedPages: 1,
      pagesWithoutText: ['/content/articles/example/document.pdf#page=2'],
    });
  });

  it.each(['ordinary.pdf', '添付 資料.pdf', 'literal%2Fname.pdf', '100%.pdf'])(
    'serves the exact PDF bytes addressed by an extracted and validated search destination: %s',
    { timeout: 15_000 },
    async (name) => {
      const bytes = pdfFixture();
      await writeFile(path.join(contentDirectory, name), bytes);
      const { documents } = await createPdfSearchIndex(
        [source(`[Attachment](./${encodeURIComponent(name)})`)],
        contentRoot,
      );
      expect(documents).toHaveLength(1);
      expect(documents[0]?.id).toBe(`/content/articles/example/${encodeURIComponent(name)}#page=1`);
      expect(searchDocumentsSchema.parse(documents)).toEqual(documents);
      const destination = new URL(documents[0]!.id, 'https://example.com');
      // Emulate Next's single route-parameter decode, independently of the shared adapter.
      const segments = destination.pathname.slice('/content/'.length).split('/').map(decodeURIComponent);
      expect(segments).toEqual(['articles', 'example', name]);
      const response = await serveContentAsset(new Request(destination), segments, contentRoot);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/pdf');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    },
  );

  it.each(['.hidden.pdf', '.private/document.pdf'])(
    'diagnoses an existing but unpublished PDF before extraction: %s',
    async (name) => {
      const filename = path.join(contentDirectory, name);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, pdfFixture());
      const href = `./${name.split('/').map(encodeURIComponent).join('/')}`;
      await expect(createPdfSearchIndex([source(`[Attachment](${href})`)], contentRoot)).rejects.toThrow(
        `unpublishable PDF reference in articles/example: ${href}`,
      );
    },
  );

  it('finds Markdown reference and HTML links, deduplicates files, and merges tags', async () => {
    const { documents, report } = await createPdfSearchIndex(
      [
        source('[添付資料][download]\n\n[download]: ./document.pdf?download=1'),
        {
          ...source('<a href="/content/articles/example/document.pdf#page=1">重複した資料</a>'),
          type: 'news',
          slug: 'other',
          frontmatter: { title: '別の記事', published: '2024-01-02', tags: ['別の記事'] },
        },
      ],
      contentRoot,
    );
    expect(report.files).toBe(1);
    expect(documents[0]?.tags).toEqual(['資料', '別の記事']);
    expect(documents[0]?.title).toBe('添付資料');
    expect(documents[0]?.pdf?.references).toEqual([
      { title: '資料の案内', url: '/articles/example/' },
      { title: '別の記事', url: '/news/other/' },
    ]);
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
      contentRoot,
    );
    expect(documents).toEqual([]);
    expect(report.files).toBe(0);
  });

  it('extracts Japanese text from an existing published PDF using local CMaps', async () => {
    await copyFile(
      path.join(process.cwd(), 'content/articles/1597956932/docs/juto06.pdf'),
      path.join(contentDirectory, 'japanese.pdf'),
    );
    const { documents } = await createPdfSearchIndex([source('[申請書](./japanese.pdf)')], contentRoot);
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.map((document) => document.text).join('')).toContain('銃砲所持許可申請書');
  });

  it('uses an encoded public URL and a filename for a symbolic download label', async () => {
    await copyFile(path.join(contentDirectory, 'document.pdf'), path.join(contentDirectory, '添付 資料.pdf'));
    const { documents } = await createPdfSearchIndex(
      [source('[○](./%E6%B7%BB%E4%BB%98%20%E8%B3%87%E6%96%99.pdf)')],
      contentRoot,
    );
    expect(documents[0]?.title).toBe('添付 資料.pdf');
    expect(documents[0]?.id).toBe('/content/articles/example/%E6%B7%BB%E4%BB%98%20%E8%B3%87%E6%96%99.pdf#page=1');
  });

  it('uses the table row to identify downloads whose link label is only a symbol', async () => {
    const { documents } = await createPdfSearchIndex(
      [source('| 書類 | PDF |\n| --- | --- |\n| 添付資料 | [○](./document.pdf) |')],
      contentRoot,
    );
    expect(documents[0]?.title).toBe('添付資料 (document.pdf)');
  });

  it.each([
    './../../../outside.pdf',
    '/content/../outside.pdf',
    '/content/%2e%2e/outside.pdf',
    '/content/articles/example/..%2F..%2F..%2Foutside.pdf',
    '/content/articles/example/evil%5Coutside.pdf',
    './a%2Fb.pdf',
    './%00bad.pdf',
    './%2Ehidden.pdf',
  ])('rejects PDF references outside the content directory: %s', async (href) => {
    await expect(createPdfSearchIndex([source(`[Invalid](${href})`)], contentRoot)).rejects.toThrow(
      'must stay within content',
    );
  });

  it('rejects symlinks escaping the published content tree', async () => {
    const outside = path.join(directory, 'private.pdf');
    await writeFile(outside, pdfFixture());
    await symlink(outside, path.join(contentDirectory, 'escape.pdf'));
    await expect(createPdfSearchIndex([source('[Private](./escape.pdf)')], contentRoot)).rejects.toThrow(
      'PDF symlink must stay within content',
    );
    const response = await serveContentAsset(
      new Request('https://example.com/content/articles/example/escape.pdf'),
      ['articles', 'example', 'escape.pdf'],
      contentRoot,
    );
    expect(response.status).toBe(404);
  });

  it('fails explicitly for missing and malformed PDFs', async () => {
    await expect(createPdfSearchIndex([source('[Missing](./missing.pdf)')], contentRoot)).rejects.toThrow(
      'Unable to index PDF /content/articles/example/missing.pdf',
    );
    await writeFile(path.join(contentDirectory, 'malformed.pdf'), 'This is not a PDF');
    await expect(createPdfSearchIndex([source('[Malformed](./malformed.pdf)')], contentRoot)).rejects.toThrow(
      'Unable to index PDF /content/articles/example/malformed.pdf',
    );
  });
  it('keeps explicit evidence and successor metadata separate from stable PDF page destinations', async () => {
    await copyFile(path.join(contentDirectory, 'document.pdf'), path.join(contentDirectory, 'successor.pdf'));
    const registry = {
      '/content/articles/example/document.pdf': {
        status: 'superseded',
        successor: '/content/articles/example/successor.pdf',
      },
      '/content/articles/example/successor.pdf': {
        status: 'current',
        region: '試験地域',
        scope: '合成テスト資料',
        checked: '2026-09-30',
        sources: [{ title: 'Synthetic source', url: 'https://example.com/evidence' }],
      },
    };
    await writeFile(path.join(contentRoot, 'pdf-metadata.json'), JSON.stringify(registry));
    const { documents } = await createPdfSearchIndex(
      [source('[旧資料](./document.pdf) [新資料](./successor.pdf)')],
      contentRoot,
    );
    expect(documents.map((document) => document.id)).toEqual([
      '/content/articles/example/document.pdf#page=1',
      '/content/articles/example/successor.pdf#page=1',
    ]);
    expect(documents[0]?.pdf).toMatchObject(registry['/content/articles/example/document.pdf']);
    expect(documents[1]?.pdf).toMatchObject(registry['/content/articles/example/successor.pdf']);
    expect(searchDocumentsSchema.parse(documents)).toEqual(documents);
  });

  it('fails for nonexistent successor assets rather than publishing broken navigation', async () => {
    await writeFile(
      path.join(contentRoot, 'pdf-metadata.json'),
      JSON.stringify({
        '/content/articles/example/document.pdf': {
          status: 'historical',
          successor: '/content/articles/example/missing.pdf',
        },
      }),
    );
    await expect(createPdfSearchIndex([source('[資料](./document.pdf)')], contentRoot)).rejects.toThrow();
  });
  it('reuses unchanged text while recomposing current title, tags, sources and editorial records', async () => {
    const cold = await createPdfSearchIndex([source('[Old label](./document.pdf)')], contentRoot);
    expect(cold.report).toMatchObject({ cacheHits: 0, cacheMisses: 1 });
    const warm = await createPdfSearchIndex([source('[Old label](./document.pdf)')], contentRoot);
    expect(warm.documents).toEqual(cold.documents);
    expect(warm.report).toMatchObject({
      cacheHits: 1,
      cacheMisses: 0,
      extractionMs: 0,
      pagesWithoutText: cold.report.pagesWithoutText,
    });
    await writeFile(
      path.join(contentRoot, 'pdf-metadata.json'),
      JSON.stringify({ '/content/articles/example/document.pdf': { status: 'historical' } }),
    );
    const changed = {
      ...source('[New label](./document.pdf)'),
      frontmatter: { title: 'New article title', published: '2024-01-01', tags: ['new tag'] },
    };
    const metadataOnly = await createPdfSearchIndex([changed], contentRoot);
    expect(metadataOnly.report).toMatchObject({ cacheHits: 1, cacheMisses: 0 });
    expect(metadataOnly.documents[0]).toMatchObject({
      title: 'New label',
      tags: ['new tag'],
      section: 'New article title · 1ページ',
      pdf: { status: 'historical', references: [{ title: 'New article title', url: '/articles/example/' }] },
    });
  });

  it('re-extracts only changed PDF bytes and invalidates extraction-version upgrades', async () => {
    await copyFile(path.join(contentDirectory, 'document.pdf'), path.join(contentDirectory, 'second.pdf'));
    const sources = [source('[One](./document.pdf) [Two](./second.pdf)')];
    await createPdfSearchIndex(sources, contentRoot);
    // A harmless trailing comment changes bytes without changing extracted pages.
    await writeFile(
      path.join(contentDirectory, 'second.pdf'),
      Buffer.concat([pdfFixture(), Buffer.from('\n% changed\n')]),
    );
    const changed = await createPdfSearchIndex(sources, contentRoot);
    expect(changed.report).toMatchObject({ cacheHits: 1, cacheMisses: 1 });
    const upgraded = await createPdfSearchIndex(sources, contentRoot, { extractionVersion: 'synthetic-upgrade' });
    expect(upgraded.report).toMatchObject({ cacheHits: 0, cacheMisses: 2 });
    expect(upgraded.documents).toEqual(changed.documents);
  });

  it('treats corrupt or unavailable cache records as misses and keeps correct output', async () => {
    const sources = [source('[PDF](./document.pdf)')];
    const cold = await createPdfSearchIndex(sources, contentRoot);
    const cacheDirectory = path.join(directory, '.cache/pdf-search');
    for (const file of await readdir(cacheDirectory)) await writeFile(path.join(cacheDirectory, file), '{invalid');
    const corrupt = await createPdfSearchIndex(sources, contentRoot);
    expect(corrupt.report.cacheMisses).toBe(1);
    expect(corrupt.documents).toEqual(cold.documents);
    const blocked = path.join(directory, 'not-a-directory');
    await writeFile(blocked, 'blocked');
    const unavailable = await createPdfSearchIndex(sources, contentRoot, {
      cacheDirectory: path.join(blocked, 'cache'),
    });
    expect(unavailable.documents).toEqual(cold.documents);
    expect(unavailable.report.cacheMisses).toBe(1);
    await expect(createPdfSearchIndex(sources, contentRoot, { cacheDirectory: contentRoot })).rejects.toThrow(
      'outside published content',
    );
  });

  it('checks missing, corrupt and unsafe current files before considering a warm cache', async () => {
    const sources = [source('[PDF](./document.pdf)')];
    await createPdfSearchIndex(sources, contentRoot);
    await rm(path.join(contentDirectory, 'document.pdf'));
    await expect(createPdfSearchIndex(sources, contentRoot)).rejects.toThrow('Unable to index PDF');
    await writeFile(path.join(contentDirectory, 'document.pdf'), 'broken PDF');
    await expect(createPdfSearchIndex(sources, contentRoot)).rejects.toThrow('Unable to index PDF');
    await rm(path.join(contentDirectory, 'document.pdf'));
    const outside = path.join(directory, 'outside.pdf');
    await writeFile(outside, pdfFixture());
    await symlink(outside, path.join(contentDirectory, 'document.pdf'));
    await expect(createPdfSearchIndex(sources, contentRoot)).rejects.toThrow('PDF symlink must stay within content');
  });
});
