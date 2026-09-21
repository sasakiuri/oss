// cspell:ignore turbopack
import { readFile, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Root, RootContent } from 'hast';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

import { resolveContentUrl } from './paths';
import type { ContentSource } from './types';

export interface PdfSearchDocument {
  id: string;
  type: 'pdf';
  title: string;
  section: string;
  tags: string[];
  text: string;
}

export interface PdfSearchReport {
  files: number;
  pages: number;
  indexedPages: number;
  /** These pages have no extractable text. Image-only pages require OCR, which is not performed. */
  pagesWithoutText: string[];
}

interface PdfReference {
  url: string;
  title: string;
  sourceTitle: string;
  tags: string[];
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw);

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
async function findReferences(sources: readonly ContentSource[]): Promise<PdfReference[]> {
  const references = new Map<string, PdfReference>();
  for (const source of sources) {
    const tree = await processor.run(processor.parse(source.content));
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
          let pathname: string;
          try {
            pathname = decodeURIComponent(resolved);
          } catch (error) {
            throw new Error(`Invalid PDF URL in ${source.type}/${source.slug}: ${href}`, { cause: error });
          }
          if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) {
            throw new Error(`PDF path must stay within content: ${href}`);
          }
          if (!pathname.startsWith('/content/')) {
            if (!href.startsWith('/')) throw new Error(`PDF path must stay within content: ${href}`);
            return;
          }
          const url = pathname.split('/').map(encodeURIComponent).join('/');
          const label = textContent(node).replace(/\s+/g, ' ').trim();
          // Some download tables label every link with a circle; retain an identifiable filename in that case.
          const filename = path.posix.basename(pathname);
          const title = /[\p{L}\p{N}]/u.test(label)
            ? label
            : tableRowLabel
              ? `${tableRowLabel} (${filename})`
              : filename;
          const existing = references.get(url);
          if (existing) {
            existing.tags = [...new Set([...existing.tags, ...source.frontmatter.tags])];
          } else {
            references.set(url, {
              url,
              title,
              sourceTitle: source.frontmatter.title,
              tags: [...source.frontmatter.tags],
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

/** Build-time extraction; pdfjs-dist and its fonts/CMaps never enter the browser bundle. */
export async function createPdfSearchIndex(
  sources: readonly ContentSource[],
  contentDirectory: string,
): Promise<{ documents: PdfSearchDocument[]; report: PdfSearchReport }> {
  const references = await findReferences(sources);
  const report: PdfSearchReport = { files: references.length, pages: 0, indexedPages: 0, pagesWithoutText: [] };
  if (references.length === 0) return { documents: [], report };

  const directory = await realpath(contentDirectory);
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  // Keep native Node resolution: a bundled require.resolve() returns a module ID, not a filesystem path.
  // https://nextjs.org/docs/app/guides/lazy-loading#magic-comments
  const pdfDirectory = path.dirname(require.resolve(/* webpackIgnore: true */ 'pdfjs-dist/package.json'));
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const documents: PdfSearchDocument[] = [];

  // Sequential files/pages bound memory use independently of corpus size and make failures reproducible.
  for (const reference of references) {
    const filename = path.resolve(directory, `.${decodeURIComponent(reference.url).slice('/content'.length)}`);
    if (!isWithin(directory, filename)) throw new Error(`PDF path must stay within content: ${reference.url}`);
    try {
      // The asset route traces content explicitly; avoid bundling dynamic asset paths as modules.
      const realFilename = await realpath(/* turbopackIgnore: true */ filename);
      if (!isWithin(directory, realFilename)) throw new Error('PDF symlink must stay within content');
      if (!(await stat(realFilename)).isFile()) throw new Error('PDF must be a regular file');
      const task = getDocument({
        data: new Uint8Array(await readFile(realFilename)),
        // PDF.js requires a forward slash suffix even for native Windows paths.
        cMapUrl: `${path.join(pdfDirectory, 'cmaps')}/`,
        cMapPacked: true,
        standardFontDataUrl: `${path.join(pdfDirectory, 'standard_fonts')}/`,
        useSystemFonts: false,
        stopAtErrors: true,
      });
      try {
        const pdf = await task.promise;
        report.pages += pdf.numPages;
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
            const id = `${reference.url}#page=${pageNumber}`;
            if (text.length === 0) {
              report.pagesWithoutText.push(id);
              continue;
            }
            documents.push({
              id,
              type: 'pdf',
              title: reference.title,
              section: `${reference.sourceTitle} · ${pageNumber}ページ`,
              tags: reference.tags,
              text,
            });
          } finally {
            page.cleanup();
          }
        }
      } finally {
        await task.destroy();
      }
    } catch (error) {
      throw new Error(`Unable to index PDF ${reference.url}: ${String(error)}`, { cause: error });
    }
  }
  report.indexedPages = documents.length;
  return { documents, report };
}
