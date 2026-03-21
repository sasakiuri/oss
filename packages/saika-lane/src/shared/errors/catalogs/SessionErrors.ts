// SPDX-License-Identifier: MIT
import type { ErrorDefinition } from '../ErrorCatalog';

export type SessionErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INVALID_OPERATION'
  | 'INVALID_IMPACT_POINT'
  | 'INVALID_SCORE'
  | 'INVALID_SHOT'
  | 'INVALID_SERIES'
  | 'INVALID_SESSION_STATE'
  | 'SESSION_ALREADY_FINISHED'
  | 'CURRENT_SERIES_NOT_FOUND'
  | 'SESSION_START_TIMEOUT';

export const SESSION_ERRORS: ReadonlyArray<[SessionErrorCode, ErrorDefinition]> = [
  [
    'SESSION_NOT_FOUND',
    {
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found',
      userMessage: 'Session not found',
      severity: 'error',
    },
  ],
  [
    'VALIDATION_ERROR',
    {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      userMessage: 'Invalid input',
      severity: 'warning',
    },
  ],
  [
    'INVALID_OPERATION',
    {
      code: 'INVALID_OPERATION',
      message: 'Invalid operation',
      userMessage: 'Invalid operation',
      severity: 'warning',
    },
  ],
  [
    'INVALID_IMPACT_POINT',
    {
      code: 'INVALID_IMPACT_POINT',
      message: 'Invalid impact point',
      userMessage: 'Invalid impact point',
      severity: 'error',
    },
  ],
  [
    'INVALID_SCORE',
    {
      code: 'INVALID_SCORE',
      message: 'Invalid score value',
      userMessage: 'Invalid score value',
      severity: 'error',
    },
  ],
  [
    'INVALID_SHOT',
    {
      code: 'INVALID_SHOT',
      message: 'Invalid shot data',
      userMessage: 'Invalid shot data',
      severity: 'error',
    },
  ],
  [
    'INVALID_SERIES',
    {
      code: 'INVALID_SERIES',
      message: 'Invalid series data',
      userMessage: 'Invalid series data',
      severity: 'error',
    },
  ],
  [
    'INVALID_SESSION_STATE',
    {
      code: 'INVALID_SESSION_STATE',
      message: 'Invalid session state',
      userMessage: 'Invalid session state',
      severity: 'error',
    },
  ],
  [
    'SESSION_ALREADY_FINISHED',
    {
      code: 'SESSION_ALREADY_FINISHED',
      message: 'Session is already finished',
      userMessage: 'Session is already finished',
      severity: 'warning',
    },
  ],
  [
    'CURRENT_SERIES_NOT_FOUND',
    {
      code: 'CURRENT_SERIES_NOT_FOUND',
      message: 'Current series not found',
      userMessage: 'Current series not found',
      severity: 'error',
    },
  ],
  [
    'SESSION_START_TIMEOUT',
    {
      code: 'SESSION_START_TIMEOUT',
      message: 'Session start timed out waiting for SessionStarted event',
      userMessage: 'Session start timed out',
      severity: 'error',
    },
  ],
];
