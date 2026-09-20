export const contentTypes = ['articles', 'news'] as const;

export type ContentType = (typeof contentTypes)[number];

export interface ContentFrontmatter {
  title: string;
  published: string;
  updated?: string;
  tags: string[];
  image?: string;
}

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
