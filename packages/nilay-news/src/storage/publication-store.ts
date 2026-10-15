// SPDX-License-Identifier: MIT
/** Fenced posting reservations, confirmations, and Buffer quota observations. */
import { GoogleNewsDeferred } from "../collection/google-news-resolver.ts";
import type {
  Article,
  BufferQuota,
  Post,
  PostClaim,
  Publication,
  Settings,
} from "../domain.ts";
import { UserError } from "../errors.ts";
import { evidenceHash } from "../jev/evidence.ts";
import {
  GoogleNewsError,
  isGoogleNewsUrl,
  publisherUrl,
} from "../net/google-news.ts";
import { FetchError } from "../net/http.ts";
import { draft } from "../publishing/draft.ts";
import {
  confirmationDelay,
  CONFIRMATION_MAX_CHECKS,
  CONFIRMATION_TIMEOUT_SECONDS,
  isPostingTime,
  nextPostingAt,
  POST_CLAIM_LEASE_SECONDS,
  POST_INTERVAL_SECONDS,
  UNRESOLVED_POST_STATUSES,
} from "../publishing/policy.ts";
import type { FinishPostOptions, PostScreening } from "../repository.ts";
import { randomToken } from "../text.ts";
import { isoSeconds as timestamp } from "../time.ts";

import { articleOf, publicArticle } from "./article-content.ts";
import type { ArticleReader } from "./article-reader.ts";
import * as posting from "./publication-state.ts";
import type { RecordStore } from "./record-store.ts";
import { decode, encode, numberColumn, textColumn } from "./row-codec.ts";
import type { SQLStatement } from "./sql.ts";
import {
  batchOf,
  closedBatch,
  scheduleOf,
  settingsOf,
  type PublicationBatch,
  type Schedule,
  type StateRows,
} from "./state.ts";
import type { StorageContext } from "./transaction-store.ts";

export class PublicationStore {
  private readonly context: StorageContext;
  private readonly articles: Pick<ArticleReader, "identityOwned" | "postedUrl">;
  private readonly records: Pick<RecordStore, "getRecord">;

  constructor(
    context: StorageContext,
    articles: Pick<ArticleReader, "identityOwned" | "postedUrl">,
    records: Pick<RecordStore, "getRecord">,
  ) {
    this.context = context;
    this.articles = articles;
    this.records = records;
  }

  async publicationState(articleIds?: readonly string[]): Promise<Publication> {
    if (articleIds === undefined) {
      const [, state] = await this.context.transactions.snapshot([
        "state",
        "posts",
      ]);
      return {
        ...posting.publication(state, this.context.clock()),
        quota: await this.records.getRecord<BufferQuota>("buffer", "quota"),
      };
    }
    const [, state] = await this.context.transactions.load(["state"]);
    const result = await this.context.driver.batch([
      [
        "SELECT id,data FROM news_posts WHERE json_extract(data,'$.status')<>'posted' OR id IN (SELECT value FROM json_each(?)) ORDER BY (id IN (SELECT value FROM json_each(?))) DESC,json_extract(data,'$.attempted_at') DESC,id ASC LIMIT 100",
        [encode(articleIds), encode(articleIds)],
      ],
    ]);
    state.posts = new Map(
      (result[0]?.results ?? []).map((row) => [
        textColumn(row, "id"),
        decode<Post>(textColumn(row, "data")),
      ]),
    );
    return {
      ...posting.publication(state, this.context.clock()),
      quota: await this.records.getRecord<BufferQuota>("buffer", "quota"),
    };
  }

  async postCandidates(): Promise<Article[]> {
    const now = this.context.clock();
    const [, state] = await this.context.transactions.snapshot(
      ["state", "posts", "articles"],
      posting.candidateScope(now),
    );
    return posting.candidates(state, now).map(publicArticle);
  }

  async recoverPosts(at?: number): Promise<number> {
    const now = at ?? this.context.clock();
    const found = await this.context.driver.batch([
      [
        "SELECT 1 FROM news_posts WHERE json_extract(data,'$.status')='publishing' AND json_extract(data,'$.claim_expires_at')<=? LIMIT 1",
        [now],
      ],
    ]);
    if (!found[0]?.results.length) return 0;
    return this.context.transactions.mutate(["state", "posts"], (state) =>
      posting.expirePosts(state, now),
    );
  }

