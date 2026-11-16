// SPDX-License-Identifier: MIT
import type { ErrorCatalogEntries } from '../ErrorCatalog';

export const REPORT_ERRORS = {
  PRINT_FAILED: {
    message: 'Printing failed: {{reason}}',
    userMessage: 'Printing failed: {{reason}}',
    severity: 'error',
  },
  PRINTER_UNAVAILABLE: {
    message: 'The saved printer is unavailable. Check Settings > Printing.',
    userMessage: 'The saved printer is unavailable. Check Settings > Printing.',
    severity: 'error',
  },
  PRINT_IN_PROGRESS: {
    message: 'A print job is already in progress.',
    userMessage: 'A print job is already in progress.',
    severity: 'warning',
  },
  PRINT_WINDOW_CREATION_FAILED: {
    message: 'Failed to create print window',
    userMessage: 'Failed to create print window',
    severity: 'error',
  },
} satisfies ErrorCatalogEntries;
