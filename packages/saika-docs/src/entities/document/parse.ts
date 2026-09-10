// SPDX-License-Identifier: MIT
import GithubSlugger from 'github-slugger';
import matter from 'gray-matter';
import type { Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

import { documentHref, resolveDocLink } from './links';
import type { DocumentRecord } from './model';

const date = z.preprocess((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value), z.iso.date());
export const metadataSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    published: date.optional(),
    updated: date.optional(),
    tags: z.array(z.string().min(1).max(50)).max(20).optional(),
    image: z
      .string()
      .regex(/^\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|avif)$/)
      .optional(),
  })
  .strict()
  .refine(
    (value) => !value.published || !value.updated || value.updated >= value.published,
    'updated must not precede published',
  );
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

export function parseDocument(sourcePath: string, source: string): DocumentRecord {
  const { content, data } = matter(source);
  const metadata = metadataSchema.parse(data);
  const tree = parser.parse(content);
  const slugger = new GithubSlugger();
  const headings: DocumentRecord['headings'] = [];
  let title = metadata.title;
  visit(tree, 'heading', (node) => {
    const text = toString(node);
    const id = slugger.slug(text);
    if (node.depth === 1) title ??= text;
    headings.push({ id, text, depth: node.depth });
  });
  const paragraphs = tree.children.filter((node) => node.type !== 'html' && node.type !== 'code');
  const text = paragraphs.map((node) => toString(node)).join('\n');
  const description =
    metadata.description ??
    toString(tree.children.find((node) => node.type === 'paragraph') ?? { type: 'text', value: '' });
  const href = documentHref(sourcePath);
  return {
    ...metadata,
    sourcePath,
    slug: href.split('/').filter(Boolean),
    href,
    title: title ?? sourcePath,
    description: description.slice(0, 160),
    markdown: content,
    text,
    headings,
  };
}

export function documentLinks(document: DocumentRecord): string[] {
  const links: string[] = [];
  const tree = parser.parse(document.markdown);
  visit(tree, (node) => {
    if (node.type === 'link' || node.type === 'definition') links.push(resolveDocLink(node.url, document.sourcePath));
  });
  return links;
}

export function remarkDocumentLinks(options: { sourcePath: string; sourceRef: string }) {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type === 'link' || node.type === 'definition')
        node.url = resolveDocLink(node.url, options.sourcePath, options.sourceRef);
    });
  };
}
