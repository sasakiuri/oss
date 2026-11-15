import type { IpcErrorDto } from '@/shared/ipc/contracts';

/** A successful IPC response. */
export function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

/**
 * A failed IPC response shaped like the one main returns for a thrown error. It carries `data: null`, so it fits
 * both query and command response types.
 */
export function fail(message: string, code = 'UNKNOWN_ERROR'): { success: false; data: null; error: IpcErrorDto } {
  return { success: false, data: null, error: { code, message } };
}
