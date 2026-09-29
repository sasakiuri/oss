// SPDX-License-Identifier: MIT
import { isSourceCandidate } from "./candidates.ts";
import { CachedFetch, CrawlDeferred, type SourceAttempt } from "./crawl.ts";
import { withDeadline } from "./deadline.ts";
import type { Analysis, Article, Clock, Job, Settings } from "./domain.ts";
import { clock as systemClock } from "./domain.ts";
import { SettingsConflictError, UserError } from "./errors.ts";
import { freshness, isFreshPublication, newestFirst } from "./freshness.ts";
import { GoogleNewsResolver, resolveGoogleNewsItems } from "./google-news.ts";
import { Jev } from "./jev.ts";
import { isGoogleNewsUrl } from "./net/google-news.ts";
import { FetchError } from "./net/http.ts";
import type { FetchBytes } from "./net/types.ts";
import { hostname } from "./net/url.ts";
import { Notifier } from "./notifications.ts";
import { ACCOUNT, draft } from "./posts.ts";
import {
  POST_INTERVAL_SECONDS,
  POST_WINDOW_LABEL,
} from "./publication-policy.ts";
import { BufferClient, Publisher } from "./publishing.ts";
import type { NewsRepository } from "./repository.ts";
import { nextPhase } from "./schedule.ts";
import { collectSource } from "./sources/index.ts";
import type { SourceConfig } from "./sources/types.ts";
import { truncate } from "./text.ts";
import { isoSeconds } from "./time.ts";

type Crawl = Pick<
  CachedFetch,
  "fetch" | "beginSource" | "endSource" | "nextDue"
>;
/** Whether the scheduler may start another item in the same invocation. */
type Step = "continue" | "stop";
/** State of one scheduled invocation across its items. */
interface Burst {
  started: number;
  /** The job the previous item of this invocation belonged to. */
  jobId?: string;
}
/** Classification items one scheduled invocation may process in sequence. */
const ANALYSIS_ITEMS_PER_TICK = 10;
/**
 * No additional item starts once this much of the invocation has elapsed.
 * The first item always starts, so slow publication housekeeping never delays
 * collection.
 */
const ANALYSIS_SECONDS_PER_TICK = 45;
/** Post states that keep automatic posting from starting. */
const UNRESOLVED_POSTS = new Set([
  "publishing",
  "submitted",
  "unknown",
  "failed",
]);
type ActiveJob = Job &
  Required<
    Pick<
      Job,
      "workIds" | "rubric" | "failed" | "created" | "limited" | "deferred"
    >
  >;

/** A check without business-state changes; URL caches and rate limits may advance. */
export interface PublicationPreflight {
  checkedAt: string;
  account: string;
  provider: "Buffer";
  configured: boolean;
  connectionVerified: boolean;
  autoPost: boolean;
  postSelection: Settings["postSelection"];
  candidates: number;
  /** The article the first automatic post would use, with its exact text. */
  firstCandidate: { articleId: string; text: string } | null;
  blockers: string[];
  ready: boolean;
  notes: string[];
}

function chronological(a: Article, b: Article): number {
  for (const [left, right] of [
    [a.publishedAt || a.discoveredAt, b.publishedAt || b.discoveredAt],
    [a.discoveredAt, b.discoveredAt],
    [a.id, b.id],
  ]) {
    if (left !== undefined && right !== undefined && left !== right)
      return left < right ? -1 : 1;
  }
  return 0;
}

export class Application {
  readonly publisher: Publisher;
  readonly notifier: Notifier;
  private readonly clock: Clock;
  private readonly collector: typeof collectSource;
  private readonly crawl?: Crawl;
  private readonly crawlTransport?: FetchBytes;
  private readonly maxAnalysisItemsPerTick: number;

  constructor(
    readonly repository: NewsRepository,
    readonly jev: Jev,
    readonly buffer: BufferClient,
    options: {
      clock?: Clock;
      collector?: typeof collectSource;
      crawl?: Crawl;
      crawlTransport?: FetchBytes;
      notifier?: Notifier;
      maxAnalysisItemsPerTick?: number;
    } = {},
  ) {
    const items = options.maxAnalysisItemsPerTick ?? ANALYSIS_ITEMS_PER_TICK;
    if (
      !Number.isInteger(items) ||
      items < 1 ||
      items > ANALYSIS_ITEMS_PER_TICK
    )
      throw new RangeError("maxAnalysisItemsPerTick must be 1 to 10");
    this.maxAnalysisItemsPerTick = items;
    this.clock = options.clock ?? systemClock;
    this.collector = options.collector ?? collectSource;
    this.crawl = options.crawl;
    this.crawlTransport = options.crawlTransport;
    this.publisher = new Publisher(
      repository, buffer, this.clock, jev, this.crawlTransport,
    );
    this.notifier = options.notifier ?? new Notifier(repository);
  }

