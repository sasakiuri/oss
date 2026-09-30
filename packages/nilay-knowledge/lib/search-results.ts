import type { SearchResult } from 'minisearch';

import type { PdfSearchMetadata } from './content/pdf-metadata';
import { searchExcerpt } from './search';
import {
  searchInitialMatchSize,
  searchMatchPageSize,
  searchPageSize,
  type SearchGroup,
  type SearchHit,
  type SearchMatches,
  type SearchResults,
} from './search-protocol';

/** Retain exact ranking and totals; prepare excerpts only for the requested bounded batch. */
export function createSearchSession(
  results: SearchResult[],
  query: string,
  generation: number,
  metadata: ReadonlyMap<string, PdfSearchMetadata> = new Map(),
  excerpt = searchExcerpt,
) {
  const byId = new Map<string, { group: Omit<SearchGroup, 'matches' | 'nextMatchOffset'>; matches: SearchResult[] }>();
  for (const result of results) {
    const id = String(result.id).split('#')[0]!;
    let stored = byId.get(id);
    if (!stored) {
      stored = {
        group: {
          id,
          type: result.type,
          title: String(result.title),
          totalMatches: 0,
          ...(metadata.has(id) ? { pdf: metadata.get(id)! } : {}),
        },
        matches: [],
      };
      byId.set(id, stored);
    }
    stored.matches.push(result);
    stored.group.totalMatches += 1;
  }
  const groups = [...byId.values()];
  const hit = (result: SearchResult): SearchHit => ({
    id: String(result.id),
    section: String(result.section),
    excerpt: excerpt(String(result.text), query),
  });
  function validateOffset(offset: number) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid search offset');
  }
  return {
    page(offset = 0): SearchResults {
      validateOffset(offset);
      return {
        generation,
        total: groups.length,
        totalMatches: results.length,
        groups: groups.slice(offset, offset + searchPageSize).map(({ group, matches }) => ({
          ...group,
          matches: matches.slice(0, searchInitialMatchSize).map(hit),
          nextMatchOffset: matches.length > searchInitialMatchSize ? searchInitialMatchSize : null,
        })),
        nextOffset: offset + searchPageSize < groups.length ? offset + searchPageSize : null,
      };
    },
    matches(id: string, offset: number): SearchMatches {
      validateOffset(offset);
      const stored = byId.get(id);
      if (!stored) throw new Error('Unknown search document');
      return {
        generation,
        id,
        total: stored.matches.length,
        matches: stored.matches.slice(offset, offset + searchMatchPageSize).map(hit),
        nextOffset: offset + searchMatchPageSize < stored.matches.length ? offset + searchMatchPageSize : null,
      };
    },
  };
}
