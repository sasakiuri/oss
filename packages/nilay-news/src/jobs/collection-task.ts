// SPDX-License-Identifier: MIT
import { CRAWL_HOST, type HostState } from "../collection/crawl-state.ts";
import {
  CachedFetch,
  CrawlDeferred,
  type SourceAttempt,
} from "../collection/crawl.ts";
import { resolveGoogleNewsItems } from "../collection/google-news-resolver.ts";
import type { Clock } from "../domain.ts";
import { UserError } from "../errors.ts";
import { FetchError } from "../net/http.ts";
import type { FetchBytes } from "../net/types.ts";
import { siteHost } from "../net/url.ts";
import type { Notifier } from "../notifications.ts";
import type { NewsRepository } from "../repository.ts";
import { nextPhase } from "../schedule.ts";
import { collectSource } from "../sources/index.ts";
import type { SourceConfig } from "../sources/types.ts";
import { truncate } from "../text.ts";
import { isoSeconds } from "../time.ts";

import { REPEATED_FAILURES, type ActiveJob } from "./types.ts";

export type Crawl = Pick<
  CachedFetch,
  "fetch" | "beginSource" | "endSource" | "nextDue"
>;
export interface CollectionOptions {
  clock: Clock;
  collector?: typeof collectSource;
  crawl?: Crawl;
  crawlTransport?: FetchBytes;
}

/** Executes one source under the job lease and settles its crawl schedule. */
export class CollectionTask {
  private readonly repository: NewsRepository;
  private readonly notifier: Notifier;
  private readonly clock: Clock;
  private readonly collector: typeof collectSource;
  private readonly crawl?: Crawl;
  private readonly crawlTransport?: FetchBytes;

  constructor(
    repository: NewsRepository,
    notifier: Notifier,
    options: CollectionOptions,
  ) {
    this.repository = repository;
    this.notifier = notifier;
    this.clock = options.clock;
    this.collector = options.collector ?? collectSource;
    this.crawl = options.crawl;
    this.crawlTransport = options.crawlTransport;
  }

  async run(
    job: ActiveJob,
    token: string,
    sourceId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const sources = await this.repository.sources();
    const source = sources.find((item) => item.id === sourceId);
    if (!source?.enabled) return;
    const crawl =
      this.crawl ??
      new CachedFetch(this.repository, sources, {
        clock: this.clock,
        signal,
        transport: this.crawlTransport,
      });
    await this.repository.updateJob(token, {
      phase: `${source.name} から取得中`,
    });
    let attempt: SourceAttempt | undefined;
    let outcome: unknown = null;
    try {
      attempt = await crawl.beginSource(source);
      // Source filters judge freshness by the same clock as storage.
      const result = await this.collector(
        source,
        (url) => crawl.fetch(url),
        this.clock(),
      );
      await resolveGoogleNewsItems(result, this.repository, {
        clock: this.clock,
        signal,
        transport: this.crawlTransport,
      });
      const { items, warnings, notes } = result;
      signal.throwIfAborted();
      job.created += await this.repository.ingest(source, items);
      signal.throwIfAborted();
      job.limited += warnings.length ? 1 : 0;
      await this.repository.updateSource(sourceId, {
        lastFetchedAt: isoSeconds(this.clock()),
        lastCount: items.length,
        lastError: null,
        lastWarnings: warnings,
        lastDeferred: null,
        nextFetchAt: null,
      });
      if (warnings.some((warning) => !notes.includes(warning))) {
        await this.notifier.report(
          `crawl:${sourceId}`,
          "記事の取得に未完了の項目があります",
          `${source.name}：取得範囲・本文の注意事項を管理画面で確認してください。`,
          "warning",
          REPEATED_FAILURES,
        );
      } else
        await this.notifier.recover(
          `crawl:${sourceId}`,
          `${source.name}の収集が復旧しました`,
        );
    } catch (error) {
      outcome = error;
      signal.throwIfAborted();
      if (error instanceof CrawlDeferred) {
        job.deferred += 1;
        // Settled first, so the shown time includes any interval it consumed.
        if (attempt) {
          const settled = attempt;
          attempt = undefined;
          await this.endSource(crawl, source, settled, error);
        }
        await this.repository.updateSource(sourceId, {
          lastDeferred: error.message,
          nextFetchAt: isoSeconds(
            Math.max(error.until, await crawl.nextDue(source)),
          ),
        });
      } else {
        job.failed += 1;
        await this.repository.updateSource(sourceId, {
          lastError:
            error instanceof UserError
              ? truncate(error.message, 1000)
              : "取得形式を読み取れませんでした",
          lastDeferred: null,
          nextFetchAt: null,
        });
        // Only a validated status code is added; never the raw message.
        const code = error instanceof FetchError ? error.status : undefined;
        const status =
          code !== undefined &&
          Number.isInteger(code) &&
          code >= 100 &&
          code <= 599
            ? `HTTP ${code}。`
            : "";
        await this.notifier.report(
          `crawl:${sourceId}`,
          "ニュースのクロールに失敗しました",
          `${source.name}：${status}通信・取得制限または解析エラーです。管理画面の収集元と設定で理由を確認してください。`,
          "error",
          REPEATED_FAILURES,
        );
      }
    } finally {
      if (attempt) await this.endSource(crawl, source, attempt, outcome);
      if (source.collectionOffsetMinutes !== undefined)
        await this.scheduleOffset(crawl, source, token);
    }
  }

  /**
   * After a settled attempt of any job, an offset source is next queued when
   * the crawl gate would admit it: one period after a real request ended, at
   * the retry time of a deferral that sent nothing, and no earlier than a
   * host backoff. The phase is not rounded to the next slot, so a request
   * finishing just after its slot does not wait a whole extra period.
   */
  private async scheduleOffset(
    crawl: Crawl,
    source: SourceConfig,
    token: string,
  ): Promise<void> {
    const host = await this.repository.getRecord<Partial<HostState>>(
      CRAWL_HOST,
      siteHost(source.url),
    );
    const blocked = host?.blocked_until;
    await this.repository.scheduleAutoCollection(
      source.id,
      Math.max(
        this.clock() + 60,
        await crawl.nextDue(source),
        typeof blocked === "number" &&
          Number.isFinite(blocked) &&
          blocked > this.clock()
          ? nextPhase(
              blocked,
              source.collectionOffsetMinutes ?? 0,
              source.minCollectionMinutes ?? 60,
            )
          : 0,
      ),
      token,
    );
  }

  /** A busy host lease leaves the attempt claimed, as if it had sent. */
  private async endSource(
    crawl: Crawl,
    source: SourceConfig,
    attempt: SourceAttempt,
    outcome: unknown,
  ): Promise<void> {
    try {
      await crawl.endSource(source, attempt, outcome);
    } catch (error) {
      if (!(error instanceof CrawlDeferred)) throw error;
    }
  }
}
