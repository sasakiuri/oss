// cspell:ignore turbopack
import { readFile, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import type { Root, RootContent } from 'hast';

import { decodeContentAssetPathname } from './asset-path';
import { createContentProjectionProcessor } from './grammar';
import { resolveContentUrl } from './paths';
import {
  pdfExtractionKey,
  readPdfExtraction,
  resolvePdfCacheDirectory,
  writePdfExtraction,
  type PdfExtraction,
} from './pdf-extraction-cache';
import { pdfRegistrySchema, type PdfSearchMetadata } from './pdf-metadata';
import type { ContentSource } from './types';

export interface PdfSearchDocument {
  id: string;
  type: 'pdf';
  title: string;
  section: string;
  tags: string[];
  text: string;
  /** Stored once per PDF, on its first indexed page. */
  pdf?: PdfSearchMetadata;
}

export interface PdfSearchReport {
  files: number;
  cacheHits: number;
  cacheMisses: number;
  extractionMs: number;
  pages: number;
  indexedPages: number;
  /** These pages have no extractable text. Image-only pages require OCR, which is not performed. */
  pagesWithoutText: string[];
}

interface PdfReference {
  url: string;
  segments: string[];
  title: string;
  sourceTitle: string;
  tags: string[];
  references: { title: string; url: string }[];
}

const processor = createContentProjectionProcessor();

function textContent(node: Root | RootContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element' && node.tagName === 'img') return String(node.properties.alt ?? '');
  return 'children' in node ? node.children.map(textContent).join('') : '';
}

function isWithin(directory: string, filename: string): boolean {
  const relative = path.relative(directory, filename);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Use authored links, including reference links and HTML anchors, never a directory-wide asset scan. */
export async function findReferences(sources: readonly ContentSource[]): Promise<PdfReference[]> {
  const references = new Map<string, PdfReference>();
  for (const source of sources) {
    const file = { value: source.content, path: `content/${source.type}/${source.slug}/index.md` };
    const tree = await processor.run(processor.parse(file), file);
    function collect(node: Root | RootContent, tableRowLabel = ''): void {
      if (node.type === 'element') {
        if (['script', 'style', 'template', 'svg'].includes(node.tagName) || node.properties.hidden) return;
        if (node.properties.ariaHidden === 'true') return;
        if (node.tagName === 'tr') {
          tableRowLabel = node.children
            .map(textContent)
            .map((text) => text.replace(/\s+/g, ' ').trim())
            .filter((text) => /[\p{L}\p{N}]/u.test(text))
            .join(' ');
        }
        const href = node.properties.href;
        if (node.tagName === 'a' && typeof href === 'string' && /\.pdf(?:[?#]|$)/i.test(href)) {
          // Network and protocol-relative links remain ordinary article links; extraction is local only.
          if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return;
          const resolved = resolveContentUrl(href, source.type, source.slug).split(/[?#]/, 1)[0]!;
          let segments: string[] | null;
          try {
            segments = decodeContentAssetPathname(resolved);
          } catch (error) {
            throw new Error(`Invalid PDF URL in ${source.type}/${source.slug}: ${href}`, { cause: error });
          }
          if (!segments) {
            // Other root-relative routes are links, not local extraction inputs.
            if (!resolved.startsWith('/content/') && href.startsWith('/')) return;
            throw new Error(
              `PDF path must stay within content; unpublishable PDF reference in ${source.type}/${source.slug}: ${href}`,
            );
          }
          const url = `/content/${segments.map(encodeURIComponent).join('/')}`;
          const label = textContent(node).replace(/\s+/g, ' ').trim();
          // Some download tables label every link with a circle; retain an identifiable filename in that case.
          const filename = segments.at(-1)!;
          const title = /[\p{L}\p{N}]/u.test(label)
            ? label
            : tableRowLabel
              ? `${tableRowLabel} (${filename})`
              : filename;
          const existing = references.get(url);
          const article = { title: source.frontmatter.title, url: `/${source.type}/${source.slug}/` };
          if (existing) {
            existing.tags = [...new Set([...existing.tags, ...source.frontmatter.tags])];
            if (!existing.references.some((reference) => reference.url === article.url))
              existing.references.push(article);
          } else {
            references.set(url, {
              url,
              segments,
              title,
              sourceTitle: source.frontmatter.title,
              tags: [...source.frontmatter.tags],
              references: [article],
            });
          }
        }
      }
      if ('children' in node) node.children.forEach((child) => collect(child, tableRowLabel));
    }
    collect(tree);
  }
  return [...references.values()].sort((a, b) => a.url.localeCompare(b.url));
}

async function extractPdfText(data: Uint8Array, pdfDirectory: string): Promise<PdfExtraction> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pages: string[] = [];
  const pagesWithoutText: number[] = [];
  const task = getDocument({
    data,
    // PDF.js requires a forward slash suffix even for native Windows paths.
    cMapUrl: `${path.join(pdfDirectory, 'cmaps')}/`,
    cMapPacked: true,
    standardFontDataUrl: `${path.join(pdfDirectory, 'standard_fonts')}/`,
    useSystemFonts: false,
    stopAtErrors: true,
  });
  try {
    const pdf = await task.promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ''}` : ''))
          .join(' ')
          // Japanese forms often position every character separately; preserve compound search terms.
          .replace(
            /(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu,
            '',
          )
          .replace(/\s+/g, ' ')
          .trim();
        pages.push(text);
        if (text.length === 0) pagesWithoutText.push(pageNumber);
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await task.destroy();
  }
  return { pages, pagesWithoutText };
}

/** Build-time extraction; pdfjs-dist and its fonts/CMaps never enter the browser bundle. */
export async function createPdfSearchIndex(
  sources: readonly ContentSource[],
  contentDirectory: string,
  options: { cacheDirectory?: string | false; extractionVersion?: string } = {},
): Promise<{ documents: PdfSearchDocument[]; report: PdfSearchReport }> {
  const references = await findReferences(sources);
  const report: PdfSearchReport = {
    files: references.length,
    pages: 0,
    indexedPages: 0,
    pagesWithoutText: [],
    cacheHits: 0,
    cacheMisses: 0,
    extractionMs: 0,
  };
  const directory = await realpath(contentDirectory);
  let registry = pdfRegistrySchema.parse({});
  try {
    registry = pdfRegistrySchema.parse(JSON.parse(await readFile(path.join(directory, 'pdf-metadata.json'), 'utf8')));
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  // Validate records and successor assets even if no article currently links that revision.
  for (const url of new Set([
    ...Object.keys(registry),
    ...Object.values(registry).flatMap((record) => (record.successor ? [record.successor] : [])),
  ])) {
    const segments = decodeContentAssetPathname(url)!;
    const filename = await realpath(path.join(directory, ...segments));
    if (!isWithin(directory, filename) || !(await stat(filename)).isFile())
      throw new Error(`Invalid PDF metadata destination: ${url}`);
  }
  if (references.length === 0) return { documents: [], report };
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  // Keep native Node resolution: a bundled require.resolve() returns a module ID, not a filesystem path.
  // https://nextjs.org/docs/app/guides/lazy-loading#magic-comments
  const pdfDirectory = path.dirname(require.resolve(/* webpackIgnore: true */ 'pdfjs-dist/package.json'));
  const pdfjsVersion = JSON.parse(await readFile(path.join(pdfDirectory, 'package.json'), 'utf8')).version as string;
  const requestedCacheDirectory =
    options.cacheDirectory === false
      ? false
      : path.resolve(options.cacheDirectory ?? path.join(directory, '..', '.cache/pdf-search'));
  if (
    requestedCacheDirectory &&
    (requestedCacheDirectory === directory || isWithin(directory, requestedCacheDirectory))
  )
    throw new Error('PDF extraction cache must stay outside published content');
  const cacheDirectory = requestedCacheDirectory
    ? await resolvePdfCacheDirectory(requestedCacheDirectory, directory)
    : false;
  const documents: PdfSearchDocument[] = [];

  // Sequential files/pages bound memory use independently of corpus size and make failures reproducible.
  for (const reference of references) {
    const metadata: PdfSearchMetadata = {
      ...(registry[reference.url] ?? { status: 'unverified' as const }),
      references: reference.references.sort((a, b) => a.url.localeCompare(b.url)),
    };
    let metadataStored = false;
    const filename = path.resolve(directory, `./${reference.segments.join('/')}`);
    if (!isWithin(directory, filename)) throw new Error(`PDF path must stay within content: ${reference.url}`);
    try {
      // The asset route traces content explicitly; avoid bundling dynamic asset paths as modules.
      const realFilename = await realpath(/* turbopackIgnore: true */ filename);
      if (!isWithin(directory, realFilename)) throw new Error('PDF symlink must stay within content');
      if (!(await stat(realFilename)).isFile()) throw new Error('PDF must be a regular file');
      // Even a hit validates and reads the current file before content-addressed reuse.
      const bytes = new Uint8Array(await readFile(realFilename));
      const key = pdfExtractionKey(bytes, pdfjsVersion, options.extractionVersion);
      let extraction = await readPdfExtraction(cacheDirectory, key);
      if (extraction) report.cacheHits += 1;
      else {
        report.cacheMisses += 1;
        const started = performance.now();
        extraction = await extractPdfText(bytes, pdfDirectory);
        report.extractionMs += performance.now() - started;
        await writePdfExtraction(cacheDirectory, key, extraction);
      }
      report.pages += extraction.pages.length;
      report.pagesWithoutText.push(...extraction.pagesWithoutText.map((number) => `${reference.url}#page=${number}`));
      for (const [index, text] of extraction.pages.entries()) {
        if (!text) continue;
        const pageNumber = index + 1;
        documents.push({
          id: `${reference.url}#page=${pageNumber}`,
          type: 'pdf',
          title: reference.title,
          section: `${reference.sourceTitle} · ${pageNumber}ページ`,
          tags: reference.tags,
          text,
          ...(!metadataStored ? { pdf: metadata } : {}),
        });
        metadataStored = true;
      }
    } catch (error) {
      throw new Error(`Unable to index PDF ${reference.url}: ${String(error)}`, { cause: error });
    }
  }
  report.indexedPages = documents.length;
  return { documents, report };
}
