// SPDX-License-Identifier: MIT
/** Main-process conversion of thrown values into the IPC error DTO. */
import { app } from 'electron';

import type { IpcErrorDto } from './index';

/** The fields of an application's domain error that reach the renderer. */
interface DomainErrorFields {
  readonly code: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ToIpcErrorOptions {
  /** Recognizes the app's domain errors. Other errors are sent with the code `UNKNOWN_ERROR`. */
  readonly isDomainError: (error: Error) => error is Error & DomainErrorFields;
  /** Caller metadata, merged after the domain error's own metadata. */
  readonly metadata?: Record<string, unknown>;
}

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

/** Converts errors for IPC. Production responses omit stack traces. */
export function toIpcError(error: unknown, { isDomainError, metadata }: ToIpcErrorOptions): IpcErrorDto {
  const err = error instanceof Error ? error : new Error(String(error));
  const isDomain = isDomainError(err);
  const isProd = isProduction();

  const ipcError: IpcErrorDto = {
    code: isDomain ? err.code : 'UNKNOWN_ERROR',
    message: err.message,
  };

  // Include stack traces only in development
  if (!isProd && err.stack) {
    ipcError.stack = err.stack;
  }

  // Merge domain error metadata with caller-provided metadata
  const mergedMetadata = {
    ...(isDomain && err.metadata ? err.metadata : {}),
    ...(metadata && Object.keys(metadata).length > 0 ? metadata : {}),
  };
  if (Object.keys(mergedMetadata).length > 0) {
    ipcError.metadata = mergedMetadata;
  }

  return ipcError;
}
