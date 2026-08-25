import { DomainError } from '../errors/DomainError';

/**
 * Checks whether a value is a DomainError.
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Checks whether a value is an Error with a code property.
 */
export function isErrorWithCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof (error as Record<string, unknown>).code === 'string';
}
