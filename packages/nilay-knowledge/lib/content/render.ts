// cspell:words rereference
import type { Element, Root, RootContent } from 'hast';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkGithubAlerts from 'remark-github-alerts';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { rehypeCodeBlocks, remarkCodeMeta } from './code-blocks';
import type { ImageDimensions, ImageDimensionsResolver } from './images';
import { resolveContentUrl } from './paths';
import type { ContentSource, RenderedContent, SearchDocument, TocItem } from './types';

function headingText(node: RootContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element' && node.tagName === 'img') return String(node.properties.alt ?? '');
  if ('children' in node) return node.children.map(headingText).join('');
  return '';
}

const headingAnchorIcon: Element = {
  type: 'element',
  tagName: 'svg',
  properties: {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ariaHidden: 'true',
    focusable: 'false',
  },
  children: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ].map((d) => ({ type: 'element', tagName: 'path', properties: { d }, children: [] })),
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkCodeMeta)
  .use(remarkGithubAlerts, {
    titles: { note: '補足', tip: 'ヒント', important: '重要', warning: '警告', caution: '注意' },
  })
  .use(remarkBreaks)
  .use(remarkMath)
  .use(remarkRehype, {
    allowDangerousHtml: true,
    footnoteLabel: '脚注',
    footnoteLabelTagName: 'h2',
    footnoteBackLabel: (referenceIndex, rereferenceIndex) =>
      `脚注 ${referenceIndex + 1} の参照元${rereferenceIndex > 1 ? `（${rereferenceIndex} か所目）` : ''}に戻る`,
  })
  .use(rehypeRaw)
  .use(() => (tree: Root) => {
    // The page already supplies its h1. Keep legacy Markdown's relative hierarchy.
    let hasTopLevelHeading = false;
    visit(tree, 'element', (node) => {
      if (node.tagName === 'h1') hasTopLevelHeading = true;
    });
    if (!hasTopLevelHeading) return;
    visit(tree, 'element', (node) => {
      if (/^h[1-6]$/.test(node.tagName) && node.properties.id !== 'footnote-label') {
        node.tagName = `h${Math.min(Number(node.tagName[1]) + 1, 6)}`;
      }
    });
  })
  .use(rehypeSlug);

/** Index visible text and sections using the same Markdown parsing and heading IDs as pages. */
export async function renderSearchDocuments(source: ContentSource): Promise<SearchDocument[]> {
  const tree = await processor.run(processor.parse(source.content));
  const href = `/${source.type}/${source.slug}/`;
  const createSection = (id: string, section: string): SearchDocument => ({
    id,
    type: source.type,
    title: source.frontmatter.title,
    section,
    tags: source.frontmatter.tags,
    text: '',
  });
  const documents = [createSection(href, '')];
  let current = documents[0]!;

  function collect(node: Root | RootContent): void {
    if (node.type === 'text') {
      current.text += node.value;
      return;
    }
    if (node.type === 'element') {
      if (['script', 'style', 'template', 'svg'].includes(node.tagName) || node.properties.hidden) return;
      if (node.properties.ariaHidden === 'true') return;
      if (/^h[1-6]$/.test(node.tagName) && node.properties.id !== 'footnote-label') {
        current = createSection(`${href}#${encodeURIComponent(String(node.properties.id))}`, headingText(node));
        documents.push(current);
      }
      if (node.tagName === 'img') current.text += String(node.properties.alt ?? '');
    }
    const block =
      node.type === 'element' &&
      /^(h[1-6]|p|div|section|article|li|tr|td|th|br|pre|blockquote|summary)$/.test(node.tagName);
    if (block) current.text += ' ';
    if ('children' in node) node.children.forEach(collect);
    if (block) current.text += ' ';
  }

  collect(tree);
  return documents.map((document) => ({ ...document, text: document.text.replace(/\s+/g, ' ').trim() }));
}

