// SPDX-License-Identifier: MIT
import type { ErrorDefinition } from '../ErrorCatalog';

export type TargetErrorCode =
  | 'INVALID_TARGET'
  | 'INVALID_TARGET_DESIGN'
  | 'UNKNOWN_DISCIPLINE'
  | 'UNKNOWN_MODE'
  | 'UNKNOWN_MANUFACTURER'
  | 'UNKNOWN_DEVICE_ID'
  | 'UNKNOWN_CONNECTION_STATUS';

export const TARGET_ERRORS: ReadonlyArray<[TargetErrorCode, ErrorDefinition]> = [
  [
    'INVALID_TARGET',
    {
      code: 'INVALID_TARGET',
      message: 'Invalid target configuration',
      userMessage: 'Invalid target configuration',
      severity: 'error',
    },
  ],
  [
    'INVALID_TARGET_DESIGN',
    {
      code: 'INVALID_TARGET_DESIGN',
      message: 'Invalid target design',
      userMessage: 'Invalid target design',
      severity: 'error',
    },
  ],
  [
    'UNKNOWN_DISCIPLINE',
    {
      code: 'UNKNOWN_DISCIPLINE',
      message: 'Unknown discipline',
      userMessage: 'Unknown discipline',
      severity: 'error',
    },
  ],
  [
    'UNKNOWN_MODE',
    {
      code: 'UNKNOWN_MODE',
      message: 'Unknown mode',
      userMessage: 'Unknown mode',
      severity: 'error',
    },
  ],
  [
    'UNKNOWN_MANUFACTURER',
    {
      code: 'UNKNOWN_MANUFACTURER',
      message: 'Unknown manufacturer',
      userMessage: 'Unknown manufacturer',
      severity: 'error',
    },
  ],
  [
    'UNKNOWN_DEVICE_ID',
    {
      code: 'UNKNOWN_DEVICE_ID',
      message: 'Unknown device ID',
      userMessage: 'Unknown device ID',
      severity: 'error',
    },
  ],
  [
    'UNKNOWN_CONNECTION_STATUS',
    {
      code: 'UNKNOWN_CONNECTION_STATUS',
      message: 'Unknown connection status',
      userMessage: 'Unknown connection status',
      severity: 'error',
    },
  ],
];
