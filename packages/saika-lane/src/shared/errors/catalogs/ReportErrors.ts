// SPDX-License-Identifier: MIT
import type { ErrorDefinition } from '../ErrorCatalog';

export type ReportErrorCode =
  | 'SCORE_SHEET_GENERATION_FAILED'
  | 'PRINT_WINDOW_CREATION_FAILED'
  | 'PRINT_FAILED'
  | 'PRINTER_UNAVAILABLE'
  | 'PRINT_IN_PROGRESS';

export const REPORT_ERRORS: ReadonlyArray<[ReportErrorCode, ErrorDefinition]> = [
  [
    'PRINT_FAILED',
    {
      code: 'PRINT_FAILED',
      message: 'Printing failed: {{reason}}',
      userMessage: 'Printing failed: {{reason}}',
      severity: 'error',
    },
  ],
  [
    'PRINTER_UNAVAILABLE',
    {
      code: 'PRINTER_UNAVAILABLE',
      message: 'The saved printer is unavailable. Check Settings > Printing.',
      userMessage: 'The saved printer is unavailable. Check Settings > Printing.',
      severity: 'error',
    },
  ],
  [
    'PRINT_IN_PROGRESS',
    {
      code: 'PRINT_IN_PROGRESS',
      message: 'A print job is already in progress.',
      userMessage: 'A print job is already in progress.',
      severity: 'warning',
    },
  ],
  [
    'SCORE_SHEET_GENERATION_FAILED',
    {
      code: 'SCORE_SHEET_GENERATION_FAILED',
      message: 'Failed to generate score sheet',
      userMessage: 'Failed to generate score sheet',
      severity: 'error',
    },
  ],
  [
    'PRINT_WINDOW_CREATION_FAILED',
    {
      code: 'PRINT_WINDOW_CREATION_FAILED',
      message: 'Failed to create print window',
      userMessage: 'Failed to create print window',
      severity: 'error',
    },
  ],
];
