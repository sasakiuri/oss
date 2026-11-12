// SPDX-License-Identifier: MIT
/** Bounded article queries, list snapshots, counts, and comparison retrieval. */
import type { ArticleOrder } from "../article-order.ts";
import type { Article } from "../domain.ts";
import {
  ArticlePageConflictError,
  ArticleReadConflictError,
  NotFoundError,
  UserError,
} from "../errors.ts";
import type {
  ArticleCounts,
  ArticlePage,
  ArticleQuery,
} from "../repository.ts";
import { isInteger } from "../text.ts";
import { DAY_SECONDS, jstDay, JST_OFFSET } from "../time.ts";

import { publicArticle } from "./article-content.ts";
import {
  bucketPredicates,
  eligibleSQL,
  querySQL,
  statsSQL,
} from "./article-query.ts";
import { decode, encode, numberColumn, textColumn } from "./row-codec.ts";
import type { SQLStatement } from "./sql.ts";
import { settingsOf } from "./state.ts";
import type { StorageContext } from "./transaction-store.ts";

/** Days of earlier coverage compared with a new article; retention also covers this window. */
export const RELATION_WINDOW_DAYS = 7;

/** Most comparison candidates read for one article, posted ones first. */
const RELATION_POOL_LIMIT = 2000;

/** Includes the initial read; client snapshots are never retried. */
const READ_ATTEMPTS = 3;

const POSTED_ARTICLE_SQL =
  "(json_extract(a.data,'$.reviewStatus')='posted' OR EXISTS " +
  "(SELECT 1 FROM news_posts p WHERE p.id=a.id AND json_extract(p.data,'$.status')='posted'))";

export class ArticleReader {
  private readonly context: StorageContext;

  constructor(context: StorageContext) {
    this.context = context;
  }

  async articles(limit?: number, offset = 0): Promise<Article[]> {
    if (
      !isInteger(offset) ||
      offset < 0 ||
      (limit !== undefined && (!isInteger(limit) || limit < 0))
    ) {
      throw new UserError("記事の取得範囲が不正です");
    }
    const result = await this.context.driver.batch([
      [
        "SELECT data FROM news_articles ORDER BY json_extract(data,'$.discoveredAt') DESC,rowid DESC LIMIT ? OFFSET ?",
        [limit ?? -1, offset],
      ],
    ]);
    return (result[0]?.results ?? []).map((row) =>
      publicArticle(decode<Article>(textColumn(row, "data"))),
    );
  }

  async article(articleId: string): Promise<Article> {
    const result = await this.context.driver.batch([
      ["SELECT data FROM news_articles WHERE id=?", [articleId]],
    ]);
    const row = result[0]?.results[0];
    if (!row) throw new NotFoundError("記事が見つかりません");
    return publicArticle(decode<Article>(textColumn(row, "data")));
  }