  /** Clock-derived state can change without writes; cache it for at most 30 seconds. */
  async stateCacheKey(): Promise<string> {
    const revision = await this.repository.stateVersion();
    return `${revision}-${Math.floor(this.clock() / 30)}`;
  }

  async state() {
    const now = this.clock();
    const articles = (await this.repository.articles()).map((article) => {
      let postDraft: string | null = null;
      try {
        postDraft = draft(article);
      } catch (error) {
        if (!(error instanceof UserError)) throw error;
      }
      // Derived from the stored source IDs on every read, never stored.
      return {
        ...article,
        sourceCandidate: isSourceCandidate(article),
        freshness: freshness(
          article.publishedAt,
          now,
          article.metadata?.publicationPrecision,
        ),
        postDraft,
      };
    });
    // Unclassified articles by whether automation may classify them.
    const unclassified = articles.filter(
      (article) => article.analysisStatus !== "done",
    );
    const analysis = await this.repository.getRecord<{ nextAt: number }>(
      "scheduler",
      "analysis",
    );
    return {
      articles,
      sources: await this.repository.sources(),
      job: await this.repository.getJob(),
      publication: {
        ...(await this.repository.publicationState()),
        configured: this.buffer.configured,
        account: ACCOUNT,
        provider: "Buffer",
        queued: (await this.repository.postCandidates()).length,
        error: null,
      },
      settings: {
        ...(await this.repository.settingsSnapshot()),
        jevConfigured: Boolean(this.jev.key),
        model: this.jev.model,
        slackConfigured: this.notifier.configured,
        autoAnalyzePausedUntil:
          analysis && analysis.nextAt > this.clock() ? analysis.nextAt : null,
      },
      stats: {
        total: articles.length,
        pending: unclassified.filter((article) => article.freshness === "fresh")
          .length,
        /** Published more than 24 hours ago; manual review only. */
        expired: unclassified.filter((article) => article.freshness === "stale")
          .length,
        /** Undated, invalid or future publication time; manual review only. */
        dateReview: unclassified.filter(
          (article) =>
            article.freshness !== "fresh" && article.freshness !== "stale",
        ).length,
      },
    };
  }

  async start(kind: string, articleIds?: unknown): Promise<Job> {
    if (kind !== "collect" && kind !== "analyze")
      throw new UserError("未対応の処理です");
    if (kind === "analyze" && !this.jev.key)
      throw new UserError(
        "Jev の API キーが未設定です。収集と手動での選別は利用できます",
      );
    if (articleIds !== undefined && articleIds !== null) {
      if (
        !Array.isArray(articleIds) ||
        articleIds.length > 100 ||
        !articleIds.every((id): id is string => typeof id === "string")
      ) {
        throw new UserError("記事は100件以内で指定してください");
      }
      for (const id of articleIds) await this.repository.article(id);
      return this.repository.queueJob(kind, articleIds);
    }
    return this.repository.queueJob(kind);
  }

  async settings(changes: Record<string, unknown>, expectedRevision?: string) {
    // Avoid paid account checks for an already stale edit. The repository
    // compares again atomically after any asynchronous verification below.
    if (
      expectedRevision !== undefined &&
      expectedRevision !== (await this.repository.settingsSnapshot()).revision
    )
      throw new SettingsConflictError();
    if (changes.autoAnalyze === true && !this.jev.key)
      throw new UserError("自動仕分けには Jev の API キーを設定してください");
    if (changes.autoPost === true) {
      if (!this.buffer.configured)
        throw new UserError(
          "Buffer の API キーとチャンネル ID を設定してください",
        );
      // Enabling is refused unless the account checks out right now.
      await this.buffer.verifyAccount();
    }
    return this.repository.updateSettings(changes, expectedRevision);
  }

