import type { ContentType } from './content/types';

export interface SearchHit {
  id: string;
  type: ContentType;
  title: string;
  section: string;
  excerpt: string;
}

export interface SearchResults {
  total: number;
  hits: SearchHit[];
}

export type SearchRequest = { id: number; query?: string };
export type SearchResponse =
  { id: number; results: SearchResults } | { id: number; ready: true } | { id: number; error: string };
