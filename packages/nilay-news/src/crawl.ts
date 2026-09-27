// SPDX-License-Identifier: MIT
/**
 * Durable crawl cache and politeness policy shared by all Worker invocations.
 * Record writes under a host lease are fenced by its token; no in-memory lock
 * is relied on between Workers. Storage expires and prunes blobs itself.
 */
import type { Clock } from "./domain.ts";
import { clock as systemClock } from "./domain.ts";
import { UserError } from "./errors.ts";
import { FetchError, fetchBytes } from "./net/http.ts";
import type { FetchBytes, FetchOptions } from "./net/types.ts";
import { hostname, queryValue, urlsplit } from "./net/url.ts";
import type { NewsRepository } from "./repository.ts";
import { RobotsPolicy } from "./robots.ts";
import { validRobotsException } from "./sources/config.ts";
import type { FetchResult, SourceConfig } from "./sources/types.ts";
import { sha256 } from "./text.ts";
import { isoSeconds } from "./time.ts";

/** A policy refusal, rather than a new transport failure. */
export class CrawlStopped extends FetchError {}

export class CrawlDeferred extends CrawlStopped {
  constructor(readonly until: number) {
    super(
      `取得間隔を守るため ${isoSeconds(Math.floor(until))} まで待機し、次の収集で再確認します`,
    );
  }
}

// Record fields keep the names already persisted in D1 by the previous runtime.
interface HostState {
  next_request: number;
  blocked_until: number;
  failures: number;
  crawl_delay: number;
  last_finished: number;
}
interface Requested {
  last_requested: number;
}
interface CachedResponse {
  blob: string;
  final_url: string;
  content_type: string;
}

export interface CrawlOptions {
  clock?: Clock;
  transport?: FetchBytes;
  maxRequests?: number;
  signal?: AbortSignal;
  /** Test hook; defaults to an abortable timer. */
  sleep?: (seconds: number, signal?: AbortSignal) => Promise<void>;
}

const LEASE_SECONDS = 120;
const MIN_INTERVAL = 3;
const MAX_WAIT = 3;
const MAX_BYTES = 4_000_000;

