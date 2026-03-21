// SPDX-License-Identifier: MIT
import type { ErrorDefinition } from '../ErrorCatalog';

export type InfraErrorCode =
  | 'EVENTBUS_ERROR'
  | 'COMMAND_HANDLER_NOT_FOUND'
  | 'COMMAND_DUPLICATE_HANDLER'
  | 'QUERY_HANDLER_NOT_FOUND'
  | 'QUERY_DUPLICATE_HANDLER'
  | 'IPC_HANDLER_MISSING'
  | 'IPC_DUPLICATE_CHANNEL'
  | 'LOGGER_NOT_INITIALIZED'
  | 'SETTINGS_NOT_FOUND'
  | 'STORAGE_DATA_CORRUPTED'
  | 'WINDOW_NOT_FOUND'
  | 'UNKNOWN_ERROR';

export const INFRA_ERRORS: ReadonlyArray<[InfraErrorCode, ErrorDefinition]> = [
  [
    'EVENTBUS_ERROR',
    {
      code: 'EVENTBUS_ERROR',
      message: 'EventBus operation failed',
      userMessage: 'EventBus operation failed',
      severity: 'error',
    },
  ],
  [
    'COMMAND_HANDLER_NOT_FOUND',
    {
      code: 'COMMAND_HANDLER_NOT_FOUND',
      message: 'Command handler not found',
      userMessage: 'Command handler not found',
      severity: 'error',
    },
  ],
  [
    'COMMAND_DUPLICATE_HANDLER',
    {
      code: 'COMMAND_DUPLICATE_HANDLER',
      message: 'Duplicate command handler registration',
      userMessage: 'Duplicate command handler registration',
      severity: 'error',
    },
  ],
  [
    'QUERY_HANDLER_NOT_FOUND',
    {
      code: 'QUERY_HANDLER_NOT_FOUND',
      message: 'Query handler not found',
      userMessage: 'Query handler not found',
      severity: 'error',
    },
  ],
  [
    'QUERY_DUPLICATE_HANDLER',
    {
      code: 'QUERY_DUPLICATE_HANDLER',
      message: 'Duplicate query handler registration',
      userMessage: 'Duplicate query handler registration',
      severity: 'error',
    },
  ],
  [
    'IPC_HANDLER_MISSING',
    {
      code: 'IPC_HANDLER_MISSING',
      message: 'IPC handler is missing',
      userMessage: 'IPC handler not found',
      severity: 'error',
    },
  ],
  [
    'IPC_DUPLICATE_CHANNEL',
    {
      code: 'IPC_DUPLICATE_CHANNEL',
      message: 'IPC duplicate channel registration',
      userMessage: 'Duplicate IPC channel registration',
      severity: 'error',
    },
  ],
  [
    'LOGGER_NOT_INITIALIZED',
    {
      code: 'LOGGER_NOT_INITIALIZED',
      message: 'Logger has not been initialized',
      userMessage: 'Logger has not been initialized',
      severity: 'error',
    },
  ],
  [
    'SETTINGS_NOT_FOUND',
    {
      code: 'SETTINGS_NOT_FOUND',
      message: 'Settings not found',
      userMessage: 'Settings not found',
      severity: 'error',
    },
  ],
  [
    'STORAGE_DATA_CORRUPTED',
    {
      code: 'STORAGE_DATA_CORRUPTED',
      message: 'Storage data is corrupted',
      userMessage: 'Storage data is corrupted',
      severity: 'error',
    },
  ],
  [
    'WINDOW_NOT_FOUND',
    {
      code: 'WINDOW_NOT_FOUND',
      message: 'No focused window found',
      userMessage: 'No focused window found',
      severity: 'error',
    },
  ],
  [
    'UNKNOWN_ERROR',
    {
      code: 'UNKNOWN_ERROR',
      message: 'Unknown error occurred',
      userMessage: 'An unexpected error occurred',
      severity: 'error',
    },
  ],
];
