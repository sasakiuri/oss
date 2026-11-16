// SPDX-License-Identifier: MIT
import type { ErrorCatalogEntries } from '../ErrorCatalog';

export const CONNECTION_ERRORS = {
  CONNECTION_FAILED: {
    message: 'Failed to connect to target',
    userMessage: 'Failed to connect to target',
    severity: 'error',
  },
  DATA_CONVERSION_ERROR: {
    message: 'Failed to convert data',
    userMessage: 'Failed to convert data',
    severity: 'error',
  },
  USB_WRITE_FAILED: {
    message: 'Failed to write to USB port',
    userMessage: 'Failed to write to USB port',
    severity: 'error',
  },
  USB_PARSE_ERROR: {
    message: 'Failed to parse USB data',
    userMessage: 'Failed to parse USB data',
    severity: 'error',
  },
  RED_DOT_INITIALIZATION_FAILED: {
    message: 'RedDot target-type initialization failed',
    userMessage: 'Failed to configure the RedDot target type',
    severity: 'error',
  },
  INVALID_PORT_PATH: {
    message: 'Invalid port path',
    userMessage: 'Invalid port path',
    severity: 'error',
  },
  INVALID_BAUD_RATE: {
    message: 'Invalid baud rate',
    userMessage: 'Invalid baud rate',
    severity: 'error',
  },
  CONNECTION_NOT_FOUND: {
    message: 'Connection not found',
    userMessage: 'Connection not found',
    severity: 'error',
  },
  CONNECTION_TIMEOUT: {
    message: 'Connection timeout: No response from target within {{timeoutMs}}ms',
    userMessage: 'Connection timeout: No response from target within {{timeoutMs}}ms',
    severity: 'error',
  },
  MAX_RECONNECT_EXCEEDED: {
    message: 'Max reconnect attempts exceeded',
    userMessage: 'Max reconnect attempts exceeded',
    severity: 'warning',
  },
} satisfies ErrorCatalogEntries;
