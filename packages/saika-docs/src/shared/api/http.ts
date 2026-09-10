// SPDX-License-Identifier: MIT
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'request_failed',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function readLimitedBody(
  body: ReadableStream<Uint8Array> | null,
  limit = 1_000_000,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel(signal?.reason);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, 'The request or response is too large.', 'body_too_large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

export async function parseApiResponse<T>(response: Response, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const bytes = await readLimitedBody(response.body, 1_000_000, signal);
  const text = new TextDecoder().decode(bytes);
  let value: unknown;
  if (response.status !== 204 && text !== '') {
    if (!(response.headers.get('content-type') ?? '').includes('json'))
      throw new ApiError(response.ok ? 502 : response.status, 'The API did not return JSON.', 'invalid_content_type');
    try {
      value = JSON.parse(text);
    } catch {
      throw new ApiError(502, 'The API returned invalid JSON.', 'invalid_json');
    }
  }
  if (!response.ok) {
    const problem = z
      .object({ title: z.string().max(300).optional(), code: z.string().max(100).optional() })
      .safeParse(value);
    throw new ApiError(
      response.status,
      problem.success ? (problem.data.title ?? 'The API request failed.') : 'The API request failed.',
      problem.success ? problem.data.code : undefined,
    );
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(502, 'The API response did not match its contract.', 'invalid_response');
  return result.data;
}

export async function fetchJson<T>(
  url: string | URL,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  timeout = 10_000,
): Promise<T> {
  const signal = AbortSignal.any([AbortSignal.timeout(timeout), ...(init.signal ? [init.signal] : [])]);
  const response = await fetch(url, {
    ...init,
    signal,
    headers: { Accept: 'application/json', ...Object.fromEntries(new Headers(init.headers)) },
  });
  return parseApiResponse(response, schema, signal);
}

export function apiPath(path: string): string {
  const pathname = path.split('?')[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new ApiError(400, 'Invalid API path.');
  }
  if (
    !decoded.startsWith('/') ||
    decoded.includes('//') ||
    decoded.includes('%') ||
    decoded.includes('\\') ||
    decoded.split('/').some((part) => part === '.' || part === '..') ||
    /[\x00-\x20#]/.test(decoded)
  )
    throw new ApiError(400, 'Invalid API path.');
  return path;
}