function timer(seconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const done = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const id = setTimeout(done, seconds * 1000);
    const cancel = () => {
      clearTimeout(id);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

function stamp(epoch: number): string {
  return isoSeconds(Math.floor(epoch));
}

function hostOf(url: string): string {
  return hostname(url).replace(/^www\./, "");
}

/** Cache lifetime by URL shape: PDFs a day, e-Gov details six hours. */
export function cacheTtl(url: string): number {
  const parts = urlsplit(url);
  if (parts.path.toLowerCase().endsWith(".pdf")) return 86400;
  return ["PCMMSTDETAIL", "PCM1040"].includes(
    queryValue(parts.query, "CLASSNAME") ?? "",
  )
    ? 21600
    : 3600;
}

export class CachedFetch {
  static readonly LEASE_SECONDS = LEASE_SECONDS;
  /** Network requests made by this instance, robots.txt and redirects included. */
  requests = 0;
  private readonly clock: Clock;
  private readonly transport: FetchBytes;
  private readonly maxRequests: number;
  private readonly signal?: AbortSignal;
  private readonly sleep: (
    seconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  private readonly urlIntervals = new Map<string, number>();
  private readonly hostDelays = new Map<string, number>();
  private readonly robotsExceptions = new Set<string>();

  constructor(
    private readonly repository: NewsRepository,
    sources: readonly SourceConfig[],
    options: CrawlOptions = {},
  ) {
    const {
      clock = systemClock,
      transport = fetchBytes,
      maxRequests = 40,
      signal,
      sleep = timer,
    } = options;
    if (!Number.isInteger(maxRequests) || maxRequests < 1)
      throw new UserError("収集リクエストの上限が不正です");
    this.clock = clock;
    this.transport = transport;
    this.maxRequests = maxRequests;
    this.signal = signal;
    this.sleep = sleep;
    for (const source of sources) {
      const { url } = source;
      this.urlIntervals.set(
        url,
        Math.max(
          this.urlIntervals.get(url) ?? 0,
          (source.minCollectionMinutes ?? 0) * 60,
        ),
      );
      const host = hostOf(url);
      this.hostDelays.set(
        host,
        Math.max(
          this.hostDelays.get(host) ?? 0,
          source.minRequestIntervalSeconds ?? 0,
        ),
      );
      if (source.robotsException) {
        if (!validRobotsException({ ...source }))
          throw new UserError("robots 例外の収集設定が不正です");
        this.robotsExceptions.add(url);
      }
    }
  }

  /** Earliest time the source may be collected again; 0 when it is due now. */
  async nextDue(source: SourceConfig): Promise<number> {
    const [started, requested] = await Promise.all([
      this.repository.getRecord<Requested>("crawl_source", source.id),
      this.repository.getRecord<Requested>("crawl_url", source.url),
    ]);
    const interval = this.urlIntervals.get(source.url) ?? 0;
    return Math.max(
      started
        ? started.last_requested + (source.minCollectionMinutes ?? 60) * 60
        : 0,
      requested && interval ? requested.last_requested + interval : 0,
    );
  }

  /** Claim the source interval even when its collector expands the URL. */
  async beginSource(source: SourceConfig): Promise<void> {
    if (source.collectionBlocked || !source.enabled)
      throw new CrawlStopped(
        source.collectionBlocked || "この収集元は停止しています",
      );
    const host = hostOf(source.url);
    const token = await this.acquire(host);
    try {
      const row = await this.repository.getRecord<Requested>(
        "crawl_source",
        source.id,
      );
      const interval = (source.minCollectionMinutes ?? 60) * 60;
      if (row && row.last_requested + interval > this.clock())
        throw new CrawlDeferred(row.last_requested + interval);
      await this.put(
        "crawl_source",
        source.id,
        { last_requested: this.clock() },
        host,
        token,
      );
    } finally {
      await this.repository.releaseHost(host, token);
    }
  }

  async endSource(source: SourceConfig): Promise<void> {
    const host = hostOf(source.url);
    const token = await this.acquire(host);
    try {
      await this.put(
        "crawl_source",
        source.id,
        { last_requested: this.clock() },
        host,
        token,
      );
    } finally {
      await this.repository.releaseHost(host, token);
    }
  }

  /** GET a source URL: cached, paced, robots-checked and budgeted. */
  async fetch(url: string): Promise<FetchResult> {
    this.signal?.throwIfAborted();
    const cached = await this.repository.getRecord<CachedResponse>(
      "crawl_response",
      url,
    );
    if (cached) {
      const data = await this.repository.getBlob(cached.blob);
      if (data !== null) {
        if (data.byteLength > MAX_BYTES)
          throw new FetchError("取得サイズの上限を超えました");
        return {
          data,
          url: cached.final_url,
          contentType: cached.content_type,
        };
      }
    }
    const host = hostOf(url);
    const token = await this.acquire(host);
    try {
      const state = (await this.repository.getRecord<HostState>(
        "crawl_host",
        host,
      )) ?? {
        next_request: 0,
        blocked_until: 0,
        failures: 0,
        crawl_delay: 0,
        last_finished: 0,
      };
      state.crawl_delay = Math.max(
        state.crawl_delay,
        this.hostDelays.get(host) ?? 0,
      );
      if (state.last_finished) {
        state.next_request = Math.max(
          state.next_request,
          state.last_finished + Math.max(MIN_INTERVAL, state.crawl_delay),
        );
      }
      const interval = this.urlIntervals.get(url) ?? 0;
      const requested = interval
        ? await this.repository.getRecord<Requested>("crawl_url", url)
        : null;
      if (requested && requested.last_requested + interval > this.clock())
        throw new CrawlDeferred(requested.last_requested + interval);
      await this.guard(url, host, token, state, true);
      if (interval)
        await this.put(
          "crawl_url",
          url,
          { last_requested: this.clock() },
          host,
          token,
        );
      const result = await this.send(url, host, token, state, false);
      const current = this.clock();
      if (interval)
        await this.put(
          "crawl_url",
          url,
          { last_requested: current },
          host,
          token,
        );
      const expiry = current + Math.max(cacheTtl(url), interval);
      // Blobs are not lease-fenced. Each writer uses its own immutable
      // generation so an expired writer cannot replace the body referenced by
      // a newer writer's fenced metadata; orphans are bounded by TTL.
      const blob = `crawl:${await sha256(`${url}\0${token}`)}`;
      await this.repository.putBlob(blob, result.data, expiry);
      await this.put(
        "crawl_response",
        url,
        { blob, final_url: result.url, content_type: result.contentType },
        host,
        token,
        expiry,
      );
      return result;
    } finally {
      await this.repository.releaseHost(host, token);
    }
  }

  private async acquire(host: string): Promise<string> {
    const token = await this.repository.acquireHost(
      host,
      this.clock(),
      LEASE_SECONDS,
    );
    if (token === null) throw new CrawlDeferred(this.clock() + MIN_INTERVAL);
    return token;
  }

  private put(
    namespace: string,
    key: string,
    value: object,
    host: string,
    token: string,
    expiresAt?: number,
  ): Promise<void> {
    return this.repository.putRecord(namespace, key, value, {
      expiresAt,
      leaseHost: host,
      leaseToken: token,
    });
  }

  private save(host: string, token: string, state: HostState): Promise<void> {
    return this.put("crawl_host", host, state, host, token);
  }

  private async pace(state: HostState): Promise<void> {
    if (state.blocked_until > this.clock()) {
      throw new CrawlStopped(
        `アクセス制限・通信失敗のため ${stamp(state.blocked_until)} までこのサイトの取得を停止しています`,
      );
    }
    let wait = state.next_request - this.clock();
    if (wait > MAX_WAIT + 0.001) throw new CrawlDeferred(state.next_request);
    while (wait > 0) {
      await this.sleep(Math.min(wait, 2.9), this.signal);
      wait = state.next_request - this.clock();
    }
  }

  private async finish(
    host: string,
    token: string,
    state: HostState,
  ): Promise<void> {
    state.last_finished = this.clock();
    state.next_request =
      this.clock() + Math.max(MIN_INTERVAL, state.crawl_delay);
    await this.save(host, token, state);
  }

  private async backoff(
    host: string,
    token: string,
    state: HostState,
    error: FetchError,
  ): Promise<void> {
    const { status, retryAfter } = error;
    if (
      status !== undefined &&
      ![401, 403, 429].includes(status) &&
      status < 500
    )
      return;
    const base =
      status === 401 || status === 403 ? 86400 : status === 429 ? 3600 : 900;
    const duration = Math.max(
      Math.min(base * 2 ** Math.min(state.failures, 7), 86400),
      retryAfter ?? 0,
    );
    state.blocked_until = Math.max(
      state.blocked_until,
      this.clock() + duration,
    );
    state.failures += 1;
    await this.save(host, token, state);
  }

  private takeRequest(): void {
    if (this.requests >= this.maxRequests) {
      throw new CrawlStopped(
        `今回の収集リクエスト上限（${this.maxRequests} 回）に達しました。取得済み情報の範囲を確認してください`,
      );
    }
    this.requests += 1;
  }

  private async send(
    url: string,
    host: string,
    token: string,
    state: HostState,
    robots: boolean,
    maxBytes?: number,
  ): Promise<FetchResult> {
    const beforeRedirect = async (target: string) => {
      if (hostOf(target) !== host)
        throw new CrawlStopped("許可していない転送先です");
      await this.finish(host, token, state);
      if (robots) {
        await this.pace(state);
      } else {
        try {
          await this.guard(target, host, token, state, false);
        } catch (error) {
          if (error instanceof CrawlDeferred) {
            throw new CrawlStopped(
              "サイトの長い取得間隔により転送を完了できません。収集元を転送先の正式 URL に更新してください",
            );
          }
          throw error;
        }
      }
      this.takeRequest();
    };
    this.takeRequest();
    const options: FetchOptions = { beforeRedirect, signal: this.signal };
    if (maxBytes !== undefined) options.maxBytes = maxBytes;
    try {
      const result = await this.transport(url, options);
      if (!robots) state.failures = 0;
      return result;
    } catch (error) {
      if (error instanceof FetchError && !(error instanceof CrawlStopped))
        await this.backoff(host, token, state, error);
      throw error;
    } finally {
      await this.finish(host, token, state);
    }
  }

  private async robots(
    url: string,
    host: string,
    token: string,
    state: HostState,
  ): Promise<RobotsPolicy> {
    const parts = urlsplit(url);
    const origin = `${parts.scheme}://${parts.netloc}`;
    const record = await this.repository.getRecord<{ rules: string }>(
      "crawl_robots",
      origin,
    );
    if (record) return new RobotsPolicy(record.rules);
    await this.pace(state);
    let text: string;
    let policy: RobotsPolicy;
    try {
      const result = await this.send(
        `${origin}/robots.txt`,
        host,
        token,
        state,
        true,
        512_000,
      );
      if (result.contentType.toLowerCase().includes("html"))
        throw new FetchError("robots.txt が HTML のため収集を停止しました");
      try {
        text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: false,
        }).decode(result.data);
      } catch {
        throw new FetchError("robots.txt を読み取れないため収集を停止しました");
      }
      policy = new RobotsPolicy(text);
    } catch (error) {
      if (!(error instanceof FetchError) || error instanceof CrawlStopped)
        throw error;
      if (error.status === 404 || error.status === 410) {
        text = "";
        policy = new RobotsPolicy("");
      } else {
        if (state.blocked_until <= this.clock())
          await this.backoff(host, token, state, error);
        throw new CrawlStopped(
          `robots.txt を確認できないため収集停止：${error.message}`,
          error.status,
          error.retryAfter,
        );
      }
    }
    await this.put(
      "crawl_robots",
      origin,
      { rules: text },
      host,
      token,
      this.clock() + 86400,
    );
    return policy;
  }

  /** The documented robots exception covers only the exact configured URL, never a redirect target. */
  private async guard(
    url: string,
    host: string,
    token: string,
    state: HostState,
    initial: boolean,
  ): Promise<void> {
    await this.pace(state);
    const policy = await this.robots(url, host, token, state);
    if (!policy.allows(url) && !(initial && this.robotsExceptions.has(url))) {
      throw new CrawlStopped(
        "robots.txt でこの URL の自動取得が禁止されているため収集を停止しました",
      );
    }
    state.crawl_delay = Math.max(
      state.crawl_delay,
      policy.delay,
      this.hostDelays.get(host) ?? 0,
    );
    if (state.last_finished) {
      state.next_request = Math.max(
        state.next_request,
        state.last_finished + Math.max(MIN_INTERVAL, state.crawl_delay),
      );
    }
    await this.save(host, token, state);
    await this.pace(state);
  }
}
