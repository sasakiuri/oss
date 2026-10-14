// SPDX-License-Identifier: MIT

export interface FetchResult {
  data: Uint8Array;
  url: string;
  contentType: string;
  /** The response's `RateLimit` header, present only when the server sent one. */
  rateLimit?: string;
  rateLimitPolicy?: string;
}

export interface FetchOptions {
  body?: Uint8Array;
  headers?: Record<string, string>;
  timeout?: number;
  maxBytes?: number;
  beforeRedirect?: (url: string) => void | Promise<void>;
  signal?: AbortSignal;
}
export type FetchBytes = (
  url: string,
  options?: FetchOptions,
) => Promise<FetchResult>;