  async articlePage(query: ArticleQuery, now: number): Promise<ArticlePage> {
    for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
      const [revision, state] = await this.context.transactions.snapshot([
        "state",
      ]);
      const settings = settingsOf(state.state);
      const { where, order, values, limit, offset } = querySQL(
        query,
        settings.postSelection,
      );
      const snapshotClock = query.snapshot
        ? Number(query.snapshot.split(":")[1])
        : now;
      if (
        !Number.isFinite(snapshotClock) ||
        snapshotClock > now ||
        now - snapshotClock >= 30
      )
        throw new ArticlePageConflictError();
      const result = await this.context.driver.batch([
        ["SELECT revision FROM news_meta WHERE id=1", []],
        [
          `WITH clock AS (SELECT ? AS now) SELECT count(*) AS total FROM news_articles a,clock WHERE ${where}`,
          [snapshotClock, ...values],
        ],
        [
          `WITH clock AS (SELECT ? AS now), page AS MATERIALIZED (
            SELECT a.id,a.data,CASE WHEN (${eligibleSQL(settings.postSelection)}) THEN 1 ELSE 0 END AS autoPost
            FROM news_articles a,clock WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?
          ) SELECT json_remove(a.data,'$.body','$.attachments','$.metadata','$.provenance','$.relationProvenance','$.postScreening','$._listSearch') AS data,
            json_extract(a.data,'$.metadata.publicationPrecision') AS precision,a.autoPost,
            related.id AS relatedId,json_extract(related.data,'$.title') AS relatedTitle,
            CASE WHEN json_extract(related.data,'$.reviewStatus')='posted' OR EXISTS (
              SELECT 1 FROM news_posts p WHERE p.id=related.id AND json_extract(p.data,'$.status')='posted'
            ) THEN 1 ELSE 0 END AS relatedPosted
            FROM page a LEFT JOIN news_articles related ON related.id=json_extract(a.data,'$.relatedArticleId'),clock ORDER BY ${order}`,
          [snapshotClock, ...values, limit, offset],
        ],
      ]);
      // Never attach a newer revision to predicates built from older settings.
      if (numberColumn(result[0]?.results[0], "revision") !== revision) {
        if (query.snapshot) throw new ArticlePageConflictError();
        continue;
      }
      const snapshot = `${revision}:${snapshotClock}`;
      if (query.snapshot && query.snapshot !== snapshot)
        throw new ArticlePageConflictError();
      return {
        articles: (result[2]?.results ?? []).map((row) => {
          const article = publicArticle(
            decode<Article>(textColumn(row, "data")),
          );
          if (row.precision)
            article.metadata = { publicationPrecision: String(row.precision) };
          return {
            ...article,
            autoPost: numberColumn(row, "autoPost") === 1,
            relatedSummary: row.relatedId
              ? {
                  id: textColumn(row, "relatedId"),
                  title: textColumn(row, "relatedTitle"),
                  posted: numberColumn(row, "relatedPosted") === 1,
                }
              : null,
          };
        }),
        total: numberColumn(result[1]?.results[0], "total"),
        offset,
        limit,
        snapshot,
      };
    }
    throw new ArticlePageConflictError();
  }

  async articleCounts(now: number): Promise<ArticleCounts> {
    for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
      const [revision, state] = await this.context.transactions.snapshot([
        "state",
      ]);
      const settings = settingsOf(state.state);
      const buckets = bucketPredicates(settings.postSelection);
      const predicates = {
        ...statsSQL,
        queued: eligibleSQL(settings.postSelection),
        ...Object.fromEntries(
          Object.entries(buckets).map(([key, value]) => [
            `bucket_${key}`,
            value,
          ]),
        ),
      };
      const result = await this.context.driver.batch([
        ["SELECT revision FROM news_meta WHERE id=1", []],
        [
          `WITH clock AS (SELECT ? AS now) SELECT count(*) AS total,${Object.entries(
            predicates,
          )
            .map(
              ([key, value]) =>
                `COALESCE(sum(CASE WHEN (${value}) THEN 1 ELSE 0 END),0) AS ${key}`,
            )
            .join(",")} FROM news_articles a,clock`,
          [now],
        ],
        [
          "SELECT DISTINCT json_extract(data,'$.topic') AS topic FROM news_articles WHERE json_extract(data,'$.topic') IS NOT NULL AND json_extract(data,'$.topic')<>'' ORDER BY topic LIMIT 100",
          [],
        ],
      ]);
      if (numberColumn(result[0]?.results[0], "revision") !== revision)
        continue;
      const row = result[1]?.results[0];
      return {
        total: numberColumn(row, "total"),
        pending: numberColumn(row, "pending"),
        expired: numberColumn(row, "expired"),
        dateReview: numberColumn(row, "dateReview"),
        queued: numberColumn(row, "queued"),
        topics: (result[2]?.results ?? []).map((row) =>
          textColumn(row, "topic"),
        ),
        buckets: Object.fromEntries(
          Object.keys(buckets).map((key) => [
            key,
            numberColumn(row, `bucket_${key}`),
          ]),
        ),
      };
    }
    throw new ArticlePageConflictError();
  }

  async postedUrl(articleId: string, url: string): Promise<boolean> {
    const result = await this.context.driver.batch([
      [
        "SELECT 1 FROM news_articles a WHERE a.id<>? AND json_extract(a.data,'$.url')=? " +
          "AND COALESCE(json_extract(a.data,'$.sourceKey'),'')='' " +
          "AND (json_extract(a.data,'$.reviewStatus')='posted' OR EXISTS " +
          "(SELECT 1 FROM news_posts p WHERE p.id=a.id)) LIMIT 1",
        [articleId, url],
      ],
    ]);
    return Boolean(result[0]?.results.length);
  }

  /**
   * Whether another article owns an identity. Read inside a mutation, a
   * concurrent change still fails its revision check and is retried.
   */
  async identityOwned(identity: string, articleId: string): Promise<boolean> {
    const result = await this.context.driver.batch([
      [
        "SELECT 1 FROM news_articles WHERE json_extract(data,'$._identity')=? AND id<>? LIMIT 1",
        [identity, articleId],
      ],
    ]);
    return Boolean(result[0]?.results.length);
  }

  /** Posted or currently eligible comparisons, still excluding unrelated unsaved articles. */
  async relationPool(article: Article, now: number): Promise<Article[]> {
    for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
      const [revision, state] = await this.context.transactions.snapshot([
        "state",
      ]);
      const settings = settingsOf(state.state);
      // Source-designated irrelevant articles can be eligible, so keep the old exclusion.
      const condition =
        "NOT (json_extract(a.data,'$.analysisStatus')='done' AND json_extract(a.data,'$.decision')='irrelevant' " +
        "AND json_extract(a.data,'$.reviewStatus') NOT IN ('posted','saved','approved')) " +
        `AND (${POSTED_ARTICLE_SQL} OR (${eligibleSQL(settings.postSelection)}))`;
      const result = await this.context.driver.batch([
        ["SELECT revision FROM news_meta WHERE id=1", []],
        this.recentArticlesQuery(article, condition, now),
      ]);
      if (numberColumn(result[0]?.results[0], "revision") !== revision)
        continue;
      return (result[1]?.results ?? []).map((row) =>
        publicArticle(decode<Article>(textColumn(row, "data"))),
      );
    }
    throw new ArticleReadConflictError();
  }

  /** Posted articles, by review or post record, listed within the preceding week of this one or later. */
  async postedArticles(article: Article): Promise<Article[]> {
    const result = await this.context.driver.batch([
      this.recentArticlesQuery(
        article,
        POSTED_ARTICLE_SQL,
        this.context.clock(),
      ),
    ]);
    return (result[0]?.results ?? []).map((row) =>
      publicArticle(decode<Article>(textColumn(row, "data"))),
    );
  }

  /**
   * Bounded by time and count: posted articles, then earlier ones, newest
   * first; a day of margin covers the string-ordered chronological rule. Fields comparisons
   * never read are left out. The existing ordering and time exception use reviewStatus.
   */
  private recentArticlesQuery(
    article: Article,
    condition: string,
    now: number,
  ): SQLStatement {
    const listed =
      (Date.parse(article.publishedAt || article.discoveredAt) || 0) / 1000;
    const posted = "json_extract(a.data,'$.reviewStatus')='posted'";
    const order = "json_extract(a.data,'$._listOrder')";
    return [
      "WITH clock AS (SELECT ? AS now) " +
        "SELECT json_remove(a.data,'$._listSearch','$.provenance','$.relationProvenance','$.postScreening') AS data " +
        `FROM news_articles a,clock WHERE a.id<>? AND ${order}>=? AND (${order}<=? OR ${posted}) AND ${condition} ` +
        `ORDER BY ${posted} DESC,${order}<=? DESC,${order} DESC,a.id LIMIT ?`,
      [
        now,
        article.id,
        listed - RELATION_WINDOW_DAYS * 86400,
        listed + 86400,
        listed,
        RELATION_POOL_LIMIT,
      ],
    ];
  }

  /** Only ordering fields of existing requested IDs, without article bodies. */
  async articleOrder(articleIds: readonly string[]): Promise<ArticleOrder[]> {
    const result = await this.context.driver.batch([
      [
        "SELECT id,json_extract(data,'$.publishedAt') AS publishedAt,json_extract(data,'$.discoveredAt') AS discoveredAt " +
          "FROM news_articles WHERE id IN (SELECT value FROM json_each(?))",
        [encode(articleIds)],
      ],
    ]);
    return (result[0]?.results ?? []).map((row) => ({
      id: textColumn(row, "id"),
      publishedAt:
        row.publishedAt === null ? null : textColumn(row, "publishedAt"),
      discoveredAt: textColumn(row, "discoveredAt"),
    }));
  }

  /** The listed IDs that still exist. */
  async existingArticleIds(
    articleIds: readonly string[],
  ): Promise<Set<string>> {
    const result = await this.context.driver.batch([
      [
        "SELECT id FROM news_articles WHERE id IN (SELECT value FROM json_each(?))",
        [encode(articleIds)],
      ],
    ]);
    return new Set(
      (result[0]?.results ?? []).map((row) => textColumn(row, "id")),
    );
  }

  /**
   * Fresh articles never classified, or not classified successfully when
   * `failed`, newest publication first. Reads at most the limit; historical
   * and invalid rows never transfer.
   */
  async pendingArticles(
    now: number,
    limit: number,
    failed = false,
  ): Promise<Article[]> {
    const yesterday = jstDay(now) * DAY_SECONDS - JST_OFFSET - DAY_SECONDS;
    const result = await this.context.driver.batch([
      [
        `SELECT data FROM news_articles WHERE json_extract(data,'$.analysisStatus') IN ${failed ? "('pending','error')" : "('pending')"} ` +
          "AND json_extract(data,'$._publicationSeconds') BETWEEN ? AND ? " +
          "AND (json_extract(data,'$._publicationUntil')>? OR " +
          "(json_extract(data,'$._publicationDate')=0 AND json_extract(data,'$._publicationUntil')=?)) " +
          "ORDER BY json_extract(data,'$._publicationSeconds') DESC,json_extract(data,'$.discoveredAt') DESC,id ASC LIMIT ?",
        [yesterday, now, now, now, limit],
      ],
    ]);
    return (result[0]?.results ?? []).map((row) =>
      publicArticle(decode<Article>(textColumn(row, "data"))),
    );
  }
}
