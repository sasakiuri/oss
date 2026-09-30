// cspell:words rereference
import type { Root } from 'hast';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import remarkBreaks from 'remark-breaks';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkGithubAlerts from 'remark-github-alerts';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { remarkCodeMeta } from './code-blocks';
import { remarkContentDirectives } from './directives';
import { rehypeMarkAuthoredIds, rehypePublishedFragments } from './fragments';
import type { ContentSource } from './types';

/** Syntax only: lint adds source diagnostics before applying directive validation. */
export function createMarkdownGrammar() {
  return unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkMath);
}

/** Lightweight, synchronous structural projection; no image, PDF, highlighting or enhancement work. */
export function createContentProjectionProcessor() {
  return createMarkdownGrammar()
    .use(remarkContentDirectives)
    .use(remarkCodeMeta)
    .use(remarkGithubAlerts, {
      titles: { note: '補足', tip: 'ヒント', important: '重要', warning: '警告', caution: '注意' },
    })
    .use(remarkBreaks)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      footnoteLabel: '脚注',
      footnoteLabelTagName: 'h2',
      footnoteBackLabel: (referenceIndex, rereferenceIndex) =>
        `脚注 ${referenceIndex + 1} の参照元${rereferenceIndex > 1 ? `（${rereferenceIndex} か所目）` : ''}に戻る`,
    })
    .use(rehypeRaw);
}

/** Pages, search and permalink inventory share canonical heading IDs. */
export function createContentHeadingProcessor() {
  return createContentProjectionProcessor()
    .use(() => (tree: Root) => {
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
    .use(rehypeMarkAuthoredIds)
    .use(rehypeSlug)
    .use(rehypePublishedFragments);
}

/** Every parse owns a fresh AST. Consumer transforms never share mutable document state. */
export function parseContentTree(source: ContentSource): Root {
  const processor = createContentHeadingProcessor();
  const file = { value: source.content, path: `content/${source.type}/${source.slug}/index.md` };
  return processor.runSync(processor.parse(file), file);
}
