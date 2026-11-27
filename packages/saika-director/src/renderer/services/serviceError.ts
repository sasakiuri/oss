import type { IpcErrorDto } from '@sasakiuri/saika-ipc';

/**
 * A failed IPC response raised as an exception. It keeps the error code and metadata that main returned.
 *
 * The name stays `Error`: panels that show `String(caught)` print `Error: <message>`, and that text must not change.
 */
export class ServiceError extends Error {
  readonly code: string | undefined;
  readonly metadata: Record<string, unknown> | undefined;

  constructor(message: string, error?: IpcErrorDto) {
    super(message);
    this.code = error?.code;
    this.metadata = error?.metadata;
  }
}

/** Query and data-command responses: the failure branch always carries an error. */
export type DataResponse<T> = { success: true; data: T } | { success: false; error: IpcErrorDto };

/** Commands without a discriminated union: `{ success: boolean, data?: T, error?: IpcErrorDto }`. */
interface LooseResponse<T> {
  success: boolean;
  data?: T;
  error?: IpcErrorDto;
}

/**
 * Returns the data of a successful response and throws a `ServiceError` for a failed one.
 *
 * The message is the response's error message, or `fallback` when the response has none. A failed response with
 * neither an error nor a fallback still gets a text, so the banner that shows it is never empty.
 */
export function unwrap<T>(response: DataResponse<T>, fallback?: string): T;
export function unwrap<T>(response: LooseResponse<T>, fallback?: string): T | undefined;
export function unwrap<T>(response: LooseResponse<T>, fallback?: string): T | undefined {
  if (!response.success) {
    throw new ServiceError(response.error?.message ?? fallback ?? 'Request failed', response.error);
  }
  return response.data;
}

/**
 * Returns the data of a command that must answer with data. A failed response, and a successful one without
 * data, both throw a `ServiceError`; `fallback` is the text when the response carries no error message.
 */
export function unwrapData<T>(response: LooseResponse<T>, fallback: string): NonNullable<T> {
  const data = unwrap(response, fallback);
  if (data === undefined || data === null) throw new ServiceError(fallback);
  return data;
}

/** The message to show for a caught value: an error's message, else `fallback`, else the value as text. */
export function errorMessage(caught: unknown, fallback?: string): string {
  if (caught instanceof Error) return caught.message;
  return fallback ?? String(caught);
}