  /**
   * Checks the Buffer account and the next post without sending, claiming or
   * editing business data. Resolving a Google link can populate its bounded
   * cache and rate records. A revision check also fences the asynchronous
   * lookup, but state may still change before posting is enabled.
   */
  async publicationPreflight(): Promise<PublicationPreflight> {
    const blockers: string[] = [];
    let connectionVerified = false;
    try {
      await this.buffer.verifyAccount();
      connectionVerified = true;
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      blockers.push(error.message);
    }
    const revision = await this.repository.stateVersion();
    const settings = await this.repository.settings();
    const { posts } = await this.repository.publicationState();
    const candidates = await this.repository.postCandidates();
    const unresolved = posts.filter((post) =>
      UNRESOLVED_POSTS.has(post.status),
    ).length;
    if (unresolved)
      blockers.push(
        `投稿結果の確認待ち・送信中の記事が ${unresolved} 件あります。Buffer と X を確認し、投稿結果を確定してください`,
      );
    let firstCandidate: PublicationPreflight["firstCandidate"] = null;
    const first = candidates[0];
    if (!first) {
      blockers.push(
        "投稿できる記事がありません。投稿する記事の設定と記事の状態を確認してください",
      );
    } else {
      try {
        let prepared = first;
        if (isGoogleNewsUrl(first.url)) {
          const resolver = new GoogleNewsResolver(this.repository, {
            clock: this.clock,
            transport: this.crawlTransport,
          });
          const url = await resolver.resolve(first.url);
          prepared = {
            ...first, url,
            metadata: { ...first.metadata, googleNewsUrl: first.url },
          };
          const attempted = new Set(posts.map((post) => post.articleId));
          if (
            !first.sourceKey &&
            (await this.repository.articles()).some(
              (other) => other.id !== first.id && !other.sourceKey &&
                other.url === url &&
                (other.reviewStatus === "posted" || attempted.has(other.id)),
            )
          )
            throw new UserError(
              "同じ元記事URLに投稿済みまたは投稿結果の確認待ちの記事があります",
            );
        }
        if (!isFreshPublication(
          prepared.publishedAt, this.clock(), prepared.metadata?.publicationPrecision,
        ))
          throw new UserError("確認中に記事の投稿対象期間が過ぎました");
        firstCandidate = { articleId: first.id, text: draft(prepared) };
      } catch (error) {
        if (!(error instanceof UserError)) throw error;
        blockers.push(
          `次に投稿する記事「${truncate(first.title, 80)}」の投稿文を作成できません（${error.message}）。記事を見送りにするか元記事を確認してください`,
        );
      }
    }
    if ((await this.repository.stateVersion()) !== revision)
      throw new UserError(
        "確認中に記事や設定が更新されました。もう一度、投稿前の確認を実行してください",
      );
    if (settings.autoPost)
      blockers.push(
        "自動投稿はすでに有効です。開始前の確認ではないため、投稿状況と Buffer・X の投稿結果を確認してください",
      );
    return {
      checkedAt: isoSeconds(this.clock()),
      account: ACCOUNT,
      provider: "Buffer",
      configured: this.buffer.configured,
      connectionVerified,
      autoPost: settings.autoPost,
      postSelection: settings.postSelection,
      candidates: candidates.length,
      firstCandidate,
      blockers,
      ready: connectionVerified && !blockers.length,
      notes: [
        "確認時点の結果です。有効にするまでに記事や Buffer の状態が変わる場合があります。",
        "有効にする時と投稿する時にも Buffer の接続を照合します。",
        `最初の投稿は有効にしてから${POST_INTERVAL_SECONDS / 60}分以上後で、その時点で鮮度条件を満たす最も新しい記事から順に、対象となる全記事を1件ずつ個別に投稿します。次の配信回は前回の開始から1時間以上後です。公開時刻がある記事は24時間以内、日付だけの記事は日本時間の今日・昨日が対象です。`,
        `自動投稿の送信は毎日 ${POST_WINDOW_LABEL} です。時間外に投稿対象になった記事は翌朝 06:00 以降に、その時点でも鮮度条件を満たせば送信します。Buffer に送信済みの投稿結果の確認は時間外にも行い、X への実際の配信は送信より遅れる場合があります。`,
      ],
    };
  }

