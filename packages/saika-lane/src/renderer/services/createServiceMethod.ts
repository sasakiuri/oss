// SPDX-License-Identifier: MIT
import type { IpcErrorDto } from '@/shared/ipc/defineContract';

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
 * A response that carries data on success.
 * Covers both commandDataResponseSchema (no data on error)
 * and queryResponseSchema (data: null on error).
 */
interface DataResponse<T> {
  success: boolean;
  data?: T | null;
  error?: IpcErrorDto;
}

/**
 * A response for void commands (no data field).
 * Covers CommandResponseSchema: { success: boolean, error?: IpcErrorDto }
 */
interface VoidResponse {
  success: boolean;
  error?: IpcErrorDto;
}

/**
 * Create a service method that unwraps IPC response with data.
 * Returns the data on success, throws ServiceError on failure.
 */
export function createServiceMethod<TInput, TOutput>(
  apiCall: (input: TInput) => Promise<DataResponse<TOutput>>,
): (input: TInput) => Promise<TOutput> {
  return async (input: TInput) => {
    try {
      const response = await apiCall(input);
      if (!response.success) {
        const error = response.error ?? { code: 'UNKNOWN', message: 'Unknown error' };
        throw new ServiceError(error.message, error.code, error.metadata);
      }
      return response.data as TOutput;
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(err instanceof Error ? err.message : String(err), 'IPC_ERROR');
    }
  };
}

/**
 * Create a service method for void-input IPC calls that return data.
 */
export function createVoidServiceMethod<TOutput>(
  apiCall: () => Promise<DataResponse<TOutput>>,
): () => Promise<TOutput> {
  return async () => {
    try {
      const response = await apiCall();
      if (!response.success) {
        const error = response.error ?? { code: 'UNKNOWN', message: 'Unknown error' };
        throw new ServiceError(error.message, error.code, error.metadata);
      }
      return response.data as TOutput;
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(err instanceof Error ? err.message : String(err), 'IPC_ERROR');
    }
  };
}

/**
 * Create a service method for void-input commands that don't return data.
 * Returns void on success, throws ServiceError on failure.
 */
export function createVoidCommandMethod(apiCall: () => Promise<VoidResponse>): () => Promise<void> {
  return async () => {
    try {
      const response = await apiCall();
      if (!response.success) {
        const error = response.error ?? { code: 'UNKNOWN', message: 'Unknown error' };
        throw new ServiceError(error.message, error.code, error.metadata);
      }
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(err instanceof Error ? err.message : String(err), 'IPC_ERROR');
    }
  };
}

/**
 * Create a service method for commands that don't return data.
 * Returns void on success, throws ServiceError on failure.
 */
export function createCommandMethod<TInput>(
  apiCall: (input: TInput) => Promise<VoidResponse>,
): (input: TInput) => Promise<void> {
  return async (input: TInput) => {
    try {
      const response = await apiCall(input);
      if (!response.success) {
        const error = response.error ?? { code: 'UNKNOWN', message: 'Unknown error' };
        throw new ServiceError(error.message, error.code, error.metadata);
      }
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(err instanceof Error ? err.message : String(err), 'IPC_ERROR');
    }
  };
}
