// SPDX-License-Identifier: MIT
// cspell:words backoffs
/** Atomic manual/automatic job selection, ownership, and lease transitions. */
import {
  CRAWL_HOST,
  CRAWL_SOURCE,
  type HostState,
  type SourceRecord,
} from "../collection/crawl-state.ts";
import type { Job, Source } from "../domain.ts";
import { UserError } from "../errors.ts";
import { siteHost } from "../net/url.ts";
import { dailySlot, nextDailyRun, nextPhase } from "../schedule.ts";
import type { SourceConfig } from "../sources/types.ts";
import { randomToken } from "../text.ts";
import { isoSeconds as timestamp } from "../time.ts";

import type { ArticleReader } from "./article-reader.ts";
import type { RecordStore } from "./record-store.ts";
import { decode, encode, textColumn } from "./row-codec.ts";
import { autoCollectAt, phaseOf } from "./source-schedule.ts";
import { DEFAULT_JOB, jobOf, settingsOf, type StateRows } from "./state.ts";
import type { StorageContext } from "./transaction-store.ts";

const JOB_OWNERSHIP = new Set([
  "id",
  "token",
  "leaseUntil",
  "kind",
  "articleIds",
  "running",
  "automatic",
  "dailyCollectionAt",
]);

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export class JobStore {
  private readonly context: StorageContext;
  private readonly sourceConfig: readonly SourceConfig[];
  private readonly records: Pick<RecordStore, "getRecord">;
  private readonly articles: Pick<ArticleReader, "pendingArticles">;

  constructor(
    context: StorageContext,
    sources: readonly SourceConfig[],
    records: Pick<RecordStore, "getRecord">,
    articles: Pick<ArticleReader, "pendingArticles">,
  ) {
    this.context = context;
    this.sourceConfig = sources;
    this.records = records;
    this.articles = articles;
  }

  async getJob(): Promise<Job> {
    const [, state] = await this.context.transactions.snapshot(["state"]);
    return jobOf(state.state);
  }

  async queueJob(
    kind: string,
    articleIds: string[] | null = null,
  ): Promise<Job> {
    if (kind !== "collect" && kind !== "analyze")
      throw new UserError("処理の種類が不正です");
    if (
      articleIds !== null &&
      (!Array.isArray(articleIds) ||
        articleIds.some((item) => typeof item !== "string"))
    ) {
      throw new UserError("記事の指定が不正です");
    }
    if (articleIds !== null && articleIds.length > 100)
      throw new UserError("記事は100件以内で指定してください");
    return this.context.transactions.mutate(["state"], (state) => {
      const previous = jobOf(state.state);
      if (previous.running)
        throw new UserError("処理中です。完了してから再実行してください");
      return this.newJob(state.state, kind, articleIds, false);
    });
  }

  private newJob(
    state: StateRows,
    kind: "collect" | "analyze",
    articleIds: string[] | null,
    automatic: boolean,
  ): Job {
    const job: Job = {
      ...DEFAULT_JOB,
      id: randomToken(),
      running: true,
      automatic,
      kind,
      articleIds: articleIds && [...articleIds],
      queuedAt: timestamp(this.context.clock()),
      phase: kind === "collect" ? "取得の準備中" : "仕分けの準備中",
      lastFinishedAt: jobOf(state).lastFinishedAt,
    };
    state.job = job;
    return job;
  }

  /**
   * An automatic collection of the given sources, fully initialized so that
   * the slice runner neither expands it to every source nor moves the
   * regular collection interval. `slot` is the daily JST slot it serves, if
   * any daily source is included.
   */
  private scheduledJob(
    state: StateRows,
    sourceIds: string[],
    slot: number,
  ): Job {
    return Object.assign(this.newJob(state, "collect", null, true), {
      phase: slot ? "定時収集の準備中" : "予定時刻の収集の準備中",
      ...(slot ? { dailyCollectionAt: slot } : {}),
      workIds: sourceIds,
      total: sourceIds.length,
      progress: 0,
      rubric: settingsOf(state).rubric,
      failed: 0,
      created: 0,
      limited: 0,
      deferred: 0,
    });
  }

  /**
   * Offset RSS sources due now, earliest first. A source without a time
   * under its current phase, or one overdue by a whole period (automation
   * off, source disabled, outage), is phased to the next JST slot no earlier
   * than the current minute and its settled crawl record; the row is written
   * by the caller's mutation. A slot at hh:mm:00 is due for a Cron firing
   * later in that minute.
   */
  private dueOffsets(
    sources: Map<string, Source>,
    configs: readonly SourceConfig[],
    records: Map<string, SourceRecord>,
    backoffs: Map<string, number>,
    now: number,
  ): string[] {
    const due: [number, string][] = [];
    for (const config of configs) {
      const source = sources.get(config.id);
      const phase = phaseOf(config);
      if (!source || phase === null) continue;
      const minutes = config.minCollectionMinutes ?? 60;
      const period = minutes * 60;
      let at = autoCollectAt(source, phase);
      if (!(at > now - period)) {
        const record = records.get(config.id);
        // Align the phase once; never round an actual request's minimum
        // up to another whole period. Shared host blocks resume staggered.
        at = Math.max(
          nextPhase(
            Math.max(
              Math.floor(now / 60) * 60,
              backoffs.get(siteHost(new URL(config.url))) ?? 0,
            ),
            config.collectionOffsetMinutes ?? 0,
            minutes,
          ),
          record ? record.last_requested + period : 0,
          record?.retry_at ?? 0,
        );
        Object.assign(source, {
          autoCollectAt: timestamp(at),
          autoCollectPhase: phase,
        });
      }
      if (at <= now) due.push([at, config.id]);
    }
    return due.sort((a, b) => a[0] - b[0]).map(([, id]) => id);
  }

  /**
   * Decides and queues at most one scheduler job in one atomic mutation.
   *
   * Scheduler records are read inside the mutation; every scheduler record
   * write increments the revision, so a concurrent job, setting, cooldown or
   * analysis result makes this decision retry from the new state.
   *
   * Offset RSS sources at their phased time and fixed daily sources at their
   * JST time come first, independent of the regular interval. An idle
   * automatic job yields to them at an item boundary: remaining sources are
   * carried and remaining analysis stays pending for a later batch. Offset
   * sources, each a single feed request, run before daily ones so a daily
   * batch does not shift their phase; manual jobs and live leases are never
   * replaced, and a queued batch that already holds every due source
   * continues. Neither time is revision-fenced against the crawl records, so
   * a source claimed meanwhile is deferred by CachedFetch.beginSource under
   * the host lease instead.
   *
   * Otherwise due regular collection wins, except that one analysis batch may
   * follow a finished collection so that collection longer than its interval
   * cannot starve classification. Only never-analyzed articles published
   * within the freshness window are chosen, newest first; older, undated,
   * invalid and future articles are left for manual review.
   */
  async queueAutomaticJob(canAnalyze: boolean): Promise<Job | null> {
    return this.context.transactions.mutate(
      ["state", "sources"],
      async (state) => {
        const previous = jobOf(state.state);
        const settings = settingsOf(state.state);
        const now = this.context.clock();
        const active = (config: SourceConfig) => {
          const source = state.sources.get(config.id);
          return source?.enabled === true && !source.collectionBlocked;
        };
        const candidates = settings.autoCollect
          ? this.sourceConfig.filter(
              (config) =>
                (config.dailyAtJst || phaseOf(config) !== null) &&
                active(config),
            )
          : [];
        const records = await this.crawlSources(
          candidates.map((config) => config.id),
          now,
        );
        const daily: string[] = [];
        let slot = 0;
        for (const config of candidates) {
          if (!config.dailyAtJst) continue;
          const started = records.get(config.id)?.last_requested;
          if (nextDailyRun(now, config.dailyAtJst, started) > now) continue;
          daily.push(config.id);
          slot = Math.max(slot, dailySlot(now, config.dailyAtJst));
        }
        const offsetHosts = [
          ...new Set(
            candidates
              .filter((item) => phaseOf(item) !== null)
              .map((item) => siteHost(new URL(item.url))),
          ),
        ];
        const backoffs = new Map(
          await Promise.all(
            offsetHosts.map(async (host): Promise<[string, number]> => {
              const record = await this.records.getRecord<Partial<HostState>>(
                CRAWL_HOST,
                host,
              );
              if (record && !Number.isFinite(record.blocked_until))
                throw new UserError("サイトの待機記録が不正です");
              return [host, record?.blocked_until ?? 0];
            }),
          ),
        );
        const due = [
          ...this.dueOffsets(state.sources, candidates, records, backoffs, now),
          ...daily,
        ];
        if (previous.running) {
          if (!previous.automatic || previous.leaseUntil > now) return null;
          const remaining =
            previous.kind === "collect"
              ? (previous.workIds?.slice(previous.progress) ?? [])
              : [];
          if (due.every((id) => remaining.includes(id))) return null;
          const configs = new Map(
            this.sourceConfig.map((config) => [config.id, config]),
          );
          const rank = (id: string) => {
            const config = configs.get(id);
            return config && phaseOf(config) !== null
              ? 0
              : config?.dailyAtJst
                ? 1
                : 2;
          };
          const work = [...new Set([...remaining, ...due])].sort(
            (a, b) => rank(a) - rank(b),
          );
          if (remaining.some((id) => rank(id) === 1))
            slot = Math.max(slot, previous.dailyCollectionAt ?? 0);
          return this.scheduledJob(state.state, work, slot);
        }
        if (due.length) return this.scheduledJob(state.state, due, slot);
        const collection = await this.records.getRecord<{ nextAt: number }>(
          "scheduler",
          "collection",
        );
        const collect =
          settings.autoCollect &&
          now >= (collection?.nextAt ?? 0) &&
          this.sourceConfig.some(
            (config) =>
              !config.dailyAtJst && phaseOf(config) === null && active(config),
          );
        let analyze: string[] = [];
        if (canAnalyze && settings.autoAnalyze) {
          const pause = await this.records.getRecord<{ nextAt: number }>(
            "scheduler",
            "analysis",
          );
          // Read after the snapshot: every article write increments the
          // revision, so a decision on newer articles is rejected and retried.
          if (now >= (pause?.nextAt ?? 0))
            analyze = (
              await this.articles.pendingArticles(
                now,
                Math.min(100, settings.pollMinutes),
              )
            ).map((article) => article.id);
        }
        if (collect && !(analyze.length && previous.kind === "collect"))
          return this.newJob(state.state, "collect", null, true);
        if (analyze.length)
          return this.newJob(state.state, "analyze", analyze, true);
        return null;
      },
    );
  }

  /** Unexpired `crawl_source` records of the given sources, in one query. */
  private async crawlSources(
    sourceIds: readonly string[],
    now: number,
  ): Promise<Map<string, SourceRecord>> {
    if (!sourceIds.length) return new Map();
    const result = await this.context.driver.batch([
      [
        "SELECT key,data FROM news_records WHERE namespace=? AND key IN (SELECT value FROM json_each(?)) AND (expires IS NULL OR expires>?)",
        [CRAWL_SOURCE, encode(sourceIds), now],
      ],
    ]);
    // A malformed record is left to CachedFetch, which refuses it.
    return new Map(
      (result[0]?.results ?? []).flatMap((row) => {
        const data = decode<Record<string, unknown>>(textColumn(row, "data"));
        if (!finite(data.last_requested)) return [];
        const record: SourceRecord = {
          last_requested: data.last_requested,
        };
        if (finite(data.retry_at)) record.retry_at = data.retry_at;
        return [[textColumn(row, "key"), record] as const];
      }),
    );
  }

  async claimJob(now: number, leaseSeconds = 600): Promise<Job | null> {
    if (!(leaseSeconds > 0)) throw new UserError("処理の期限が不正です");
    return this.context.transactions.mutate(["state"], (state) => {
      const job = jobOf(state.state);
      if (!job.running || job.leaseUntil > now) return null;
      Object.assign(job, {
        token: randomToken(),
        leaseUntil: now + leaseSeconds,
      });
      return job;
    });
  }

  private async changeJob(
    token: string,
    changes: Partial<Job>,
    mode: "update" | "release" | "finish",
  ): Promise<Job> {
    if (Object.keys(changes).some((key) => JOB_OWNERSHIP.has(key)))
      throw new UserError("処理の所有権は変更できません");
    return this.context.transactions.mutate(["state"], (state) => {
      const job = jobOf(state.state);
      if (
        !token ||
        job.token !== token ||
        !job.running ||
        job.leaseUntil <= this.context.clock()
      ) {
        throw new UserError("処理の有効期限または所有権が変わりました");
      }
      Object.assign(job, structuredClone(changes));
      if (mode !== "update") Object.assign(job, { token: null, leaseUntil: 0 });
      if (mode === "finish")
        Object.assign(job, {
          running: false,
          lastFinishedAt: timestamp(this.context.clock()),
        });
      return job;
    });
  }

  async updateJob(token: string, changes: Partial<Job>): Promise<Job> {
    return this.changeJob(token, changes, "update");
  }

  async releaseJob(token: string, changes: Partial<Job>): Promise<Job> {
    return this.changeJob(token, changes, "release");
  }

  async finishJob(token: string, changes: Partial<Job> = {}): Promise<Job> {
    return this.changeJob(token, changes, "finish");
  }
}
