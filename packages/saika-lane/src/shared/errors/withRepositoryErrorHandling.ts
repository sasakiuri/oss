// SPDX-License-Identifier: MIT
import { ErrorCatalog, type ErrorCode } from './ErrorCatalog';
import { toError } from './toError';

/**
 * Common try-catch wrapper for the repository layer.
 *
 * Executes an async function and, if an exception occurs, wraps it with ErrorCatalog.createError and rethrows.
 */
export async function withRepositoryErrorHandling<T>(
  fn: () => Promise<T>,
  errorCode: ErrorCode,
  metadata?: Record<string, unknown>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw ErrorCatalog.createError(errorCode, metadata, toError(error));
  }
}
