import { app } from 'electron';
import type { IpcError } from '@/shared/ipc/defineContract';
import { DomainError } from '@/shared/errors';

/**
 * Determines whether the app is running in production via Electron app.isPackaged.
 */
function isProduction(): boolean {
  try {
    return app.isPackaged;
  } catch {
    // Treat environments without Electron app, such as tests, as development.
    return false;
  }
}

/**
 * Converts a DomainError or general Error to an IpcError.
 *
 * Production responses omit stack traces and expose only a safe code and message.
 *
 * @param error Source error.
 * @param metadata Optional context.
 * @returns An IpcError object.
 */
export function toIpcError(error: unknown, metadata?: Record<string, unknown>): IpcError {
  const err = error instanceof Error ? error : new Error(String(error));
  const isDomain = err instanceof DomainError;
  const isProd = isProduction();

  const ipcError: IpcError = {
    code: isDomain ? err.code : 'UNKNOWN_ERROR',
    message: err.message,
  };

  // Include stack traces only in development.
  if (!isProd && err.stack) {
    ipcError.stack = err.stack;
  }

  // Merge DomainError metadata.
  const mergedMetadata = {
    ...(isDomain && err.metadata ? err.metadata : {}),
    ...(metadata && Object.keys(metadata).length > 0 ? metadata : {}),
  };
  if (Object.keys(mergedMetadata).length > 0) {
    ipcError.metadata = mergedMetadata;
  }

  return ipcError;
}
