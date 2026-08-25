import type { ErrorEntry } from './ErrorCodes';

export class DomainError extends Error {
  public readonly code: string;
  public readonly metadata?: Record<string, unknown>;
  public readonly cause?: Error;

  constructor(
    entry: ErrorEntry,
    options?: { cause?: Error; metadata?: Record<string, unknown>; messageOverride?: string },
  ) {
    super(options?.messageOverride ?? entry.message);
    this.name = 'DomainError';
    this.code = entry.code;
    this.metadata = options?.metadata;
    this.cause = options?.cause;
  }

  /** Factory method: create from catalog entry */
  static from(entry: ErrorEntry, metadata?: Record<string, unknown>): DomainError {
    return new DomainError(entry, { metadata });
  }

  /** Factory method: wrap another error */
  static wrap(entry: ErrorEntry, cause: Error, metadata?: Record<string, unknown>): DomainError {
    return new DomainError(entry, { cause, metadata });
  }
}
