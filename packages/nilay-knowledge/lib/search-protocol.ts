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

export interface SearchWorkerApi {
  load(): Promise<void>;
  search(query: string): Promise<SearchResults>;
}
