// SPDX-License-Identifier: MIT
import { withDeadline } from "../deadline.ts";
import type { Clock, Job } from "../domain.ts";
import { UserError } from "../errors.ts";
import type { Jev } from "../jev/client.ts";
import type { Notifier } from "../notifications.ts";
import type { NewsRepository } from "../repository.ts";
import { truncate } from "../text.ts";
import { isoSeconds } from "../time.ts";

import { AnalysisTask } from "./analysis-task.ts";
import { CollectionTask, type CollectionOptions } from "./collection-task.ts";
import { REPEATED_FAILURES, RubricChanged, type ActiveJob } from "./types.ts";

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
/** Owns job claiming, deadlines, progress and scheduling between items. */
export class JobRunner {
  private readonly repository: NewsRepository;
  private readonly jev: Jev;
  private readonly notifier: Notifier;
  private readonly clock: Clock;
  private readonly maxAnalysisItemsPerTick: number;
  private readonly collection: CollectionTask;
  private readonly analysis: AnalysisTask;

  constructor(
    repository: NewsRepository,
    jev: Jev,
    notifier: Notifier,
    options: CollectionOptions & { maxAnalysisItemsPerTick?: number },
  ) {
    this.repository = repository;
    this.jev = jev;
    this.notifier = notifier;
    this.clock = options.clock;
    const items = options.maxAnalysisItemsPerTick ?? ANALYSIS_ITEMS_PER_TICK;
    if (
      !Number.isInteger(items) ||
      items < 1 ||
      items > ANALYSIS_ITEMS_PER_TICK
    )
      throw new RangeError("maxAnalysisItemsPerTick must be 1 to 10");
    this.maxAnalysisItemsPerTick = items;
    this.collection = new CollectionTask(repository, notifier, options);
    this.analysis = new AnalysisTask(repository, jev, notifier, options.clock);
  }

  /** Each item gets a fresh lease; daily collection can win between analysis items. */
  async run(started: number): Promise<void> {
    const burst: Burst = { started };
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

  /**
   * Claims the job for one item; the claim is released or finished before
   * returning. An additional item rechecks the time budget and the job's
   * identity around the claim and releases a fresh claim unchanged.
   */
  private async step(burst: Burst, additional: boolean): Promise<Step> {
    const repository = this.repository;
    const previous = await repository.getJob();
    if (additional && JobRunner.foreign(burst, previous)) return "stop";
    // Decided every item: a due daily collection may replace an idle automatic job.
    await this.queueAutomatic();
    if (additional && this.late(burst)) return "stop";
    const job = await repository.claimJob(this.clock(), 600);
    if (!job?.token) return "stop";
    const token = job.token;
    if (additional && JobRunner.foreign(burst, job)) {
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
        "処理の中断が続いています。保存された進捗から収集・仕分けを再開します。管理画面で処理状況を確認してください。",
        "warning",
        REPEATED_FAILURES,
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
      } else if (job.articleIds === null) {
        // Classifying everything follows the automatic policy: fresh
        // articles only, newest publication first.
        work = (await repository.pendingArticles(this.clock(), 100, true)).map(
          (article) => article.id,
        );
      } else {
        // Requested order is kept: manual selections as chosen, automatic
        // batches newest first.
        const requested = [...new Set(job.articleIds)];
        const existing = await repository.existingArticleIds(requested);
        work = requested.filter((id) => existing.has(id)).slice(0, 100);
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
      await this.collection.run(active, token, itemId, signal);
    else {
      try {
        await this.analysis.run(active, token, itemId, signal);
      } catch (error) {
        if (!(error instanceof RubricChanged)) throw error;
        // The next run queues the remaining articles under the new criteria,
        // so automation neither pauses nor reports this as a failure.
        // A manual selection is not requeued, so it asks for a rerun.
        await repository.finishJob(token, {
          phase: "選定基準の変更により終了",
          warning: job.automatic
            ? null
            : "選定基準が変更されたため、選択した記事を新しい基準で再実行してください",
          lastFinishedAt: isoSeconds(this.clock()),
        });
        return "stop";
      }
    }
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
}
