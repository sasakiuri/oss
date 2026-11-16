// SPDX-License-Identifier: MIT
import type { IpcErrorDto } from '@sasakiuri/saika-ipc';

import type { ElectronAPI } from '@/shared/types/ElectronAPI';

export class ServiceError extends Error {
  readonly code: string;
  readonly metadata?: Record<string, unknown>;

  constructor(message: string, code: string, metadata?: Record<string, unknown>) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.metadata = metadata;
  }
}

/**
 * Any IPC response: void commands carry no `data`, data commands omit it on failure,
 * and failed queries carry `data: null`.
 */
interface IpcResponse {
  success: boolean;
  data?: unknown;
  error?: IpcErrorDto;
}

type SuccessResponse<R> = Extract<R, { success: true }>;

/** The data of a successful response, or `void` for a command that returns none. */
export type ResponseData<R> = [SuccessResponse<R>] extends [never]
  ? void
  : SuccessResponse<R> extends { data: infer D }
    ? D
    : void;

/**
 * Call an IPC bridge method and return the response data.
 * Throws a ServiceError with the response's error, or with code `IPC_ERROR` when the call itself fails.
 */
export async function unwrap<R extends IpcResponse>(call: () => Promise<R>): Promise<ResponseData<R>> {
  try {
    const response = await call();
    if (!response.success) {
      const error = response.error ?? { code: 'UNKNOWN', message: 'Unknown error' };
      throw new ServiceError(error.message, error.code, error.metadata);
    }
    return response.data as ResponseData<R>;
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(err instanceof Error ? err.message : String(err), 'IPC_ERROR');
  }
}

/**
 * Create a service method from a bridge method of `window.electronAPI`, which is looked up on each call.
 * Input and output types come from the bridge.
 */
export function createServiceMethod<TArgs extends unknown[], R extends IpcResponse>(
  select: (api: ElectronAPI) => (...args: TArgs) => Promise<R>,
): (...args: TArgs) => Promise<ResponseData<R>> {
  return (...args) => unwrap(() => select(window.electronAPI)(...args));
}
