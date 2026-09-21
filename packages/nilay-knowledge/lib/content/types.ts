import type { z } from 'zod';

import type { frontmatterSchema, searchDocumentSchema } from './schemas';

export const contentTypes = ['articles', 'news'] as const;

export type ContentType = (typeof contentTypes)[number];

export type ContentFrontmatter = z.infer<typeof frontmatterSchema>;

export interface ContentSummary {
  type: ContentType;
  slug: string;
  frontmatter: ContentFrontmatter;
}

export interface ContentSource extends ContentSummary {
  content: string;
}

export interface TocItem {
  id: string;
  title: string;
  level: number;
}

export interface RenderedContent {
  html: string;
  tableOfContents: TocItem[];
}

export interface ContentDocument extends ContentSource, RenderedContent {}

export type SearchDocument = z.infer<typeof searchDocumentSchema>;
