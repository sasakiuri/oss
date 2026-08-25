import type { ErrorCatalog } from './ErrorCatalog';

/** Shape of an error catalog entry */
export interface ErrorEntry {
  readonly code: string;
  readonly message: string;
}

/** Helper type: extract all error codes from the catalog */
type CatalogValues<T> = T[keyof T];
type FlattenCatalog<T> = CatalogValues<{ [K in keyof T]: CatalogValues<T[K]> }>;
export type ErrorCode = FlattenCatalog<typeof ErrorCatalog>['code'];
