// SPDX-License-Identifier: MIT
/** Article ingestion, review, analysis persistence, and bounded retention. */
import type { Analysis, Article, Post, ReviewStatus } from "../domain.ts";
import { UserError } from "../errors.ts";
import {
  freshness,
  mergePublication,
  publicationSeconds,
} from "../freshness.ts";
import {
  comparisonInputHash,
  evidenceHash,
  evidenceText,
  modelEvidence,
} from "../jev/evidence.ts";
import {
  isBlockingRelation,
  UNRESOLVED_POST_STATUSES,
} from "../publishing/policy.ts";
import type { CollectedItem, SourceConfig } from "../sources/types.ts";
import { length } from "../text.ts";
import { isoSeconds as timestamp } from "../time.ts";

import {
  articleOf,
  hasDetails,
  identityForms,
  identityKey,
  isCitation,
  publicArticle,
  resetAnalysis,
  updateContent,
  YAHOO_ARTICLE,
} from "./article-content.ts";
import { RELATION_WINDOW_DAYS } from "./article-reader.ts";
import { failedBeforeSend } from "./publication-state.ts";
import { encode, textColumn } from "./row-codec.ts";
import type { SQLStatement } from "./sql.ts";
import { settingsOf, type Tables } from "./state.ts";
import type { StorageContext } from "./transaction-store.ts";

const REVIEW_STATUSES: ReadonlySet<unknown> = new Set<ReviewStatus>([
  "unread",
  "saved",
  "approved",
  "dismissed",
  "posted",
]);

/**
 * Days an article with a known publication stays stored. Classification and
 * posting reach publications from yesterday in JST at the earliest and compare
 * them with the preceding week; a day of margin covers work in flight.
 */
const RETENTION_DAYS = RELATION_WINDOW_DAYS + 3;

/** Most articles one pass deletes, keeping each scheduler write short. */
const PRUNE_LIMIT = 200;

function assertReviewAllowed(
  post: Post | undefined,
  discardUnsent = false,
): void {
  if (discardUnsent && failedBeforeSend(post)) return;
  if (post && UNRESOLVED_POST_STATUSES.has(post.status))
    throw new UserError(
      "X の投稿処理中、または結果確認待ちです。投稿結果の確認から操作してください",
    );
}

function reviewArticle(
  state: Pick<Tables, "articles" | "posts">,
  articleId: string,
  status: string,
  reviewedAt: string,
): Article {
  const article = articleOf(state.articles, articleId);
  const post = state.posts.get(articleId);
  const discardUnsent = status === "dismissed" || status === "approved";
  assertReviewAllowed(post, discardUnsent);
  if (
    status === "approved" &&
    (article.reviewStatus === "posted" || post?.status === "posted")
  )
    throw new UserError("投稿済みの記事は承認できません");
  if (discardUnsent && failedBeforeSend(post)) state.posts.delete(articleId);
  Object.assign(article, { reviewStatus: status, reviewedAt });
  return publicArticle(article);
}

export class ArticleStore {
  private readonly context: StorageContext;

  constructor(context: StorageContext) {
    this.context = context;
  }

