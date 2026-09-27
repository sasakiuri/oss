// SPDX-License-Identifier: MIT
import { CachedFetch, CrawlDeferred } from "./crawl.ts";
import { withDeadline } from "./deadline.ts";
import type { Analysis, Article, Clock, Job } from "./domain.ts";
import { clock as systemClock } from "./domain.ts";
import { UserError } from "./errors.ts";
import { Jev } from "./jev.ts";
import { Notifier } from "./notifications.ts";
import { ACCOUNT, draft } from "./posts.ts";
import { BufferClient, Publisher } from "./publishing.ts";
import type { NewsRepository } from "./repository.ts";
import { collectSource } from "./sources/index.ts";
import { truncate } from "./text.ts";
import { isoSeconds } from "./time.ts";

type Crawl = Pick<CachedFetch, "fetch" | "beginSource" | "endSource">;
type ActiveJob = Job &
  Required<
    Pick<
      Job,
      "workIds" | "rubric" | "failed" | "created" | "limited" | "deferred"
    >
  >;

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

  constructor(
    readonly repository: NewsRepository,
    readonly jev: Jev,
    readonly buffer: BufferClient,
    options: {
      clock?: Clock;
      collector?: typeof collectSource;
      crawl?: Crawl;
      notifier?: Notifier;
    } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.collector = options.collector ?? collectSource;
    this.crawl = options.crawl;
    this.publisher = new Publisher(repository, buffer, this.clock);
    this.notifier = options.notifier ?? new Notifier(repository);
  }

  async state() {
    const articles = (await this.repository.articles()).map((article) => {
      let postDraft: string | null = null;
      try {
        postDraft = draft(article);
      } catch (error) {
        if (!(error instanceof UserError)) throw error;
      }
      return { ...article, postDraft };
    });
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
        ...(await this.repository.settings()),
        jevConfigured: Boolean(this.jev.key),
        model: this.jev.model,
        slackConfigured: this.notifier.configured,
      },
      stats: {
        total: articles.length,
        pending: articles.filter((article) => article.analysisStatus !== "done")
          .length,
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

  async settings(changes: Record<string, unknown>) {
    if (changes.autoPost === true && !this.buffer.configured)
      throw new UserError(
        "Buffer の API キーとチャンネル ID を設定してください",
      );
    return this.repository.updateSettings(changes);
  }

  async scheduled(): Promise<void> {
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
    const previous = await repository.getJob();
    if (!previous.running) {
      const settings = await repository.settings();
      const schedule = await repository.getRecord<{ nextAt: number }>(
        "scheduler",
        "collection",
      );
      if (settings.autoCollect && this.clock() >= (schedule?.nextAt ?? 0)) {
        try {
          await this.start("collect");
        } catch (error) {
          if (!(error instanceof UserError)) throw error;
        }
      }
    }
    const job = await repository.claimJob(this.clock(), 600);
    if (!job?.token) return;
    const token = job.token;
    if (previous.token && previous.leaseUntil <= this.clock()) {
      await this.notifier.report(
        "job",
        "中断された処理を再開します",
        "前回の実行が完了しませんでした。保存された進捗から収集・仕分けを再開します。",
        "warning",
      );
    }
    try {
      await withDeadline(
        (signal) => this.runSlice(job, token, signal),
        240_000,
      );
    } catch (error) {
      const message =
        error instanceof UserError
          ? error.message
          : "処理を完了できませんでした。再実行してください";
      try {
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
          return;
        throw finishError;
      }
      await this.notifier.report(
        "job",
        "収集・仕分け処理が中断されました",
        "管理画面で処理状況を確認し、必要に応じて再実行してください。",
      );
    }
  }

  private async runSlice(
    job: Job,
    token: string,
    signal: AbortSignal,
  ): Promise<void> {
    const repository = this.repository;
    if (!job.workIds?.length) {
      let work: string[];
      if (job.kind === "collect") {
        const sources = (await repository.sources()).filter(
          (source) => source.enabled,
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
        await repository.putRecord("scheduler", "collection", {
          nextAt: this.clock() + settings.pollMinutes * 60,
        });
      } else {
        const articles = await repository.articles();
        const chosen = job.articleIds === null ? null : new Set(job.articleIds);
        work = articles
          .filter((article) =>
            chosen ? chosen.has(article.id) : article.analysisStatus !== "done",
          )
          .slice(0, 100)
          .map((article) => article.id);
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
      return;
    }
    signal.throwIfAborted();
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
      await repository.finishJob(token, {
        ...changes,
        phase: error ? "一部未完了" : "完了",
        error,
        warning: warning.join("。") || null,
        lastFinishedAt: isoSeconds(this.clock()),
      });
      if (!error)
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
      new CachedFetch(this.repository, sources, { clock: this.clock, signal });
    await this.repository.updateJob(token, {
      phase: `${source.name} から取得中`,
    });
    let started = false;
    try {
      await crawl.beginSource(source);
      started = true;
      const { items, warnings, notes } = await this.collector(source, (url) =>
        crawl.fetch(url),
      );
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
      signal.throwIfAborted();
      if (error instanceof CrawlDeferred) {
        job.deferred += 1;
        await this.repository.updateSource(sourceId, {
          lastDeferred: error.message,
          nextFetchAt: isoSeconds(error.until),
        });
      } else {
        job.failed += 1;
        await this.repository.updateSource(sourceId, {
          lastError:
            error instanceof UserError
              ? truncate(error.message, 1000)
              : "取得形式を読み取れませんでした",
          lastDeferred: null,
        });
        await this.notifier.report(
          `crawl:${sourceId}`,
          "ニュースのクロールに失敗しました",
          `${source.name}：通信・取得制限または解析エラーです。管理画面の収集元と設定で理由を確認してください。`,
        );
      }
    } finally {
      if (started) {
        try {
          await crawl.endSource(source);
        } catch (error) {
          if (!(error instanceof CrawlDeferred)) throw error;
        }
      }
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
    const earlier = (await repository.articles()).filter(
      (item) => chronological(item, article) < 0,
    );
    let result: Analysis;
    try {
      signal.throwIfAborted();
      result = await this.jev.analyze(article, job.rubric, earlier, signal);
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
    const related = earlier.find((item) => item.id === result.relatedArticleId);
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
