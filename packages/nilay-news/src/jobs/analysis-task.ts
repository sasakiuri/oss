// SPDX-License-Identifier: MIT
import type { Analysis, Article, Clock } from "../domain.ts";
import { NotFoundError, UserError } from "../errors.ts";
import { isFreshPublication } from "../freshness.ts";
import type { Jev } from "../jev/client.ts";
import { evidenceHash } from "../jev/evidence.ts";
import type { Notifier } from "../notifications.ts";
import type { NewsRepository } from "../repository.ts";
import { truncate } from "../text.ts";

import { REPEATED_FAILURES, RubricChanged, type ActiveJob } from "./types.ts";

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

/** Classifies one article and validates its evidence again when saving. */
export class AnalysisTask {
  private readonly repository: NewsRepository;
  private readonly notifier: Notifier;
  private readonly clock: Clock;
  private readonly jev: Jev;

  constructor(
    repository: NewsRepository,
    jev: Jev,
    notifier: Notifier,
    clock: Clock,
  ) {
    this.repository = repository;
    this.jev = jev;
    this.notifier = notifier;
    this.clock = clock;
  }

  async run(
    job: ActiveJob,
    token: string,
    articleId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const repository = this.repository;
    if ((await repository.settings()).rubric !== job.rubric)
      throw new RubricChanged();
    let article: Article;
    try {
      article = await repository.article(articleId);
    } catch (error) {
      // Like an article missing when the batch started, one deleted since is
      // skipped, here or when its result is stored.
      if (error instanceof NotFoundError) return;
      throw error;
    }
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
    const relatedArticles = (await repository.relationPool(article)).filter(
      (item) =>
        item.reviewStatus === "posted" || chronological(item, article) < 0,
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
        "error",
        REPEATED_FAILURES,
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
        provenance: null,
        relationProvenance: null,
      };
    }
    signal.throwIfAborted();
    const related = relatedArticles.find(
      (item) => item.id === result.relatedArticleId,
    );
    const relationHash = related ? await evidenceHash(related) : null;
    let stored: boolean;
    try {
      stored = await repository.analyzeResult(
        articleId,
        await evidenceHash(article),
        job.rubric,
        result,
        relationHash,
      );
    } catch (error) {
      if (error instanceof NotFoundError) return;
      throw error;
    }
    if (!stored) {
      if ((await repository.settings()).rubric !== job.rubric)
        throw new RubricChanged();
      throw new UserError(
        "記事が変更されたため仕分けを停止しました。未判定の記事を再実行してください",
      );
    }
  }
}
