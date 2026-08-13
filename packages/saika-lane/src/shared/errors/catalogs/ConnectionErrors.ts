// SPDX-License-Identifier: MIT
import type { ErrorDefinition } from '../ErrorCatalog';

export type ConnectionErrorCode =
  | 'CONNECTION_FAILED'
  | 'DATA_CONVERSION_ERROR'
  | 'USB_PORT_NOT_FOUND'
  | 'USB_OPEN_FAILED'
  | 'USB_WRITE_FAILED'
  | 'USB_READ_TIMEOUT'
  | 'USB_PARSE_ERROR'
  | 'RED_DOT_INITIALIZATION_FAILED'
  | 'USB_DEVICE_BUSY'
  | 'INVALID_PORT_PATH'
  | 'INVALID_BAUD_RATE'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_TIMEOUT'
  | 'MAX_RECONNECT_EXCEEDED';

export const CONNECTION_ERRORS: ReadonlyArray<[ConnectionErrorCode, ErrorDefinition]> = [
  [
    'CONNECTION_FAILED',
    {
      code: 'CONNECTION_FAILED',
      message: 'Failed to connect to target',
      userMessage: 'Failed to connect to target',
      severity: 'error',
    },
  ],
  [
    'DATA_CONVERSION_ERROR',
    {
      code: 'DATA_CONVERSION_ERROR',
      message: 'Failed to convert data',
      userMessage: 'Failed to convert data',
      severity: 'error',
    },
  ],
  [
    'USB_PORT_NOT_FOUND',
    {
      code: 'USB_PORT_NOT_FOUND',
      message: 'USB port not found',
      userMessage: 'USB port not found',
      severity: 'error',
    },
  ],
  [
    'USB_OPEN_FAILED',
    {
      code: 'USB_OPEN_FAILED',
      message: 'Failed to open USB port',
      userMessage: 'Failed to open USB port',
      severity: 'error',
    },
  ],
  [
    'USB_WRITE_FAILED',
    {
      code: 'USB_WRITE_FAILED',
      message: 'Failed to write to USB port',
      userMessage: 'Failed to write to USB port',
      severity: 'error',
    },
  ],
  [
    'USB_READ_TIMEOUT',
    {
      code: 'USB_READ_TIMEOUT',
      message: 'USB read timeout',
      userMessage: 'USB port read timed out',
      severity: 'warning',
    },
  ],
  [
    'USB_PARSE_ERROR',
    {
      code: 'USB_PARSE_ERROR',
      message: 'Failed to parse USB data',
      userMessage: 'Failed to parse USB data',
      severity: 'error',
    },
  ],
  [
    'RED_DOT_INITIALIZATION_FAILED',
    {
      code: 'RED_DOT_INITIALIZATION_FAILED',
      message: 'RedDot target-type initialization failed',
      userMessage: 'Failed to configure the RedDot target type',
      severity: 'error',
    },
  ],
  [
    'USB_DEVICE_BUSY',
    {
      code: 'USB_DEVICE_BUSY',
      message: 'USB device is busy',
      userMessage: 'USB device is busy',
      severity: 'warning',
    },
  ],
  [
    'INVALID_PORT_PATH',
    {
      code: 'INVALID_PORT_PATH',
      message: 'Invalid port path',
      userMessage: 'Invalid port path',
      severity: 'error',
    },
  ],
  [
    'INVALID_BAUD_RATE',
    {
      code: 'INVALID_BAUD_RATE',
      message: 'Invalid baud rate',
      userMessage: 'Invalid baud rate',
      severity: 'error',
    },
  ],
  [
    'CONNECTION_NOT_FOUND',
    {
      code: 'CONNECTION_NOT_FOUND',
      message: 'Connection not found',
      userMessage: 'Connection not found',
      severity: 'error',
    },
  ],
  [
    'CONNECTION_TIMEOUT',
    {
      code: 'CONNECTION_TIMEOUT',
      message: 'Connection timeout: No response from target within {{timeoutMs}}ms',
      userMessage: 'Connection timeout: No response from target within {{timeoutMs}}ms',
      severity: 'error',
    },
  ],
  [
    'MAX_RECONNECT_EXCEEDED',
    {
      code: 'MAX_RECONNECT_EXCEEDED',
      message: 'Max reconnect attempts exceeded',
      userMessage: 'Max reconnect attempts exceeded',
      severity: 'warning',
    },
  ],
];
