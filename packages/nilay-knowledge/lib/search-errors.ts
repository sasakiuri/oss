/** An index-specific failure leaves the worker and its other cached index usable. */
export class SearchIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchIndexError';
  }
}

/** Comlink preserves an error's name, but not its original subclass prototype. */
export function isSearchIndexError(error: unknown): boolean {
  return error instanceof Error && error.name === 'SearchIndexError';
}
