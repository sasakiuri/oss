// SPDX-License-Identifier: MIT
/** Bounded publisher-link resolution, separate from low-frequency RSS polling. */
import type { Clock } from "./domain.ts";
import { clock as systemClock } from "./domain.ts";
import {
  GOOGLE_NEWS_LOCALE,
  GOOGLE_NEWS_RPC,
  GoogleNewsError,
  googleNewsId,
  googleNewsParameters,
  googleNewsRequest,
  googleNewsResponse,
  isGoogleNewsUrl,
  legacyGoogleNewsUrl,
  publisherUrl,
} from "./net/google-news.ts";
import { FetchError, fetchBytes } from "./net/http.ts";
import type { FetchBytes, FetchOptions } from "./net/types.ts";
import type { NewsRepository } from "./repository.ts";
import type { Collection } from "./sources/types.ts";

const HOST = "google-news-url:news.google.com";
const CACHE = "google_news_url";
const RATE = "google_news_url_rate";
const INTERVAL = 3;
const CACHE_SECONDS = 7 * 86400;
const MAX_REQUESTS = 40;
const MAX_SECONDS = 90;
const LIMITED = "Google News の記事URL解決は取得上限・待機時間のため次回に延期しました";

interface Rate { nextAt: number; blockedUntil: number }
interface Cached { url?: string; retryAt?: number }
type Store = Pick<NewsRepository,
  "getRecord" | "putRecord" | "acquireHost" | "releaseHost">;

interface GoogleNewsOptions {
  transport?: FetchBytes;
  clock?: Clock;
  signal?: AbortSignal;
  /** Test hook: milliseconds. */
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

/** A wait, not a failed publication or a reason to renew an ID's cooldown. */
export class GoogleNewsDeferred extends GoogleNewsError {
  constructor() { super(LIMITED); }
}

/** One operation's budget; successful mappings and rate state survive Workers. */
export class GoogleNewsResolver {
  private requests = 0;
  private readonly clock: Clock;
  private readonly transport: FetchBytes;
  private readonly started: number;
  private readonly options: GoogleNewsOptions;

  constructor(private readonly store: Store, options: GoogleNewsOptions = {}) {
    this.options = options;
    this.clock = options.clock ?? systemClock;
    this.transport = options.transport ?? fetchBytes;
    this.started = this.clock();
  }

