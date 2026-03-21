// SPDX-License-Identifier: MIT
import type { ErrorDefinition } from '../ErrorCatalog';

export type StorageErrorCode =
  | 'STORAGE_READ_ERROR'
  | 'STORAGE_WRITE_ERROR'
  | 'STORAGE_DELETE_ERROR'
  | 'REPOSITORY_ERROR';

export const STORAGE_ERRORS: ReadonlyArray<[StorageErrorCode, ErrorDefinition]> = [
  [
    'STORAGE_READ_ERROR',
    {
      code: 'STORAGE_READ_ERROR',
      message: 'Failed to read from storage',
      userMessage: 'Failed to read from storage',
      severity: 'error',
    },
  ],
  [
    'STORAGE_WRITE_ERROR',
    {
      code: 'STORAGE_WRITE_ERROR',
      message: 'Failed to write to storage',
      userMessage: 'Failed to write to storage',
      severity: 'error',
    },
  ],
  [
    'STORAGE_DELETE_ERROR',
    {
      code: 'STORAGE_DELETE_ERROR',
      message: 'Failed to delete from storage',
      userMessage: 'Failed to delete from storage',
      severity: 'error',
    },
  ],
  [
    'REPOSITORY_ERROR',
    {
      code: 'REPOSITORY_ERROR',
      message: 'Repository operation failed',
      userMessage: 'Repository operation failed',
      severity: 'error',
    },
  ],
];
