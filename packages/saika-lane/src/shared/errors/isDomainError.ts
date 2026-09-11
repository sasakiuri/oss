// SPDX-License-Identifier: MIT
import { DomainError } from './DomainError';

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
