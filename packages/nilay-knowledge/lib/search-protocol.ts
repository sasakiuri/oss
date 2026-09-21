import type { ContentType } from './content/types';

export interface SearchHit {
  id: string;
  type: ContentType | 'pdf';
  title: string;
  section: string;
  excerpt: string;
}

export interface SearchResults {
  total: number;
  hits: SearchHit[];
}

export interface SearchWorkerApi {
  load(): Promise<void>;
  search(query: string, scope?: SearchScope): Promise<SearchResults>;
}

export const searchScopes = ['all', 'articles', 'news', 'pdf'] as const;
export type SearchScope = (typeof searchScopes)[number];
