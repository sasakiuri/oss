// SPDX-License-Identifier: MIT
import type { ErrorCatalogEntries } from '../ErrorCatalog';

export const SESSION_ERRORS = {
  SESSION_NOT_FOUND: {
    message: 'Session not found',
    userMessage: 'Session not found',
    severity: 'error',
  },
  VALIDATION_ERROR: {
    message: 'Validation failed',
    userMessage: 'Invalid input',
    severity: 'warning',
  },
  INVALID_IMPACT_POINT: {
    message: 'Invalid impact point',
    userMessage: 'Invalid impact point',
    severity: 'error',
  },
  INVALID_SCORE: {
    message: 'Invalid score value',
    userMessage: 'Invalid score value',
    severity: 'error',
  },
  INVALID_SHOT: {
    message: 'Invalid shot data',
    userMessage: 'Invalid shot data',
    severity: 'error',
  },
  INVALID_SERIES: {
    message: 'Invalid series data',
    userMessage: 'Invalid series data',
    severity: 'error',
  },
  INVALID_SESSION_STATE: {
    message: 'Invalid session state',
    userMessage: 'Invalid session state',
    severity: 'error',
  },
  SESSION_ALREADY_FINISHED: {
    message: 'Session is already finished',
    userMessage: 'Session is already finished',
    severity: 'warning',
  },
  CURRENT_SERIES_NOT_FOUND: {
    message: 'Current series not found',
    userMessage: 'Current series not found',
    severity: 'error',
  },
} satisfies ErrorCatalogEntries;