  async ingest(source: SourceConfig, items: CollectedItem[]): Promise<number> {
    const identityOf = (item: CollectedItem): string =>
      item.sourceKey ? `${source.id}:${item.sourceKey}` : item.url;
    // Only these items' articles, their former Yahoo identities, rows with
    // their new IDs, and articles related to them are read and written.
    const known = items.flatMap((item) => identityForms(identityOf(item)));
    const ids = new Map(
      await Promise.all(
        known.map(
          async (identity) => [identity, await identityKey(identity)] as const,
        ),
      ),
    );
    const matched =
      "json_extract(data,'$._identity') IN (SELECT value FROM json_each(?))";
    const scope = {
      query: [
        `SELECT id,data FROM news_articles WHERE ${matched} OR id IN (SELECT value FROM json_each(?)) ` +
          `OR json_extract(data,'$.relatedArticleId') IN (SELECT id FROM news_articles WHERE ${matched}) ` +
          "OR json_extract(data,'$.relatedArticleId') IN (SELECT value FROM json_each(?))",
        [
          encode(known),
          encode([...ids.values()]),
          encode(known),
          encode([...ids.values()]),
        ],
      ] as const,
    };
    return this.context.transactions.mutate(
      ["articles"],
      async (state) => {
        // Read after the fenced load: a concurrent deletion forces a retry.
        const removed = await this.removedKeys([...ids.values()]);
        const articles = state.articles;
        const identities = new Map(
          [...articles.values()].map((article) => [article._identity, article]),
        );
        const changed = new Set<string>();
        let created = 0;
        for (const item of items) {
          const identity = identityOf(item);
          let article = identities.get(identity);
          if (
            article === undefined &&
            identity === item.url &&
            YAHOO_ARTICLE.test(identity)
          ) {
            article = identities.get(`${identity}?source=rss`);
            identities.delete(`${identity}?source=rss`);
            if (article) {
              article._identity = identity;
              identities.set(identity, article);
            }
          }
          if (article === undefined) {
            // A deleted story never returns, even with a later date.
            if (
              identityForms(identity).some((form) =>
                removed.has(ids.get(form) ?? ""),
              )
            )
              continue;
            // Storage is the final authority: a story already older than the
            // freshness window is never added. Undated, invalid or future
            // times are kept for review but excluded from automation.
            if (
              freshness(
                item.publishedAt,
                this.context.clock(),
                item.metadata?.publicationPrecision,
              ) === "stale"
            )
              continue;
            const now = timestamp(this.context.clock());
            const fresh: Article = {
              id: ids.get(identity) ?? "",
              _identity: identity,
              url: item.url,
              title: item.title,
              excerpt: item.excerpt ?? "",
              sourceName: source.name,
              sourceIds: [source.id],
              publishedAt: item.publishedAt ?? null,
              discoveredAt: now,
              reviewStatus: "unread",
              analysisStatus: "pending",
            };
            updateContent(fresh, item, timestamp(this.context.clock()));
            if (hasDetails(item)) fresh.contentSourceId = source.id;
            resetAnalysis(fresh);
            articles.set(fresh.id, fresh);
            identities.set(identity, fresh);
            created += 1;
            continue;
          }
          const before = evidenceText(article);
          article.url = item.url;
          if (!article.sourceIds.includes(source.id))
            article.sourceIds.push(source.id);
          const details = hasDetails(item);
          let owner = article.contentSourceId;
          if (!owner && hasDetails(article)) owner = article.sourceIds[0];
          // A publisher feed outranks an attribution-only roundup even without
          // a full body. Persist that ownership so later citations cannot undo it.
          // A pinned plain feed still allows actual rich details to enrich it.
          const promote =
            (details && (!owner || !hasDetails(article))) ||
            (!owner && isCitation(article) && !isCitation(item));
          const sameSource =
            promote || source.id === (owner || article.sourceIds[0]);
          if ((details || promote) && sameSource)
            article.contentSourceId = source.id;
          if (promote) article.sourceName = source.name;
          if (
            sameSource ||
            (!isCitation(item) &&
              length(item.excerpt ?? "") > length(article.excerpt))
          )
            article.excerpt = item.excerpt ?? "";
          if (sameSource) article.title = item.title;
          // Never later than a valid time already known: an update timestamp or
          // re-listing must not revive a historical article.
          const published = mergePublication(
            article.publishedAt,
            item.publishedAt,
            sameSource,
            article.metadata?.publicationPrecision,
            item.metadata?.publicationPrecision,
          );
          const selectedTime = publicationSeconds(published);
          const observations = [article, item].filter(
            (observation) =>
              selectedTime !== null &&
              publicationSeconds(observation.publishedAt) === selectedTime,
          );
          const dateOnly =
            observations.length > 0 &&
            observations.every(
              (observation) =>
                observation.metadata?.publicationPrecision === "date",
            );
          if (published !== (article.publishedAt ?? null))
            article.publishedAt = published;
          if (sameSource)
            updateContent(article, item, timestamp(this.context.clock()));
          // Metadata belongs to the selected publication time, even when other
          // content is refreshed by a later or less precise observation.
          if (dateOnly)
            article.metadata = {
              ...article.metadata,
              publicationPrecision: "date",
            };
          else if (article.metadata?.publicationPrecision !== undefined) {
            article.metadata = { ...article.metadata };
            delete article.metadata.publicationPrecision;
          }
          if (before !== evidenceText(article)) {
            if (article.reviewStatus === "approved") {
              article.reviewStatus = "unread";
              delete article.reviewedAt;
            }
            resetAnalysis(article);
            changed.add(article.id);
          }
        }
        for (const article of articles.values()) {
          if (article.relatedArticleId && changed.has(article.relatedArticleId))
            resetAnalysis(article);
        }
        return created;
      },
      scope,
    );
  }

  async review(articleId: string, status: unknown): Promise<Article> {
    if (typeof status !== "string" || !REVIEW_STATUSES.has(status))
      throw new UserError("記事の状態が不正です");
    return this.context.transactions.mutate(
      ["articles", "posts"],
      (state) =>
        reviewArticle(
          state,
          articleId,
          status,
          timestamp(this.context.clock()),
        ),
      [articleId],
      true,
    );
  }

  async dismiss(articleIds: unknown): Promise<Article[]> {
    return this.reviewMany(articleIds, "dismissed");
  }

  async reviewMany(articleIds: unknown, status: unknown): Promise<Article[]> {
    if (
      typeof status !== "string" ||
      !["unread", "saved", "approved", "dismissed"].includes(status)
    )
      throw new UserError("一括操作の種類が不正です");
    if (
      !Array.isArray(articleIds) ||
      !articleIds.length ||
      !articleIds.every(
        (id): id is string =>
          typeof id === "string" && /^[a-f0-9]{24}$/.test(id),
      )
    )
      throw new UserError("操作する記事を選択してください");
    const ids = [...new Set(articleIds)];
    return this.context.transactions.mutate(
      ["articles", "posts"],
      (state) => {
        const reviewedAt = timestamp(this.context.clock());
        return ids.map((id) => {
          const article = articleOf(state.articles, id);
          if (
            article.reviewStatus === "posted" ||
            state.posts.get(id)?.status === "posted"
          )
            throw new UserError(
              "投稿済みの記事はまとめて変更できません。一覧を更新してください",
            );
          return reviewArticle(state, id, status, reviewedAt);
        });
      },
      ids,
      true,
    );
  }

