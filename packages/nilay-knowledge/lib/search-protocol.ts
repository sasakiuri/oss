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
  /** All matching sections/pages, in relevance order. */
  matches: SearchHit[];
}

export interface SearchResults {
  /** Number of matching articles, news items or PDF files. */
  total: number;
  totalMatches: number;
  groups: SearchGroup[];
  nextOffset: number | null;
}

export interface SearchWorkerApi {
  load(): Promise<void>;
  search(query: string, scope?: SearchScope, offset?: number): Promise<SearchResults>;
}

export const searchPageSize = 20;

export const searchScopes = ['all', 'articles', 'news', 'pdf'] as const;
export type SearchScope = (typeof searchScopes)[number];
