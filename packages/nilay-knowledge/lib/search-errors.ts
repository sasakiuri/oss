/** An index-specific failure leaves the worker and its other cached index usable. */
export class SearchIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchIndexError';
  }
}

/** Repeating the same download cannot change an incompatible reader's format support. */
export class SearchIndexCompatibilityError extends SearchIndexError {
  constructor() {
    super('Search index format is incompatible');
    this.name = 'SearchIndexCompatibilityError';
  }
}

/** Comlink preserves an error's name, but not its original subclass prototype. */
export function isSearchIndexCompatibilityError(error: unknown): boolean {
  return error instanceof Error && error.name === 'SearchIndexCompatibilityError';
}

export function isSearchIndexError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'SearchIndexError' || isSearchIndexCompatibilityError(error));
}

export function normalizeSearchError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Search unavailable');
}
