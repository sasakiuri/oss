// SPDX-License-Identifier: MIT
import { app } from 'electron';

import { DomainError } from '@/shared/errors/DomainError';
import type { IpcErrorDto } from '@/shared/ipc/defineContract';

/**
 * Detect production environment.
 *
 * Uses Electron's `app.isPackaged` with a try-catch fallback
 * for test environments where `app` may not be available.
 */
function isProduction(): boolean {
  try {
    return app.isPackaged;
  } catch {
    // app is not available (e.g. test environment) -- treat as dev
    return false;
  }
}

/**
 * Convert a DomainError or generic Error into an IpcErrorDto for IPC transport.
 *
 * Security considerations:
 * - Stack traces are excluded in production builds
 * - Only error code and safe message are returned
 *
 * @param error - The source error to convert
 * @param metadata - Additional context information (optional)
 * @returns IpcErrorDto formatted error object
 */
export function toIpcError(error: unknown, metadata?: Record<string, unknown>): IpcErrorDto {
  const err = error instanceof Error ? error : new Error(String(error));
  const isDomain = err instanceof DomainError;
  const isProd = isProduction();

  const ipcError: IpcErrorDto = {
    code: isDomain ? err.code : 'UNKNOWN_ERROR',
    message: err.message,
  };

  // Include stack traces only in development
  if (!isProd && err.stack) {
    ipcError.stack = err.stack;
  }

  // Merge DomainError metadata with caller-provided metadata
  const mergedMetadata = {
    ...(isDomain && err.metadata ? err.metadata : {}),
    ...(metadata && Object.keys(metadata).length > 0 ? metadata : {}),
  };
  if (Object.keys(mergedMetadata).length > 0) {
    ipcError.metadata = mergedMetadata;
  }

  return ipcError;
}
