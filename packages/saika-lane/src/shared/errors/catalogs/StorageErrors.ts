// SPDX-License-Identifier: MIT
import type { ErrorCatalogEntries } from '../ErrorCatalog';

export const STORAGE_ERRORS = {
  STORAGE_READ_ERROR: {
    message: 'Failed to read from storage',
    userMessage: 'Failed to read from storage',
    severity: 'error',
  },
  STORAGE_WRITE_ERROR: {
    message: 'Failed to write to storage',
    userMessage: 'Failed to write to storage',
    severity: 'error',
  },
  STORAGE_DELETE_ERROR: {
    message: 'Failed to delete from storage',
    userMessage: 'Failed to delete from storage',
    severity: 'error',
  },
  REPOSITORY_ERROR: {
    message: 'Repository operation failed',
    userMessage: 'Repository operation failed',
    severity: 'error',
  },
} satisfies ErrorCatalogEntries;
