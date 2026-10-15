// SPDX-License-Identifier: MIT
import type { Article, Clock, Job } from "./domain.ts";
import { clock as systemClock } from "./domain.ts";
import { NotFoundError, SettingsConflictError, UserError } from "./errors.ts";
import { freshness } from "./freshness.ts";
import type { Jev } from "./jev/client.ts";
import type { CollectionOptions } from "./jobs/collection-task.ts";
import { maintainNews } from "./jobs/maintenance.ts";
import { JobRunner } from "./jobs/runner.ts";
import type { FetchBytes } from "./net/types.ts";
import { Notifier } from "./notifications.ts";
import type { BufferClient } from "./publishing/buffer-client.ts";
import { ACCOUNT, draft } from "./publishing/draft.ts";
import { isSourceCandidate } from "./publishing/policy.ts";
import { publicationPreflight } from "./publishing/preflight.ts";
import { Publisher } from "./publishing/publisher.ts";
import type { ArticleQuery, NewsRepository } from "./repository.ts";

export interface ApplicationOptions extends Partial<CollectionOptions> {
  notifier?: Notifier;
  maxAnalysisItemsPerTick?: number;
}

/** HTTP use cases and composition of the independently scheduled workflows. */
export class Application {
  readonly publisher: Publisher;
  readonly notifier: Notifier;
  readonly repository: NewsRepository;
  readonly jev: Jev;
  readonly buffer: BufferClient;
  private readonly clock: Clock;
  private readonly crawlTransport?: FetchBytes;
  private readonly jobs: JobRunner;

  constructor(
    repository: NewsRepository,
    jev: Jev,
    buffer: BufferClient,
    options: ApplicationOptions = {},
  ) {
    this.repository = repository;
    this.jev = jev;
    this.buffer = buffer;
    this.clock = options.clock ?? systemClock;
    this.crawlTransport = options.crawlTransport;
    this.notifier = options.notifier ?? new Notifier(repository);
    this.jobs = new JobRunner(repository, jev, this.notifier, {
      ...options,
      clock: this.clock,
    });
    this.publisher = new Publisher(
      repository,
      buffer,
      this.clock,
      jev,
      this.crawlTransport,
    );
  }

  /** Clock-derived state can change without writes; cache it for at most 30 seconds. */
  async stateCacheKey(): Promise<string> {
    const revision = await this.repository.stateVersion();
    return `${revision}-${Math.floor(this.clock() / 30)}`;
  }

  async state() {
    const now = this.clock();
    const stats = await this.repository.articleCounts(now);
    const analysis = await this.repository.getRecord<{ nextAt: number }>(
      "scheduler",
      "analysis",
    );
    return {
      sources: await this.repository.sources(),
      job: {
        ...(await this.repository.getJob()),
        workIds: undefined,
        articleIds: undefined,
        rubric: undefined,
      },
      publication: {
        ...(await this.repository.publicationState([])),
        configured: this.buffer.configured,
        account: ACCOUNT,
        provider: "Buffer",
        queued: stats.queued,
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
      stats,
    };
  }

  private decorateArticle(article: Article, now = this.clock()) {
    return {
      ...article,
      sourceCandidate: isSourceCandidate(article),
      freshness: freshness(
        article.publishedAt,
        now,
        article.metadata?.publicationPrecision,
      ),
    };
  }

  async articles(query: ArticleQuery) {
    const page = await this.repository.articlePage(query, this.clock());
    return {
      ...page,
      articles: page.articles.map((article) =>
        this.decorateArticle(article, Number(page.snapshot.split(":")[1])),
      ),
      publication: await this.repository.publicationState(
        page.articles.map((article) => article.id),
      ),
    };
  }

  async article(id: string) {
    const article = await this.repository.article(id);
    let postDraft: string | null = null;
    try {
      postDraft = draft(article);
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
    }
    const related = article.relatedArticleId
      ? await this.repository
          .article(article.relatedArticleId)
          .catch((error: unknown) => {
            if (error instanceof NotFoundError) return null;
            throw error;
          })
      : null;
    return {
      ...this.decorateArticle(article),
      provenance: article.provenance ?? null,
      relationProvenance: article.relationProvenance ?? null,
      postScreening: article.postScreening ?? null,
      postDraft,
      related: related ? this.decorateArticle(related) : null,
      publication: await this.repository.publicationState([id]),
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

  publicationPreflight() {
    return publicationPreflight(
      this.repository,
      this.buffer,
      this.clock,
      this.crawlTransport,
    );
  }

  /** Maintenance runs once; its elapsed time counts toward the analysis burst budget. */
  async scheduled(): Promise<void> {
    const started = this.clock();
    await maintainNews(
      this.repository,
      this.publisher,
      this.notifier,
      this.buffer.configured,
      this.clock,
    );
    await this.jobs.run(started);
  }
}
