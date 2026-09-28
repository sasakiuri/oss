// SPDX-License-Identifier: MIT
/** Bounded fetch with one deadline covering every redirect hop and the body. */
import { UserError } from "../errors.ts";
import type { FetchResult } from "../sources/types.ts";
import { feedDate } from "../time.ts";

import type { FetchBytes, FetchOptions } from "./types.ts";
import { canonicalUrl, hostnameOf, unquote, urljoin, urlsplit } from "./url.ts";

export const USER_AGENT = "NilayNews/0.1 (+local news and RSS reader)";
const TOO_LARGE = "取得サイズの上限を超えました";

// Plain fields keep this module loadable by Node's type stripping in deployment scripts.
export class FetchError extends UserError {
  readonly status?: number;
  readonly retryAfter?: number;

  constructor(message: string, status?: number, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Accept both Retry-After forms; invalid values use the caller's backoff. */
export function retryAfterSeconds(
  input: string,
  now = Date.now() / 1000,
): number | undefined {
  const value = input.trim();
  if (/^[0-9]{1,11}$/.test(value)) return Number(value);
  // HTTP dates only; ISO timestamps are not a Retry-After form.
  const date = /^[0-9]{4}-/.test(value) ? null : feedDate(value);
  return date === null ? undefined : Math.max(0, Date.parse(date) / 1000 - now);
}

interface BodySource {
  readonly body: ReadableStream<Uint8Array> | null;
  readonly headers: Headers;
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
  });
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  return signal ? Promise.race([promise, aborted(signal)]) : promise;
}

/**
 * Read a request or response stream under a strict byte ceiling. On failure or
 * abort the stream is cancelled without waiting for the peer.
 */
export async function readBody(
  message: BodySource,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader();
  let completed = false;
  try {
    signal?.throwIfAborted();
    const length = message.headers.get("content-length");
    if (length && /^[0-9]+$/.test(length) && Number(length) > maxBytes)
      throw new FetchError(TOO_LARGE);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await abortable(reader.read(), signal);
      if (part.done) {
        completed = true;
        const data = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return data;
      }
      if (part.value.byteLength > maxBytes - size)
        throw new FetchError(TOO_LARGE);
      chunks.push(part.value);
      size += part.value.byteLength;
    }
  } finally {
    if (!completed) reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function validateTarget(
  url: string,
  hosts: Set<string>,
  originalScheme: string,
): void {
  try {
    const parts = urlsplit(url);
    if (
      canonicalUrl(url) !== null &&
      hosts.has(hostnameOf(parts) ?? "") &&
      (originalScheme !== "https" || parts.scheme === "https") &&
      parts.path
        .split("/")
        .every((part) => ![".", ".."].includes(unquote(part)))
    ) {
      return;
    }
  } catch {
    // Unparsable targets are refused below.
  }
  throw new FetchError(
    "許可していない転送先です。情報源の URL を確認してください",
  );
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Build a FetchBytes over a fetch implementation. Redirects are followed
 * manually (at most three) and each hop is validated before it is requested;
 * requests with caller headers or a body never follow a redirect.
 */
export function createFetchBytes(
  fetcher: Fetcher = (url, init) => fetch(url, init),
): FetchBytes {
  return async (
    url: string,
    options: FetchOptions = {},
  ): Promise<FetchResult> => {
    const {
      body,
      headers = {},
      timeout = 18,
      maxBytes = 4_000_000,
      beforeRedirect,
      signal,
    } = options;
    if (
      !Number.isFinite(timeout) ||
      timeout <= 0 ||
      !Number.isInteger(maxBytes) ||
      maxBytes < 0
    ) {
      throw new FetchError("HTTP 取得の上限設定が不正です");
    }
    if (
      Object.entries(headers).some(([key, value]) =>
        /[\r\n\0]/.test(key + value),
      )
    ) {
      throw new FetchError("HTTP ヘッダーに不正な文字があります");
    }
    let hosts: Set<string>;
    let scheme: string;
    try {
      const parts = urlsplit(url);
      const name = hostnameOf(parts) ?? "";
      const bare = name.replace(/^www\./, "");
      hosts = new Set([name, bare, `www.${bare}`]);
      scheme = parts.scheme;
    } catch {
      throw new FetchError("取得先 URL が不正です");
    }
    validateTarget(url, hosts, scheme);
    signal?.throwIfAborted();
    const credentialed = body !== undefined || Object.keys(headers).length > 0;
    const controller = new AbortController();
    const timedOut = Symbol("timeout");
    const timer = setTimeout(() => controller.abort(timedOut), timeout * 1000);
    const forward = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", forward, { once: true });

    const chain = async (): Promise<FetchResult> => {
      let target = url;
      for (let hop = 0; hop < 4; hop += 1) {
        validateTarget(target, hosts, scheme);
        if (hop && beforeRedirect) {
          await beforeRedirect(target);
          controller.signal.throwIfAborted();
        }
        const init: RequestInit = {
          method: body === undefined ? "GET" : "POST",
          headers: { "User-Agent": USER_AGENT, ...headers },
          redirect: "manual",
          signal: controller.signal,
        };
        if (body !== undefined) init.body = body;
        const response = await fetcher(target, init);
        const status = response.status;
        if (status >= 300 && status < 400) {
          const location = response.headers.get("location");
          if (credentialed || !location) {
            response.body?.cancel().catch(() => undefined);
            throw new FetchError("HTTP 転送には対応していません", status);
          }
          // Cancel redirect bodies before opening another connection.
          await response.body?.cancel();
          target = urljoin(target, location);
          continue;
        }
        if (status < 200 || status >= 300) {
          response.body?.cancel().catch(() => undefined);
          throw new FetchError(
            `情報源から HTTP ${status} が返りました`,
            status,
            retryAfterSeconds(response.headers.get("retry-after") ?? ""),
          );
        }
        const result: FetchResult = {
          data: await readBody(response, maxBytes, controller.signal),
          url: target,
          contentType: response.headers.get("content-type") ?? "",
        };
        const rateLimit = response.headers.get("ratelimit");
        if (rateLimit !== null) result.rateLimit = rateLimit;
        return result;
      }
      throw new FetchError("情報源の転送回数が多すぎます");
    };

    try {
      return await abortable(chain(), controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        if (controller.signal.reason === timedOut)
          throw new FetchError("取得がタイムアウトしました");
        // A caller abort is not a remote failure; surface the caller's reason.
        throw signal?.reason ?? error;
      }
      if (error instanceof FetchError) throw error;
      // Runtime failures may contain URLs, request headers or remote bodies.
      throw new FetchError("情報源に接続できませんでした");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
      controller.abort();
    }
  };
}

export const fetchBytes: FetchBytes = createFetchBytes();