  async claimPost(
    now: number,
    resolveUrl?: (url: string) => Promise<string>,
  ): Promise<PostClaim | null> {
    // CAS retries re-read the selection; a successful lookup of the same URL
    // is reused, while each new URL still shares the caller's request budget.
    const resolved = new Map<string, string>();
    await this.recoverPosts(Math.max(now, this.context.clock()));
    // A stale tick timestamp never sends after the posting window closed.
    if (!isPostingTime(Math.max(now, this.context.clock()))) return null;
    // The minute tick normally exits here, without reading any articles or
    // historical posts. The actual reservation still rechecks everything in
    // its atomic mutation, including settings and eligibility changes.
    const gate = await this.context.driver.batch([
      [
        "SELECT id,data FROM news_state WHERE id IN ('settings','schedule')",
        [],
      ],
      ["SELECT id,data FROM news_state WHERE id='publication_batch'", []],
      [
        "SELECT 1 FROM news_posts WHERE json_extract(data,'$.status') IN ('publishing','submitted','unknown','failed') LIMIT 1",
        [],
      ],
    ]);
    const current: StateRows = {};
    for (const row of [
      ...(gate[0]?.results ?? []),
      ...(gate[1]?.results ?? []),
    ]) {
      const id = textColumn(row, "id");
      if (id === "settings")
        current.settings = decode<Settings>(textColumn(row, "data"));
      if (id === "schedule")
        current.schedule = decode<Schedule>(textColumn(row, "data"));
      if (id === "publication_batch")
        current.publication_batch = decode<PublicationBatch>(
          textColumn(row, "data"),
        );
    }
    if (
      !settingsOf(current).autoPost ||
      (scheduleOf(current).next_at > Math.max(now, this.context.clock()) &&
        !batchOf(current).articleIds.length) ||
      gate[2]?.results.length
    )
      return null;
    const scope = posting.candidateScope(Math.max(now, this.context.clock()));
    return this.context.transactions.mutate(
      ["state", "articles", "posts"],
      async (state) => {
        let current = Math.max(now, this.context.clock());
        posting.expirePosts(state, current);
        const settings = settingsOf(state.state);
        const schedule = scheduleOf(state.state);
        // Freshness and the posting window use the later clock, so a stale
        // tick timestamp never selects an aged-out article or sends after 23:00.
        if (!settings.autoPost || !isPostingTime(current)) return null;
        // Posts of a round are sent one at a time: each waits until the
        // previous one is confirmed, and an unresolved one stops the round.
        if (
          [...state.posts.values()].some((post) =>
            UNRESOLVED_POST_STATUSES.has(post.status),
          )
        )
          return null;
        const candidates = posting.candidates(state, current);
        const batch = batchOf(state.state);
        let article: Article | undefined;
        if (batch.articleIds.length) {
          // A round only shrinks: articles no longer eligible now, including
          // aged-out ones after the night, leave it; new arrivals never join.
          const eligible = new Map(candidates.map((item) => [item.id, item]));
          batch.articleIds = batch.articleIds.filter((id) => eligible.has(id));
          article = eligible.get(batch.articleIds[0] ?? "");
          if (!article) state.state.publication_batch = closedBatch();
        }
        if (!article) {
          // A round opens when due with every current candidate; idle ticks
          // reserve nothing, so arriving news opens the next round when due.
          article = candidates[0];
          if (schedule.next_at > current || !article) return null;
          state.state.publication_batch = {
            articleIds: candidates.map((item) => item.id),
            openedAt: current,
          };
          schedule.next_at = nextPostingAt(current + POST_INTERVAL_SECONDS);
        }
        const selectedId = article.id;
        let failure: string | undefined;
        if (resolveUrl && isGoogleNewsUrl(article.url)) {
          const original = article.url;
          try {
            let url = resolved.get(original);
            if (!url) {
              const target = publisherUrl(await resolveUrl(original));
              if (!target)
                throw new GoogleNewsError(
                  "Google News から有効な元記事URLを取得できませんでした",
                );
              resolved.set(original, target);
              url = target;
            }
            article.url = url;
            article.metadata = { ...article.metadata, googleNewsUrl: original };
            // Keep the row ID and manual/analysis decisions. Adopt the publisher
            // identity only when it is not already owned by another article.
            if (
              article._identity === original &&
              !(await this.articles.identityOwned(url, article.id))
            )
              article._identity = url;
          } catch (error) {
            if (error instanceof GoogleNewsDeferred) return null;
            if (
              !(error instanceof GoogleNewsError) &&
              !(error instanceof FetchError)
            )
              throw error;
            failure =
              error instanceof GoogleNewsError
                ? error.message
                : "Google News の元記事URLを取得できませんでした。時間をおいて投稿前の確認をやり直してください";
          }
          // Resolution may cross a time boundary. Changed reviews/settings and
          // competing claims cause the whole mutation to retry from fresh state.
          current = Math.max(now, this.context.clock());
          if (
            !isPostingTime(current) ||
            !posting.eligible(state, article, current)
          )
            return null;
          if (
            !posting
              .candidates(state, current)
              .some((item) => item.id === selectedId) ||
            // A posted alias of the publisher URL may lie outside the scope.
            (!failure &&
              !article.sourceKey &&
              (await this.articles.postedUrl(article.id, article.url)))
          ) {
            const batch = batchOf(state.state);
            batch.articleIds = batch.articleIds.filter(
              (id) => id !== selectedId,
            );
            if (!batch.articleIds.length)
              state.state.publication_batch = closedBatch();
            return null;
          }
        }
        const claimToken = randomToken();
        const post: Post = {
          article_id: article.id,
          status: "publishing",
          text: "",
          // A delayed tick gets a fresh lease, starting when it actually claims.
          attempted_at: timestamp(current),
          claim_token: claimToken,
          claim_expires_at: current + POST_CLAIM_LEASE_SECONDS,
          check_count: 0,
        };
        state.posts.set(article.id, post);
        try {
          if (failure) throw new UserError(failure);
          post.text = draft(article);
        } catch (error) {
          if (!(error instanceof UserError)) throw error;
          Object.assign(post, { status: "failed", error: error.message });
          posting.disablePosting(state.state);
          return null;
        }
        return { articleId: article.id, text: post.text, claimToken };
      },
      scope,
    );
  }

