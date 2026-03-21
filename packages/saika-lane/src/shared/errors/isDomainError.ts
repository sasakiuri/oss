// SPDX-License-Identifier: MIT
import { DomainError } from './DomainError';

/**
 * DomainError type guard
 *
 * Determines whether an unknown error value is an instance of DomainError.
 * Used in catch clauses to decide whether to rethrow.
 *
 * @param error - The value to check
 * @returns true if the value is a DomainError instance
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