/** Render trusted, repository-owned Markdown. The TOC uses the rendered heading IDs. */
export async function renderContent(
  source: ContentSource,
  options: { imageDimensions?: ImageDimensionsResolver } = {},
): Promise<RenderedContent> {
  const tableOfContents: TocItem[] = [];
  const result = await processor()
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      test: (node) => node.properties.id !== 'footnote-label',
      content: headingAnchorIcon,
      // Explicit properties keep permalinks in the keyboard and accessibility trees.
      properties: (node) => ({
        className: ['heading-anchor'],
        ariaLabel: `「${headingText(node)}」へのリンク`,
      }),
    })
    .use(() => async (tree: Root) => {
      let tableCount = 0;
      let codeCount = 0;
      let imageCount = 0;
      const dimensions = new Map<string, Promise<ImageDimensions | null>>();
      const imageTasks: Promise<void>[] = [];
      async function sizeImage(node: Element): Promise<void> {
        const { src, width, height } = node.properties;
        if (!options.imageDimensions || typeof src !== 'string' || (width != null && height != null)) return;
        // Non-numeric author dimensions (such as percentages) cannot define a pixel aspect ratio.
        if ([width, height].some((value) => value != null && !(Number.isFinite(Number(value)) && Number(value) > 0)))
          return;
        let metadata = dimensions.get(src);
        if (!metadata) {
          metadata = options.imageDimensions(src);
          dimensions.set(src, metadata);
        }
        const size = await metadata;
        if (!size) return;
        if (width == null) {
          node.properties.width =
            height == null ? size.width : Math.max(1, Math.round((Number(height) * size.width) / size.height));
        }
        if (height == null) {
          node.properties.height =
            width == null ? size.height : Math.max(1, Math.round((Number(width) * size.height) / size.width));
        }
      }
      function wrapTables(node: Root | Element): void {
        node.children = node.children.map((child) => {
          if (child.type !== 'element') return child;
          wrapTables(child);
          if (child.tagName !== 'table') return child;
          tableCount += 1;
          const caption = child.children.find((node) => node.type === 'element' && node.tagName === 'caption');
          const title = child.properties.ariaLabel || (caption && headingText(caption));
          return {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['table-scroll'],
              tabIndex: 0,
              role: 'region',
              ariaLabel: `表 ${tableCount}${title ? `：${title}` : ''}（横にスクロールできます）`,
            },
            children: [child],
          };
        });
      }
      wrapTables(tree);
      visit(tree, 'element', (node) => {
        if (node.tagName === 'pre') {
          codeCount += 1;
          node.properties.tabIndex = 0;
          node.properties.role ??= 'region';
          if (!node.properties.ariaLabelledBy) {
            node.properties.ariaLabel ??= `コードブロック ${codeCount}（横にスクロールできます）`;
          }
        }
        if (node.tagName === 'thead') {
          for (const row of node.children) {
            if (row.type !== 'element' || row.tagName !== 'tr') continue;
            for (const cell of row.children) {
              if (cell.type === 'element' && cell.tagName === 'th' && Number(cell.properties.colSpan ?? 1) === 1) {
                cell.properties.scope ??= 'col';
              }
            }
          }
        }
        for (const attribute of ['href', 'src'] as const) {
          const value = node.properties[attribute];
          if (typeof value === 'string')
            node.properties[attribute] = resolveContentUrl(value, source.type, source.slug);
        }
        if (node.tagName === 'img') {
          node.properties.loading ??= imageCount === 0 ? 'eager' : 'lazy';
          node.properties.decoding ??= 'async';
          imageCount += 1;
          imageTasks.push(sizeImage(node));
        }
        if (!/^h[1-6]$/.test(node.tagName) || node.properties.id === 'footnote-label') return;
        const id = String(node.properties.id ?? '');
        const level = Number(node.tagName[1]);
        const title = headingText(node);
        if (level === 2 || level === 3) tableOfContents.push({ id, level, title });
        node.properties.tabIndex = -1;
        // Keep the permalink's name out of the heading outline announced by screen readers.
        if (!node.properties.ariaLabelledBy) node.properties.ariaLabel ??= title;
        const classes = node.properties.className;
        node.properties.className = [
          ...(Array.isArray(classes) ? classes : classes ? [String(classes)] : []),
          'heading-with-anchor',
        ];
        const anchor = node.children.at(-1);
        if (id && anchor?.type === 'element' && anchor.tagName === 'a') {
          // The plugin emits raw fragments; keep the encoded URLs used by the TOC and search.
          anchor.properties.href = `#${encodeURIComponent(id)}`;
        }
      });
      await Promise.all(imageTasks);
    })
    .use(rehypeHighlight, { detect: false, ignoreMissing: true, plainText: ['mermaid', 'dot', 'graphviz'] })
    .use(rehypeKatex)
    .use(rehypeCodeBlocks)
    .use(rehypeStringify)
    .process(source.content);

  return { html: String(result), tableOfContents };
}