  /**
   * Publication housekeeping runs once, then up to ten classification items
   * run one after another. Each item claims the job afresh, so a due daily
   * collection wins between items and a competing lease ends the burst. The
   * first item always starts; an additional item starts only within 45
   * seconds of the invocation start, and a started item keeps its own
   * deadline. A collection item, a failure, a finished job with errors or a
   * manual job queued during the invocation ends the burst.
   */
  async scheduled(): Promise<void> {
    const burst: Burst = { started: this.clock() };
    await this.housekeeping();
    for (let item = 0; item < this.maxAnalysisItemsPerTick; item += 1) {
      if (item && this.late(burst)) return;
      if ((await this.step(burst, item > 0)) === "stop") return;
    }
  }

  private late(burst: Burst): boolean {
    return this.clock() - burst.started >= ANALYSIS_SECONDS_PER_TICK;
  }

  /** A manual job this invocation did not start with belongs to the next one. */
  private static foreign(burst: Burst, job: Job): boolean {
    return job.running && job.automatic === false && job.id !== burst.jobId;
  }

  private async housekeeping(): Promise<void> {
    const repository = this.repository;
    await repository.recoverPosts(this.clock());
    if (this.buffer.configured) {
      try {
        await this.publisher.tick();
      } catch {
        await this.notifier.report(
          "publication-runtime",
          "投稿処理の状態を更新できませんでした",
          "自動再送は行いません。管理画面と Buffer・X の投稿結果を確認してください。",
        );
      }
    }
    if (this.notifier.configured) {
      const { posts } = await repository.publicationState();
      if (
        posts.some(
          (post) => post.status === "unknown" || post.status === "failed",
        )
      ) {
        await this.notifier.report(
          "publication",
          "X 投稿が停止しています",
          "投稿の失敗、または結果不明の記事があります。管理画面と Buffer・X を確認し、投稿結果を確定してください。",
        );
      }
      if (
        !posts.some((post) =>
          ["publishing", "submitted", "unknown", "failed"].includes(
            post.status,
          ),
        )
      ) {
        await this.notifier.recover(
          "publication",
          "投稿結果の確認が完了しました",
        );
        await this.notifier.recover(
          "publication-runtime",
          "投稿処理の状態更新を再開しました",
        );
      }
    }
  }

  /**
   * Claims the job for one item; the claim is released or finished before
   * returning. An additional item rechecks the time budget and the job's
   * identity around the claim and releases a fresh claim unchanged.
   */
  private async step(burst: Burst, additional: boolean): Promise<Step> {
    const repository = this.repository;
    const previous = await repository.getJob();
    if (additional && Application.foreign(burst, previous)) return "stop";
    // Decided every item: a due daily collection may replace an idle automatic job.
    await this.queueAutomatic();
    if (additional && this.late(burst)) return "stop";
    const job = await repository.claimJob(this.clock(), 600);
    if (!job?.token) return "stop";
    const token = job.token;
    if (additional && Application.foreign(burst, job)) {
      await repository.releaseJob(token, {});
      return "stop";
    }
    if (
      previous.token &&
      previous.leaseUntil <= this.clock() &&
      previous.id === job.id
    ) {
      await this.notifier.report(
        "job",
        "中断された処理を再開します",
        "前回の実行が完了しませんでした。保存された進捗から収集・仕分けを再開します。",
        "warning",
      );
    }
    if (additional && this.late(burst)) {
      await repository.releaseJob(token, {});
      return "stop";
    }
    burst.jobId = job.id;
    try {
      return await withDeadline(
        (signal) => this.runSlice(job, token, signal),
        240_000,
      );
    } catch (error) {
      const message =
        error instanceof UserError
          ? error.message
          : "処理を完了できませんでした。再実行してください";
      try {
        if (job.kind === "analyze") await this.pauseAnalysis(token);
        await repository.finishJob(token, {
          error: truncate(message, 1000),
          phase: "一部未完了",
          lastFinishedAt: isoSeconds(this.clock()),
        });
      } catch (finishError) {
        // The deadline does not cancel in-flight writes, so the slice may have
        // already released or finished the job; its persisted progress stands.
        if (
          finishError instanceof UserError &&
          (await repository.getJob()).token !== token
        )
          return "stop";
        throw finishError;
      }
      await this.notifier.report(
        "job",
        "収集・仕分け処理が中断されました",
        "管理画面で処理状況を確認し、必要に応じて再実行してください。",
      );
      return "stop";
    }
  }