  /**
   * The last check before an unsent claim reaches Buffer. Only this claim's
   * own unexpired `publishing` record may be sent, within the posting window,
   * with automatic posting still enabled, no other post blocking, the article still a candidate
   * under the current settings, review, analysis and freshness, and its
   * current draft identical to the claimed text. When its own live claim is
   * no longer eligible, only that unsent record is withdrawn, so the article
   * is neither failed nor unknown. It stays in its round, which the next
   * claim rechecks. The next round keeps its scheduled hourly start even
   * if all articles in the current round become ineligible.
   * A lost, replaced or expired claim is refused without any change, since
   * another attempt may already be in flight or awaiting confirmation.
   */
  async authorizePostSend(
    articleId: string,
    claimToken: string,
    now: number,
    screening?: PostScreening,
  ): Promise<boolean> {
    return this.context.transactions.mutate(
      ["state", "articles", "posts"],
      async (state) => {
        // Snapshot reads and CAS retries can cross the daily closing time.
        const current = Math.max(now, this.context.clock());
        const post = state.posts.get(articleId);
        if (
          !claimToken ||
          post?.status !== "publishing" ||
          post.claim_token !== claimToken ||
          post.claim_expires_at <= current
        )
          return false;
        const article = state.articles.get(articleId);
        if (
          isPostingTime(current) &&
          settingsOf(state.state).autoPost &&
          ![...state.posts.values()].some(
            (other) =>
              other !== post && UNRESOLVED_POST_STATUSES.has(other.status),
          ) &&
          article &&
          posting.eligible(state, article, current) &&
          !(await this.hasPostedUrl(article)) &&
          (!screening ||
            (screening.permitted &&
              (!screening.approvedAt ||
                (article.reviewStatus === "approved" &&
                  article.reviewedAt === screening.approvedAt)) &&
              (await evidenceHash(article)) === screening.evidenceHash)) &&
          posting.sameDraft(article, post.text)
        )
          return true;
        state.posts.delete(articleId);
        return false;
      },
      [articleId],
    );
  }

