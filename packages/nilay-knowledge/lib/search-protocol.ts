import type { PdfSearchMetadata } from './content/pdf-metadata';
import type { ContentType } from './content/types';

export interface SearchHit {
  id: string;
  section: string;
  excerpt: string;
}

export interface SearchGroup {
  /** Article/news URL or PDF file URL, without a section/page fragment. */
  id: string;
  type: ContentType | 'pdf';
  title: string;
  /** Initial or already loaded sections/pages, in relevance order. */
  matches: SearchHit[];
  totalMatches: number;
  nextMatchOffset: number | null;
  pdf?: PdfSearchMetadata;
}

export interface SearchResults {
  generation: number;
  /** Number of matching articles, news items or PDF files. */
  total: number;
  totalMatches: number;
  groups: SearchGroup[];
  nextOffset: number | null;
}

export interface SearchMatches {
  generation: number;
  id: string;
  total: number;
  matches: SearchHit[];
  nextOffset: number | null;
}

export interface SearchWorkerApi {
  load(): Promise<void>;
  matches(generation: number, id: string, offset: number): Promise<SearchMatches>;
  search(query: string, scope?: SearchScope, offset?: number): Promise<SearchResults>;
}

export const searchPageSize = 20;
export const searchInitialMatchSize = 1;
export const searchMatchPageSize = 20;

export const searchScopes = ['all', 'articles', 'news', 'pdf'] as const;
export type SearchScope = (typeof searchScopes)[number];