  /**
   * Queues at most one automatic job while idle. The repository decides
   * atomically; only the missing-key notice is sent from here.
   */
  private async queueAutomatic(): Promise<void> {
    const settings = await this.repository.settings();
    if (!settings.autoCollect && !settings.autoAnalyze) return;
    const job = await this.repository.queueAutomaticJob(Boolean(this.jev.key));
    if (settings.autoAnalyze && !this.jev.key)
      await this.notifier.report(
        "auto-analysis",
        "自動仕分けを実行できません",
        "Jev の API キーが未設定です。キーを設定するか、設定で自動仕分けを無効にしてください。",
      );
    else if (job?.kind === "analyze")
      await this.notifier.recover("auto-analysis", "自動仕分けを再開しました");
  }

  /**
   * After a failed classification, automatic batches wait one interval. Only
   * the current lease holder can pause, so a stale slice never delays a newer job.
   */
  private async pauseAnalysis(token: string): Promise<void> {
    const { pollMinutes } = await this.repository.settings();
    await this.repository.putRecord(
      "scheduler",
      "analysis",
      { nextAt: this.clock() + pollMinutes * 60 },
      { jobToken: token },
    );
  }

  private async runSlice(
    job: Job,
    token: string,
    signal: AbortSignal,
  ): Promise<Step> {
    const repository = this.repository;
    if (!job.workIds?.length) {
      let work: string[];
      if (job.kind === "collect") {
        // Fixed daily and offset sources have their own automatic batches.
        const sources = (await repository.sources()).filter(
          (source) =>
            source.enabled &&
            !(
              job.automatic &&
              (source.dailyAtJst ||
                source.collectionOffsetMinutes !== undefined)
            ),
        );
        if (!sources.length)
          throw new UserError("設定で情報源を1つ以上有効にしてください");
        work = sources
          .sort((a, b) =>
            (a.lastFetchedAt ?? "") < (b.lastFetchedAt ?? "")
              ? -1
              : (a.lastFetchedAt ?? "") > (b.lastFetchedAt ?? "")
                ? 1
                : 0,
          )
          .map((source) => source.id);
        const settings = await repository.settings();
        await repository.putRecord(
          "scheduler",
          "collection",
          { nextAt: this.clock() + settings.pollMinutes * 60 },
          { jobToken: token },
        );
      } else {
        const articles = await repository.articles();
        if (job.articleIds === null) {
          // Classifying everything follows the automatic policy: fresh
          // articles only, newest publication first.
          const now = this.clock();
          work = articles
            .filter(
              (article) =>
                article.analysisStatus !== "done" &&
                isFreshPublication(
                  article.publishedAt,
                  now,
                  article.metadata?.publicationPrecision,
                ),
            )
            .sort(newestFirst)
            .slice(0, 100)
            .map((article) => article.id);
        } else {
          // Requested order is kept: manual selections as chosen, automatic
          // batches newest first.
          const existing = new Set(articles.map((article) => article.id));
          work = [...new Set(job.articleIds)]
            .filter((id) => existing.has(id))
            .slice(0, 100);
        }
      }
      signal.throwIfAborted();
      const changes = {
        workIds: work,
        total: work.length,
        progress: 0,
        rubric: (await repository.settings()).rubric,
        failed: 0,
        created: 0,
        limited: 0,
        deferred: 0,
      };
      Object.assign(job, changes);
      await repository.updateJob(token, changes);
    }
    if (
      !job.workIds ||
      job.rubric === undefined ||
      job.failed === undefined ||
      job.created === undefined ||
      job.limited === undefined ||
      job.deferred === undefined
    ) {
      throw new UserError("保存された処理状態が不正です");
    }
    const active = job as ActiveJob;
    const itemId = active.workIds[active.progress];
    if (itemId === undefined) {
      await repository.finishJob(token, {
        phase: "完了",
        lastFinishedAt: isoSeconds(this.clock()),
      });
      return "stop";
    }
    signal.throwIfAborted();
    const failedBefore = active.failed;
    if (job.kind === "collect")
      await this.collect(active, token, itemId, signal);
    else await this.analyze(active, token, itemId, signal);
    signal.throwIfAborted();
    active.progress += 1;
    const { progress, failed, created, limited, deferred } = active;
    const changes = { progress, failed, created, limited, deferred };
    if (
      progress === active.total ||
      (active.kind === "analyze" && failed >= 3)
    ) {
      const warning = [];
      if (limited)
        warning.push(
          `${limited} 件の情報源に取得範囲・本文の注意事項があります`,
        );
      if (deferred)
        warning.push(`${deferred} 件の情報源は取得間隔のため延期しました`);
      const error = failed
        ? `${failed} 件を処理できませんでした。詳細を確認して再実行してください`
        : null;
      if (error && active.kind === "analyze") await this.pauseAnalysis(token);
      await repository.finishJob(token, {
        ...changes,
        phase: error ? "一部未完了" : "完了",
        error,
        warning: warning.join("。") || null,
        lastFinishedAt: isoSeconds(this.clock()),
      });
      if (error) return "stop";
      await this.notifier.recover(
        "job",
        "収集・仕分け処理が正常に完了しました",
      );
    } else {
      await repository.releaseJob(token, {
        ...changes,
        phase: `${progress}/${active.total} 件完了・次の処理を待機中`,
      });
    }
    // Collection keeps one source per tick; a failure waits for the next tick.
    return active.kind === "analyze" && failed === failedBefore
      ? "continue"
      : "stop";
  }