  /** A bounded check also catches an alias reviewed as posted during remote checks. */
  private async hasPostedUrl(article: Article): Promise<boolean> {
    return (
      !article.sourceKey && this.articles.postedUrl(article.id, article.url)
    );
  }

  async finishPost(
    articleId: string,
    status: "posted" | "failed" | "unknown",
    options: FinishPostOptions = {},
  ): Promise<void> {
    if (!["posted", "failed", "unknown"].includes(status))
      throw new UserError("投稿結果が不正です");
    const now = options.timestamp ?? this.context.clock();
    await this.context.transactions.mutate(
      ["state", "articles", "posts"],
      (state) =>
        posting.finish(
          state,
          articleId,
          status,
          options.postId ?? null,
          options.error ?? null,
          now,
          options.claimToken,
        ),
      [articleId],
      true,
    );
  }

  async submitPost(
    articleId: string,
    bufferId: string,
    channelId: string,
    now: number,
    claimToken?: string,
  ): Promise<void> {
    await this.context.transactions.mutate(
      ["posts"],
      (state) => {
        const post = posting.requirePost(
          state,
          articleId,
          ["publishing"],
          claimToken,
        );
        Object.assign(post, {
          status: "submitted",
          buffer_id: bufferId,
          channel_id: channelId,
          check_at: now + confirmationDelay(0),
          check_count: 0,
          confirmation_deadline: now + CONFIRMATION_TIMEOUT_SECONDS,
        });
      },
      [articleId],
      true,
    );
  }

  async claimPostCheck(now: number): Promise<Post | null> {
    const found = await this.context.driver.batch([
      [
        "SELECT id FROM news_posts WHERE json_extract(data,'$.status')='submitted' AND json_extract(data,'$.check_at')<=? ORDER BY json_extract(data,'$.check_at'),id ASC LIMIT 1",
        [now],
      ],
    ]);
    const selected = found[0]?.results[0];
    if (!selected) return null;
    const articleId = textColumn(selected, "id");
    // Claiming a check consumes the durable confirmation budget before any network request.
    return this.context.transactions.mutate(
      ["state", "articles", "posts"],
      (state) => {
        const pending = [...state.posts.values()]
          .filter(
            (post) =>
              post.status === "submitted" && (post.check_at ?? Infinity) <= now,
          )
          .sort((a, b) => (a.check_at ?? 0) - (b.check_at ?? 0));
        const post = pending[0];
        if (!post) return null;
        const deadline =
          post.confirmation_deadline ??
          Date.parse(post.attempted_at) / 1000 + CONFIRMATION_TIMEOUT_SECONDS;
        if (post.check_count >= CONFIRMATION_MAX_CHECKS || now >= deadline) {
          posting.finish(
            state,
            post.article_id,
            "unknown",
            null,
            post.error
              ? `Buffer の確認期限または確認回数の上限に達しました。${post.error}`
              : "Buffer の投稿完了を確認できません。Buffer と X を確認してください",
            now,
          );
          return null;
        }
        const token = randomToken();
        const claimed = {
          ...post,
          claim_token: token,
          confirmation_deadline: deadline,
        };
        Object.assign(post, {
          claim_token: token,
          confirmation_deadline: deadline,
          check_at: Math.min(
            deadline,
            now + confirmationDelay(post.check_count + 1),
          ),
          check_count: post.check_count + 1,
        });
        return claimed;
      },
      [articleId],
      true,
    );
  }

  async deferPostCheck(
    articleId: string,
    claimToken: string,
    observation: {
      timestamp: number;
      remoteStatus?: string;
      error?: string | null;
      nextAt?: number;
    },
  ): Promise<void> {
    await this.context.transactions.mutate(
      ["posts"],
      (state) => {
        const post = posting.requirePost(
          state,
          articleId,
          ["submitted"],
          claimToken,
        );
        if (observation.remoteStatus !== undefined) {
          post.remote_status = observation.remoteStatus;
          post.observed_at = observation.timestamp;
        }
        post.error = observation.error ?? null;
        if (observation.nextAt !== undefined) {
          post.check_at = Math.min(
            post.confirmation_deadline ?? Infinity,
            Math.max(post.check_at ?? 0, observation.nextAt),
          );
        }
      },
      [articleId],
      true,
    );
  }

