// SPDX-License-Identifier: MIT
import type { ErrorCatalogEntries } from '../ErrorCatalog';

export const INFRA_ERRORS = {
  COMMAND_HANDLER_NOT_FOUND: {
    message: 'Command handler not found',
    userMessage: 'Command handler not found',
    severity: 'error',
  },
  COMMAND_DUPLICATE_HANDLER: {
    message: 'Duplicate command handler registration',
    userMessage: 'Duplicate command handler registration',
    severity: 'error',
  },
  QUERY_HANDLER_NOT_FOUND: {
    message: 'Query handler not found',
    userMessage: 'Query handler not found',
    severity: 'error',
  },
  QUERY_DUPLICATE_HANDLER: {
    message: 'Duplicate query handler registration',
    userMessage: 'Duplicate query handler registration',
    severity: 'error',
  },
  IPC_HANDLER_MISSING: {
    message: 'IPC handler is missing',
    userMessage: 'IPC handler not found',
    severity: 'error',
  },
  IPC_DUPLICATE_CHANNEL: {
    message: 'IPC duplicate channel registration',
    userMessage: 'Duplicate IPC channel registration',
    severity: 'error',
  },
  LOGGER_NOT_INITIALIZED: {
    message: 'Logger has not been initialized',
    userMessage: 'Logger has not been initialized',
    severity: 'error',
  },
  SETTINGS_NOT_FOUND: {
    message: 'Settings not found',
    userMessage: 'Settings not found',
    severity: 'error',
  },
  STORAGE_DATA_CORRUPTED: {
    message: 'Storage data is corrupted',
    userMessage: 'Storage data is corrupted',
    severity: 'error',
  },
  UNKNOWN_ERROR: {
    message: 'Unknown error occurred',
    userMessage: 'An unexpected error occurred',
    severity: 'error',
  },
} satisfies ErrorCatalogEntries;
