// SPDX-License-Identifier: MIT
import type { FetchResult } from "../sources/types.ts";

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