  private async collect(
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
    const host = await this.repository.getRecord<{ blocked_until?: unknown }>(
      "crawl_host",
      hostname(source.url).replace(/^www\./, ""),
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

  private async analyze(
    job: ActiveJob,
    token: string,
    articleId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const repository = this.repository;
    if ((await repository.settings()).rubric !== job.rubric)
      throw new UserError(
        "選定基準が変更されたため仕分けを停止しました。新しい基準で再実行してください",
      );
    const article = await repository.article(articleId);
    await repository.updateJob(token, {
      phase: `Jev で仕分け中 ${job.progress + 1}/${job.total}`,
    });
    // A crash after storing a result but before recording progress replays
    // this item. An automatic job never pays for an analyzed article again;
    // a stored failure still counts, so the batch still pauses automation.
    if (job.automatic && article.analysisStatus !== "pending") {
      if (article.analysisStatus === "error") job.failed += 1;
      return;
    }
    // Policy-selected work, including jobs queued before this rule or
    // waiting past the window, skips an article that is no longer fresh
    // without a request or an error. Manually selected articles are classified
    // as requested.
    const policy = job.automatic || job.articleIds === null;
    if (
      policy &&
      !isFreshPublication(
        article.publishedAt,
        this.clock(),
        article.metadata?.publicationPrecision,
      )
    )
      return;
    const relatedArticles = (await repository.articles()).filter(
      (item) =>
        item.id !== article.id &&
        (item.reviewStatus === "posted" || chronological(item, article) < 0),
    );
    let result: Analysis;
    try {
      signal.throwIfAborted();
      if (
        policy &&
        !isFreshPublication(
          article.publishedAt,
          this.clock(),
          article.metadata?.publicationPrecision,
        )
      )
        return;
      result = await this.jev.analyze(
        article,
        job.rubric,
        relatedArticles,
        signal,
      );
      signal.throwIfAborted();
      await this.notifier.recover("jev", "Jev による仕分けが復旧しました");
    } catch (error) {
      signal.throwIfAborted();
      job.failed += 1;
      await this.notifier.report(
        "jev",
        "Jev による仕分けに失敗しました",
        "API の設定・利用上限・応答を管理画面で確認してください。記事と手動の選別状態は保持しています。",
      );
      result = {
        analysisStatus: "error",
        analysisError:
          error instanceof UserError
            ? truncate(error.message, 1000)
            : "Jev の応答を処理できませんでした",
        decision: null,
        topic: null,
        priority: null,
        probability: null,
        reason: null,
        relatedArticleId: null,
        relation: null,
      };
    }
    signal.throwIfAborted();
    const related = relatedArticles.find(
      (item) => item.id === result.relatedArticleId,
    );
    const relationHash = related
      ? await repository.evidenceHash(related)
      : null;
    if (
      !(await repository.analyzeResult(
        articleId,
        await repository.evidenceHash(article),
        job.rubric,
        result,
        relationHash,
      ))
    ) {
      throw new UserError(
        "選定基準または記事が変更されたため仕分けを停止しました。未判定の記事を再実行してください",
      );
    }
  }
}
