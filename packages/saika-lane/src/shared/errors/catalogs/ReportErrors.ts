// SPDX-License-Identifier: MIT
import type { ErrorDefinition } from '../ErrorCatalog';

export type ReportErrorCode = 'SCORE_SHEET_GENERATION_FAILED' | 'PRINT_WINDOW_CREATION_FAILED';

export const REPORT_ERRORS: ReadonlyArray<[ReportErrorCode, ErrorDefinition]> = [
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
