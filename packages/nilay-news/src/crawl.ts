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
import { dailySlot, nextDailyRun } from "./schedule.ts";
import {
  KANPO_HOME,
  kanpoTocDate,
  validRobotsException,
  validRobotsUnavailable,
} from "./sources/config.ts";
import type { FetchResult, SourceConfig } from "./sources/types.ts";
import { randomToken, sha256 } from "./text.ts";
import { formatJst } from "./time.ts";

/** A policy refusal, rather than a new transport failure. */
export class CrawlStopped extends FetchError {}

export class CrawlDeferred extends CrawlStopped {
  constructor(
    readonly until: number,
    message = `取得間隔を守るため ${formatJst(until)} まで待機し、次の収集で再確認します`,
  ) {
    super(message);
  }
}

/** The request budget of this invocation refused a request before sending it. */
export class CrawlLimit extends CrawlStopped {}

/**
 * Waiting out a host cooldown recorded by an earlier failure. No request was
 * sent, so this is not a new failure; the original one stays reported.
 */
export class CrawlBackoff extends CrawlDeferred {
  constructor(until: number) {
    super(
      until,
      `アクセス制限・通信失敗の後のためこのサイトの取得を待機しています。${formatJst(until)} は再取得できる最も早い時刻で、その時刻に再取得するとは限りません`,
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
/**
 * `crawl_source` of a rolling source. `last_requested` alone is a settled
 * source; while an attempt holds it, `attempt` and the settled `previous` time
 * (0 without history) are kept so that an attempt that sent no request can
 * give its interval back. `retry_at` is the earliest retry after such an
 * attempt. Records without these fields are settled, current data.
 */
interface SourceRecord extends Requested {
  attempt?: string;
  previous?: number;
  retry_at?: number;
}
/** A claimed source; `requests` counts non-robots requests before the claim. */
export interface SourceAttempt {
  readonly token: string;
  readonly requests: number;
}
interface SendOptions {
  maxBytes?: number;
  /** Refuse any redirect with this message before requesting its target. */
  refuseRedirect?: string;
  /** Called before each redirect hop is requested. */
  onRedirect?: () => void;
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
const GAZETTE_HOST = hostOf(KANPO_HOME);

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

function finite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/** A stored source record, refusing malformed rather than defaulting. */
function sourceRecord(row: SourceRecord | null): SourceRecord | null {
  if (
    row &&
    (!finite(row.last_requested) ||
      (row.retry_at !== undefined && !finite(row.retry_at)) ||
      (row.attempt === undefined
        ? row.previous !== undefined
        : typeof row.attempt !== "string" || !finite(row.previous)))
  )
    throw new UserError("収集元の取得記録が不正です");
  return row;
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
  /** Requests sent for source URLs and their redirects, robots.txt excluded. */
  private sourceRequests = 0;
  private readonly clock: Clock;
  private readonly transport: FetchBytes;
  private readonly maxRequests: number;
  private readonly signal?: AbortSignal;
  private readonly sleep: (
    seconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  private readonly urlIntervals = new Map<string, number>();
  private readonly dailyUrls = new Map<string, string>();
  private readonly hostDelays = new Map<string, number>();
  private readonly robotsExceptions = new Set<string>();
  /** Exact URLs of enabled sources that treat a robots.txt 403 as unavailable. */
  private readonly robotsUnavailable = new Set<string>();
  /** An enabled gazette source with the documented exception may fetch daily TOCs. */
  private kanpoTocs = false;

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
      if (source.dailyAtJst) this.dailyUrls.set(url, source.dailyAtJst);
      // A daily source is gated by its JST slot in beginSource; a rolling URL
      // interval would also stretch its cache into the next day's run.
      this.urlIntervals.set(
        url,
        Math.max(
          this.urlIntervals.get(url) ?? 0,
          source.dailyAtJst ? 0 : (source.minCollectionMinutes ?? 0) * 60,
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
        if (source.kind === "kanpo") this.kanpoTocs ||= source.enabled;
        else this.robotsExceptions.add(url);
      }
      if (
        source.robotsUnavailableStatus !== undefined ||
        source.robotsUnavailableReason !== undefined
      ) {
        if (!validRobotsUnavailable({ ...source }))
          throw new UserError("robots.txt 取得不能時の収集設定が不正です");
        if (source.enabled && !source.collectionBlocked)
          this.robotsUnavailable.add(url);
      }
    }
  }

  /** Earliest time the source may be collected again; 0 when it is due now. */
  async nextDue(source: SourceConfig): Promise<number> {
    if (source.dailyAtJst) {
      const started = await this.repository.getRecord<Requested>(
        "crawl_source",
        source.id,
      );
      const due = nextDailyRun(
        this.clock(),
        source.dailyAtJst,
        started?.last_requested,
      );
      return due > this.clock() ? due : 0;
    }
    const row = await this.repository.getRecord<SourceRecord>(
      "crawl_source",
      source.id,
    );
    return this.rollingDue(source, sourceRecord(row));
  }

  /** The source interval, its retry time and its URL interval. */
  private async rollingDue(
    source: SourceConfig,
    row: SourceRecord | null,
  ): Promise<number> {
    const interval = this.urlIntervals.get(source.url) ?? 0;
    const requested = interval
      ? await this.repository.getRecord<Requested>("crawl_url", source.url)
      : null;
    return Math.max(
      row ? row.last_requested + (source.minCollectionMinutes ?? 60) * 60 : 0,
      row?.retry_at ?? 0,
      requested ? requested.last_requested + interval : 0,
    );
  }

  /**
   * Claim the source interval even when its collector expands the URL. A
   * rolling claim is an attempt settled by `endSource`.
   */
  async beginSource(source: SourceConfig): Promise<SourceAttempt> {
    if (source.collectionBlocked || !source.enabled)
      throw new CrawlStopped(
        source.collectionBlocked || "この収集元は停止しています",
      );
    const host = hostOf(source.url);
    const token = await this.acquire(host);
    try {
      const row = sourceRecord(
        await this.repository.getRecord<SourceRecord>(
          "crawl_source",
          source.id,
        ),
      );
      const due = source.dailyAtJst
        ? nextDailyRun(this.clock(), source.dailyAtJst, row?.last_requested)
        : await this.rollingDue(source, row);
      if (due > this.clock()) throw new CrawlDeferred(due);
      const attempt = { token: randomToken(), requests: this.sourceRequests };
      // An abandoned attempt keeps its claim time: it may have sent requests.
      await this.put(
        "crawl_source",
        source.id,
        source.dailyAtJst
          ? { last_requested: this.clock() }
          : {
              last_requested: this.clock(),
              attempt: attempt.token,
              previous: row?.last_requested ?? 0,
            },
        host,
        token,
      );
      return attempt;
    } finally {
      await this.repository.releaseHost(host, token);
    }
  }

  /**
   * Settle a rolling attempt by its outcome (null on success). One that sent
   * no source request and was only deferred or refused by the request budget
   * gives the interval back, retrying no earlier than the deferral. Any other
   * attempt, including a cache hit, counts from now. A record claimed by a
   * newer attempt is left alone.
   */
  async endSource(
    source: SourceConfig,
    attempt: SourceAttempt,
    outcome: unknown,
  ): Promise<void> {
    // A fixed daily slot is claimed at the start, even if completion is late.
    if (source.dailyAtJst) return;
    const host = hostOf(source.url);
    const token = await this.acquire(host);
    try {
      const row = sourceRecord(
        await this.repository.getRecord<SourceRecord>(
          "crawl_source",
          source.id,
        ),
      );
      if (row?.attempt !== attempt.token) return;
      // sourceRecord() requires `previous` with an attempt.
      const previous = row.previous as number;
      const unsent =
        this.sourceRequests === attempt.requests &&
        (outcome instanceof CrawlDeferred || outcome instanceof CrawlLimit);
      await this.put(
        "crawl_source",
        source.id,
        !unsent
          ? { last_requested: this.clock() }
          : outcome instanceof CrawlDeferred
            ? { last_requested: previous, retry_at: outcome.until }
            : { last_requested: previous },
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
    const dailyAt = this.dailyUrls.get(url);
    // A new day's root must not reuse a previous slot or a pre-deployment
    // rolling-interval response. The actual request URL remains unchanged.
    const responseKey = dailyAt
      ? `daily:${dailySlot(this.clock(), dailyAt)}:${url}`
      : url;
    const cached = await this.repository.getRecord<CachedResponse>(
      "crawl_response",
      responseKey,
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
      const unverified = await this.guard(url, host, token, state, true);
      // A refused request must not claim the URL interval.
      this.checkBudget();
      if (interval)
        await this.put(
          "crawl_url",
          url,
          { last_requested: this.clock() },
          host,
          token,
        );
      const result = await this.send(
        url,
        host,
        token,
        state,
        false,
        unverified
          ? {
              refuseRedirect:
                "robots.txt を確認できない収集元のため転送先を取得しません",
            }
          : {},
      );
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
        responseKey,
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
    if (state.blocked_until > this.clock())
      throw new CrawlBackoff(Math.max(state.blocked_until, state.next_request));
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

  private checkBudget(): void {
    if (this.requests >= this.maxRequests) {
      throw new CrawlLimit(
        `今回の収集リクエスト上限（${this.maxRequests} 回）に達しました。取得済み情報の範囲を確認してください`,
      );
    }
  }

  private takeRequest(robots: boolean): void {
    this.checkBudget();
    this.requests += 1;
    if (!robots) this.sourceRequests += 1;
  }

  private async send(
    url: string,
    host: string,
    token: string,
    state: HostState,
    robots: boolean,
    { maxBytes, refuseRedirect, onRedirect }: SendOptions = {},
  ): Promise<FetchResult> {
    const beforeRedirect = async (target: string) => {
      if (hostOf(target) !== host)
        throw new CrawlStopped("許可していない転送先です");
      // Gazette pages are read only at their exact homepage and TOC URLs.
      if (!robots && host === GAZETTE_HOST)
        throw new CrawlStopped("官報のページは転送先を取得しません");
      if (refuseRedirect) throw new CrawlStopped(refuseRedirect);
      onRedirect?.();
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
      this.takeRequest(robots);
    };
    this.takeRequest(robots);
    const options: FetchOptions = { beforeRedirect, signal: this.signal };
    if (maxBytes !== undefined) options.maxBytes = maxBytes;
    try {
      const result = await this.transport(url, options);
      if (!robots) state.failures = 0;
      return result;
    } catch (error) {
      // robots() records a robots.txt failure itself, unless it is accepted.
      if (
        !robots &&
        error instanceof FetchError &&
        !(error instanceof CrawlStopped)
      )
        await this.backoff(host, token, state, error);
      throw error;
    } finally {
      await this.finish(host, token, state);
    }
  }

  /**
   * The origin's robots policy, or null when `unavailable` permits treating a
   * direct robots.txt 403 as unavailable (RFC 9309 2.3.1.3). That outcome is
   * never cached, so it cannot admit any other URL of the origin.
   */
  private async robots(
    url: string,
    host: string,
    token: string,
    state: HostState,
    unavailable: boolean,
  ): Promise<RobotsPolicy | null> {
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
    let redirected = false;
    try {
      const result = await this.send(
        `${origin}/robots.txt`,
        host,
        token,
        state,
        true,
        {
          maxBytes: 512_000,
          onRedirect: () => {
            redirected = true;
          },
        },
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
      } else if (unavailable && error.status === 403 && !redirected) {
        return null;
      } else {
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

  /**
   * The documented robots exceptions cover only the exact configured URL or an
   * exact official daily gazette TOC URL, never a redirect target. Returns
   * whether the URL was admitted with robots.txt unavailable (403).
   */
  private async guard(
    url: string,
    host: string,
    token: string,
    state: HostState,
    initial: boolean,
  ): Promise<boolean> {
    await this.pace(state);
    const policy = await this.robots(
      url,
      host,
      token,
      state,
      initial && this.robotsUnavailable.has(url),
    );
    const excepted =
      initial &&
      (this.robotsExceptions.has(url) ||
        (this.kanpoTocs && kanpoTocDate(url) !== null));
    if (policy && !policy.allows(url) && !excepted) {
      throw new CrawlStopped(
        "robots.txt でこの URL の自動取得が禁止されているため収集を停止しました",
      );
    }
    state.crawl_delay = Math.max(
      state.crawl_delay,
      policy?.delay ?? 0,
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
    return policy === null;
  }
}