  /** Quota observations do not change business or settings revisions. Older requests cannot replace newer observations. */
  async recordBufferQuota(observation: BufferQuota): Promise<void> {
    const api = {
      observedAt: observation.observedAt,
      requestOrder: observation.requestOrder,
      api: observation.api,
    };
    const writes: SQLStatement[] = [
      [
        "INSERT INTO news_records(namespace,key,data,expires) VALUES ('buffer','quota',?,NULL) " +
          "ON CONFLICT(namespace,key) DO UPDATE SET data=CASE " +
          "WHEN json_type(excluded.data,'$.channel') IS NULL AND json_type(news_records.data,'$.channel')='object' " +
          "THEN json_set(excluded.data,'$.channel',json_extract(news_records.data,'$.channel')) ELSE excluded.data END " +
          "WHERE (json_type(excluded.data,'$.requestOrder')='integer' " +
          "AND COALESCE(json_extract(news_records.data,'$.requestOrder'),0)<=json_extract(excluded.data,'$.requestOrder')) " +
          "OR (json_type(excluded.data,'$.requestOrder') IS NULL AND json_type(news_records.data,'$.requestOrder') IS NULL " +
          "AND json_extract(news_records.data,'$.observedAt')<=?)",
        [encode(api), observation.observedAt],
      ],
    ];
    if (observation.channel) {
      const channel = {
        ...observation.channel,
        requestOrder:
          observation.channel.requestOrder ?? observation.requestOrder,
      };
      writes.push([
        "UPDATE news_records SET data=json_set(data,'$.channel',json(?)) WHERE namespace='buffer' AND key='quota' " +
          "AND ((? IS NOT NULL AND COALESCE(json_extract(data,'$.channel.requestOrder'),0)<=?) " +
          "OR (? IS NULL AND json_type(data,'$.channel.requestOrder') IS NULL " +
          "AND COALESCE(json_extract(data,'$.channel.observedAt'),0)<=?))",
        [
          encode(channel),
          channel.requestOrder ?? null,
          channel.requestOrder ?? null,
          channel.requestOrder ?? null,
          channel.observedAt,
        ],
      ]);
    }
    const [result] = await this.context.driver.batch(writes);
    if (!result) throw new UserError("Buffer の利用回数を記録できません");
  }

  async reserveBufferRequest(): Promise<number> {
    const [result] = await this.context.driver.batch([
      [
        "INSERT INTO news_records(namespace,key,data,expires) VALUES ('buffer','request-order','{\"value\":1}',NULL) " +
          "ON CONFLICT(namespace,key) DO UPDATE SET data=json_set(news_records.data,'$.value',json_extract(news_records.data,'$.value')+1) " +
          "RETURNING json_extract(data,'$.value') AS sequence",
        [],
      ],
    ]);
    return numberColumn(result?.results[0], "sequence");
  }

  async resolvePost(articleId: string, outcome: unknown): Promise<Publication> {
    if (outcome !== "posted" && outcome !== "not_posted" && outcome !== "retry")
      throw new UserError("X で確認した投稿結果を指定してください");
    return this.context.transactions.mutate(
      ["state", "articles", "posts"],
      (state) => {
        const post = posting.requirePost(state, articleId, [
          "unknown",
          "failed",
        ]);
        if (outcome === "retry" && !posting.failedBeforeSend(post))
          throw new UserError(
            "送信前の失敗ではありません。投稿結果を確認してください",
          );
        if (outcome === "posted") {
          Object.assign(post, { status: "posted", error: null });
          Object.assign(articleOf(state.articles, articleId), {
            reviewStatus: "posted",
            reviewedAt: timestamp(this.context.clock()),
          });
        } else {
          state.posts.delete(articleId);
        }
        return posting.publication(state, this.context.clock());
      },
      [articleId],
      true,
    );
  }
}