  async resolve(url: string): Promise<string> {
    this.options.signal?.throwIfAborted();
    const id = googleNewsId(url);
    if (!id) throw new GoogleNewsError("Google News の記事リンク形式が不正です");
    const legacy = legacyGoogleNewsUrl(id);
    if (legacy) return legacy;
    const cached = await this.store.getRecord<Cached>(CACHE, id);
    const target = publisherUrl(cached?.url);
    if (target) return target;
    if (cached?.retryAt && cached.retryAt > this.clock()) throw new GoogleNewsDeferred();
    this.budget();
    const token = await this.store.acquireHost(HOST, this.clock(), 120);
    if (!token) throw new GoogleNewsDeferred();
    try {
      // Another invocation may have populated the mapping while we waited.
      const again = await this.store.getRecord<Cached>(CACHE, id);
      const found = publisherUrl(again?.url);
      if (found) return found;
      if (again?.retryAt && again.retryAt > this.clock()) throw new GoogleNewsDeferred();
      const rate = await this.store.getRecord<Rate>(RATE, HOST) ?? {
        nextAt: 0, blockedUntil: 0,
      };
      if (!Number.isFinite(rate.nextAt) || !Number.isFinite(rate.blockedUntil))
        throw new GoogleNewsError("Google News の記事URL取得制限の記録が不正です");
      const crawlHost = await this.store.getRecord<{ blocked_until?: number }>(
        "crawl_host", "news.google.com",
      );
      // A refusal while polling feeds also pauses the decoding endpoint.
      const blocked = crawlHost?.blocked_until ?? 0;
      if (!Number.isFinite(blocked))
        throw new GoogleNewsError("Google News の取得待機記録が不正です");
      rate.blockedUntil = Math.max(rate.blockedUntil, blocked);
      const send = async (requestUrl: string, options: FetchOptions = {}) => {
        this.budget();
        if (rate.blockedUntil > this.clock() || rate.nextAt - this.clock() > INTERVAL + 0.01)
          throw new GoogleNewsDeferred();
        while (rate.nextAt > this.clock()) {
          await (this.options.sleep ?? sleep)(
            Math.min(rate.nextAt - this.clock(), INTERVAL) * 1000,
            this.options.signal,
          );
          this.budget();
        }
        this.requests += 1;
        try {
          return await this.transport(requestUrl, {
            timeout: 8,
            maxBytes: 1_000_000,
            // Caller headers make createFetchBytes refuse all redirects.
            headers: { Accept: "text/html" },
            ...options,
            signal: this.options.signal,
          });
        } catch (error) {
          if (error instanceof FetchError) {
            const status = error.status;
            if (status === undefined || status === 401 || status === 403 || status === 429 || status >= 500) {
              const delay = status === 401 || status === 403 ? 86400 : status === 429 ? 3600 : 900;
              rate.blockedUntil = this.clock() + Math.max(delay, error.retryAfter ?? 0);
            }
          }
          throw error;
        } finally {
          rate.nextAt = this.clock() + INTERVAL;
          await this.store.putRecord(RATE, HOST, rate, {
            leaseHost: HOST, leaseToken: token,
          });
        }
      };
      const page = await send(`https://news.google.com/rss/articles/${id}${GOOGLE_NEWS_LOCALE}`);
      if (page.contentType && !page.contentType.toLowerCase().includes("html"))
        throw new GoogleNewsError("Google News の記事URL解決ページの形式が不正です");
      const response = await send(GOOGLE_NEWS_RPC, {
        body: googleNewsRequest(id, googleNewsParameters(page.data)),
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        maxBytes: 100_000,
      });
      const resolved = googleNewsResponse(response.data);
      await this.store.putRecord(CACHE, id, { url: resolved }, {
        expiresAt: this.clock() + CACHE_SECONDS,
        leaseHost: HOST, leaseToken: token,
      });
      return resolved;
    } catch (error) {
      this.options.signal?.throwIfAborted();
      if (!(error instanceof GoogleNewsError) && !(error instanceof FetchError))
        throw error;
      // Waiting for another operation or a host cooldown is not an ID failure.
      // In particular, minute publication ticks must not extend the wait forever.
      if (error instanceof GoogleNewsDeferred) throw error;
      // A failed ID must not consume every later collection's first requests.
      await this.store.putRecord(CACHE, id, { retryAt: this.clock() + 3600 }, {
        expiresAt: this.clock() + 3600,
        leaseHost: HOST, leaseToken: token,
      });
      throw error;
    } finally {
      await this.store.releaseHost(HOST, token);
    }
  }

  private budget(): void {
    this.options.signal?.throwIfAborted();
    if (this.requests >= MAX_REQUESTS || this.clock() - this.started >= MAX_SECONDS)
      throw new GoogleNewsDeferred();
  }
}

/** Resolve before ingest/identity selection; unresolved wrappers never become posts. */
export async function resolveGoogleNewsItems(
  result: Collection,
  store: Store,
  options: GoogleNewsOptions = {},
): Promise<void> {
  options.signal?.throwIfAborted();
  if (!result.items.some((item) => isGoogleNewsUrl(item.url))) return;
  const resolver = new GoogleNewsResolver(store, options);
  const items: Collection["items"] = [];
  const seen = new Set<string>();
  let failed = 0;
  for (const item of result.items) {
    options.signal?.throwIfAborted();
    let resolved = item;
    if (isGoogleNewsUrl(item.url)) {
      try {
        const url = await resolver.resolve(item.url);
        resolved = { ...item, url, metadata: {
          ...item.metadata, googleNewsUrl: item.url,
        } };
      } catch (error) {
        options.signal?.throwIfAborted();
        if (!(error instanceof GoogleNewsError) && !(error instanceof FetchError))
          throw error;
        failed += 1;
        continue;
      }
    }
    const identity = resolved.sourceKey ? `source:${resolved.sourceKey}` : `url:${resolved.url}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    items.push(resolved);
  }
  result.items = items;
  if (failed) result.warnings.push(
    `Google News の ${failed} 件は元記事URLを解決できないか取得制限のため除外しました。中継URLでは投稿せず、次回の収集で再確認します`,
  );
}
