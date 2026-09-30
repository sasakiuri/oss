import type { Root, RootContent } from 'hast';

import { createContentProjectionProcessor } from './grammar';
import type { ContentSource } from './types';

const processor = createContentProjectionProcessor();

function isHidden(node: Root | RootContent): boolean {
  return (
    node.type === 'element' &&
    (['script', 'style', 'template', 'svg', 'pre', 'figure'].includes(node.tagName) ||
      Boolean(node.properties.hidden) ||
      node.properties.ariaHidden === 'true' ||
      (Array.isArray(node.properties.className) && node.properties.className.includes('markdown-alert-title')))
  );
}

function visibleText(node: Root | RootContent): string {
  if (isHidden(node)) return '';
  if (node.type === 'text') return node.value;
  if (node.type === 'element' && node.tagName === 'br') return ' ';
  return 'children' in node ? node.children.map(visibleText).join('') : '';
}

function firstParagraph(node: Root | RootContent): string {
  if (isHidden(node)) return '';
  if (node.type === 'element' && node.tagName === 'p') return visibleText(node).replace(/\s+/g, ' ').trim();
  if ('children' in node) {
    for (const child of node.children) {
      const text = firstParagraph(child);
      if (text) return text;
    }
  }
  return '';
}

/** Prefer an editorial summary; otherwise use the first visible paragraph, never raw Markdown. */
export function contentDescription(source: ContentSource): string {
  const description =
    source.frontmatter.description ??
    (firstParagraph(
      processor.runSync(
        processor.parse({ value: source.content, path: `content/${source.type}/${source.slug}/index.md` }),
        { value: source.content, path: `content/${source.type}/${source.slug}/index.md` },
      ),
    ) ||
      source.frontmatter.title);
  const text = description.replace(/\s+/g, ' ').trim();
  const characters = Array.from(text);
  return characters.length > 160 ? `${characters.slice(0, 159).join('')}…` : text;
}
