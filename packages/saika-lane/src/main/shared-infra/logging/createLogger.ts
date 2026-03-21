// SPDX-License-Identifier: MIT
import { BrowserWindow } from 'electron';

import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import { IpcLogger } from './IpcLogger';

let loggerInstance: IpcLogger | null = null;

/**
 * Initialize the IpcLogger (singleton)
 *
 * @param mainWindow - The BrowserWindow to send logs to
 * @returns IpcLogger instance
 */
export const initializeLogger = (mainWindow: BrowserWindow): IpcLogger => {
  if (!loggerInstance) {
    loggerInstance = new IpcLogger(mainWindow);
  }
  return loggerInstance;
};

/**
 * Get the initialized IpcLogger
 *
 * @throws Error if not initialized
 * @returns IpcLogger instance
 */
export const getLogger = (): IpcLogger => {
  if (!loggerInstance) {
    throw ErrorCatalog.createError('LOGGER_NOT_INITIALIZED');
  }
  return loggerInstance;
};

/**
 * Reset the IpcLogger for testing
 */
export const resetLogger = (): void => {
  loggerInstance = null;
};