  /**
   * Deletes, oldest first, up to `PRUNE_LIMIT` articles listed before the
   * retention period together with their post records, and keeps the keys
   * their identities derive so collection never adds them again. Articles
   * with an unknown, malformed or future publication stay for review, and an
   * article awaiting a posting result still needs its record.
   */
  async pruneArticles(at?: number): Promise<number> {
    const cutoff = (at ?? this.context.clock()) - RETENTION_DAYS * 86400;
    return this.context.transactions.mutate([], async (_state, statements) => {
      const result = await this.context.driver.batch([
        [
          "SELECT a.id,json_extract(a.data,'$._identity') AS identity FROM news_articles a " +
            "WHERE json_extract(a.data,'$._listOrder')<? " +
            "AND json_extract(a.data,'$._publicationSeconds')<? AND NOT EXISTS " +
            "(SELECT 1 FROM news_posts p WHERE p.id=a.id AND json_extract(p.data,'$.status')<>'posted') " +
            "ORDER BY json_extract(a.data,'$._listOrder') LIMIT ?",
          [cutoff, cutoff, PRUNE_LIMIT],
        ],
      ]);
      const rows = result[0]?.results ?? [];
      if (!rows.length) return 0;
      const ids = rows.map((row) => textColumn(row, "id"));
      // A row ID can predate its identity: an adopted publisher URL or Yahoo form.
      const keys = new Set(ids);
      for (const row of rows)
        keys.add(await identityKey(textColumn(row, "identity")));
      statements.push(
        [
          "INSERT OR IGNORE INTO news_removed_articles(id) SELECT value FROM json_each(?) WHERE 1",
          [encode([...keys])],
        ],
        ...["posts", "articles"].map((table): SQLStatement => [
          `DELETE FROM news_${table} WHERE id IN (SELECT value FROM json_each(?))`,
          [encode(ids)],
        ]),
      );
      return ids.length;
    });
  }

  /** The listed keys of deleted articles. */
  private async removedKeys(keys: readonly string[]): Promise<Set<string>> {
    const result = await this.context.driver.batch([
      [
        "SELECT id FROM news_removed_articles WHERE id IN (SELECT value FROM json_each(?))",
        [encode(keys)],
      ],
    ]);
    return new Set(
      (result[0]?.results ?? []).map((row) => textColumn(row, "id")),
    );
  }

  async analyzeResult(
    articleId: string,
    expectedEvidenceHash: string,
    rubric: string,
    result: Analysis,
    relationHash?: string | null,
    purpose: "analysis" | "post-screening" = "analysis",
  ): Promise<boolean> {
    // The target and at most the configured comparison limit are read.
    const selected = [
      ...new Set([
        articleId,
        ...(result.relatedArticleId ? [result.relatedArticleId] : []),
        ...(result.relationProvenance ?? []).flatMap((provenance) =>
          provenance.comparisonArticleId
            ? [provenance.comparisonArticleId]
            : [],
        ),
      ]),
    ];
    return this.context.transactions.mutate(
      ["state", "articles"],
      async (state) => {
        const article = articleOf(state.articles, articleId);
        if (
          (await evidenceHash(article)) !== expectedEvidenceHash ||
          settingsOf(state.state).rubric !== rubric
        )
          return false;
        for (const provenance of result.relationProvenance ?? []) {
          const other = provenance.comparisonArticleId
            ? state.articles.get(provenance.comparisonArticleId)
            : undefined;
          if (
            !other ||
            (await comparisonInputHash(modelEvidence(other))) !==
              provenance.comparisonInputHash
          )
            return false;
        }
        if (
          result.relatedArticleId &&
          relationHash !== undefined &&
          relationHash !== null
        ) {
          const target = state.articles.get(result.relatedArticleId);
          if (!target || (await evidenceHash(target)) !== relationHash)
            return false;
        }
        if (purpose === "post-screening") {
          article.postScreening = {
            relatedArticleId: result.relatedArticleId ?? null,
            relation: result.relation ?? null,
            relationProvenance: structuredClone(
              result.relationProvenance ?? [],
            ),
            checkedAt: timestamp(this.context.clock()),
          };
          if (isBlockingRelation(result.relation))
            Object.assign(article, {
              relatedArticleId: result.relatedArticleId,
              relation: result.relation,
              relationProvenance: structuredClone(
                result.relationProvenance ?? [],
              ),
            });
        } else {
          Object.assign(article, structuredClone(result), {
            analyzedAt: timestamp(this.context.clock()),
          });
        }
        return true;
      },
      selected,
    );
  }
}
