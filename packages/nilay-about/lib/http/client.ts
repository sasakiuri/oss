import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class ResponseValidationError extends Error {
  constructor(url: string, cause: unknown) {
    super(`Invalid response from ${url}`, { cause });
    this.name = 'ResponseValidationError';
  }
}

/** Browser transport. Call server repositories directly from server code. */
export async function requestJson<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new HttpError(response.status, `Request failed (${response.status})`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new ResponseValidationError(url, cause);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new ResponseValidationError(url, result.error);
  return result.data;
}

export function shouldRetryQuery(failureCount: number, error: Error): boolean {
  if (error instanceof ResponseValidationError || error.name === 'AbortError') return false;
  if (error instanceof HttpError && error.status < 500) return false;
  return failureCount < 2;
}
