import type { Element, Root, RootContent } from 'hast';
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

import { resolveContentUrl } from './paths';
import type { ContentSource, RenderedContent, TocItem } from './types';

function visitElements(node: Root | RootContent, visit: (element: Element) => void): void {
  if (node.type === 'element') visit(node);
  if ('children' in node) node.children.forEach((child) => visitElements(child, visit));
}

function headingText(node: RootContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element' && node.tagName === 'img') return String(node.properties.alt ?? '');
  if ('children' in node) return node.children.map(headingText).join('');
  return '';
}

function headingAnchor(id: string): Element {
  return {
    type: 'element',
    tagName: 'a',
    properties: { href: `#${id}`, className: ['heading-anchor'], ariaLabel: 'この見出しへのリンク' },
    children: [
      {
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
        },
        children: [
          'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
          'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
        ].map((d) => ({ type: 'element', tagName: 'path', properties: { d }, children: [] })),
      },
    ],
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkGithubAlerts)
  .use(remarkBreaks)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true, footnoteLabel: '脚注', footnoteLabelTagName: 'h2' })
  .use(rehypeRaw)
  .use(rehypeSlug);

/** Render trusted, repository-owned Markdown. The TOC uses the rendered heading IDs. */
export async function renderContent(source: ContentSource): Promise<RenderedContent> {
  const tableOfContents: TocItem[] = [];
  const result = await processor()
    .use(() => (tree: Root) => {
      visitElements(tree, (node) => {
        for (const attribute of ['href', 'src'] as const) {
          const value = node.properties[attribute];
          if (typeof value === 'string')
            node.properties[attribute] = resolveContentUrl(value, source.type, source.slug);
        }
        if (!/^h[1-6]$/.test(node.tagName) || node.properties.id === 'footnote-label') return;
        const id = String(node.properties.id ?? '');
        const level = Number(node.tagName[1]);
        if (level === 2 || level === 3) tableOfContents.push({ id, level, title: headingText(node) });
        const classes = node.properties.className;
        node.properties.className = [
          ...(Array.isArray(classes) ? classes : classes ? [String(classes)] : []),
          'heading-with-anchor',
        ];
        node.children.unshift(headingAnchor(id));
      });
    })
    .use(rehypeHighlight)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(source.content);

  return { html: String(result), tableOfContents };
}
