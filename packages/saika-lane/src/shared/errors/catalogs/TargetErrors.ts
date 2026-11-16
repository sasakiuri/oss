// SPDX-License-Identifier: MIT
import type { ErrorCatalogEntries } from '../ErrorCatalog';

export const TARGET_ERRORS = {
  INVALID_TARGET: {
    message: 'Invalid target configuration',
    userMessage: 'Invalid target configuration',
    severity: 'error',
  },
  INCOMPATIBLE_TARGET_DISCIPLINE: {
    message: 'Target {{deviceId}} requires {{requiredDiscipline}}, but the active session uses {{currentDiscipline}}',
    userMessage:
      'Select a {{requiredDiscipline}} competition before connecting target {{deviceId}} (current: {{currentDiscipline}})',
    severity: 'error',
  },
  INVALID_TARGET_DESIGN: {
    message: 'Invalid target design',
    userMessage: 'Invalid target design',
    severity: 'error',
  },
  UNKNOWN_DISCIPLINE: {
    message: 'Unknown discipline',
    userMessage: 'Unknown discipline',
    severity: 'error',
  },
  UNKNOWN_MODE: {
    message: 'Unknown mode',
    userMessage: 'Unknown mode',
    severity: 'error',
  },
  UNKNOWN_MANUFACTURER: {
    message: 'Unknown manufacturer',
    userMessage: 'Unknown manufacturer',
    severity: 'error',
  },
  UNKNOWN_DEVICE_ID: {
    message: 'Unknown device ID',
    userMessage: 'Unknown device ID',
    severity: 'error',
  },
  UNKNOWN_CONNECTION_STATUS: {
    message: 'Unknown connection status',
    userMessage: 'Unknown connection status',
    severity: 'error',
  },
} satisfies ErrorCatalogEntries;
