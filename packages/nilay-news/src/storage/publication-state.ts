// SPDX-License-Identifier: MIT
/** Pure posting eligibility, round transitions, and public projections. */
import type { Article, Post, PostStatus, Publication } from "../domain.ts";
import { UserError } from "../errors.ts";
import { isFreshPublication, newestFirst } from "../freshness.ts";
import { draft } from "../publishing/draft.ts";
import {
  isBlockingRelation,
  isPostingTime,
  isSourceCandidate,
  nextPostingAt,
} from "../publishing/policy.ts";
import { isoSeconds as timestamp } from "../time.ts";

import { articleOf } from "./article-content.ts";
import { byKey } from "./row-codec.ts";
import {
  batchOf,
  closedBatch,
  scheduleOf,
  settingsOf,
  type ArticleScope,
  type StateRows,
  type Tables,
} from "./state.ts";

/** Empty failed drafts never reached Buffer, including records from older versions. */
export function failedBeforeSend(post: Post | undefined): boolean {
  return (
    !!post &&
    post.status === "failed" &&
    post.text === "" &&
    !post.buffer_id &&
    !post.channel_id &&
    !post.post_id
  );
}

/** Automatic posting stops; an open round is never resumed by enabling it again. */
export function disablePosting(state: StateRows): void {
  settingsOf(state).autoPost = false;
  state.publication_batch = closedBatch();
}

/**
 * `nextAt` is the earliest time a new post may be sent: the stored start of
 * the next round, moved to the next posting window when it, or a past due
 * time seen now, falls outside the window. While a round is open, its
 * remaining articles are due now, or when the posting window next opens.
 */
export function publication(
  state: Pick<Tables, "state" | "posts">,
  now: number,
): Publication {
  const posts = [...state.posts.values()].sort((a, b) =>
    byKey(b.attempted_at, a.attempted_at),
  );
  const due = scheduleOf(state.state).next_at;
  const earliest = Math.max(due, now);
  return {
    nextAt: state.state.publication_batch?.articleIds.length
      ? nextPostingAt(now)
      : isPostingTime(earliest)
        ? due
        : nextPostingAt(earliest),
    posts: posts.map((row) => ({
      articleId: row.article_id,
      status: row.status,
      text: row.text,
      attemptedAt: row.attempted_at,
      postId: row.post_id ?? null,
      bufferId: row.buffer_id ?? null,
      error: row.error ?? null,
      failedBeforeSend: failedBeforeSend(row),
      nextCheckAt: row.status === "submitted" ? (row.check_at ?? null) : null,
      lastObservedAt: row.observed_at ?? null,
      remoteStatus: row.remote_status ?? null,
    })),
  };
}

/**
 * Whether `article` is an automatic post candidate at `now` under the
 * current settings, ignoring its post record. Every mode, including saved
 * and source-rule articles, requires a fresh publication time; older,
 * undated and future articles stay only for manual review.
 */
export function eligible(
  state: Pick<Tables, "state">,
  article: Article,
  now: number,
): boolean {
  const selection = settingsOf(state.state).postSelection;
  // A source-rule candidate ignores Jev entirely, including a duplicate
  // relation; the manual review and the post record still apply.
  const source = isSourceCandidate(article);
  const approved = article.reviewStatus === "approved";
  return (
    isFreshPublication(
      article.publishedAt,
      now,
      article.metadata?.publicationPrecision,
    ) &&
    article.reviewStatus !== "posted" &&
    article.reviewStatus !== "dismissed" &&
    (approved || source || !isBlockingRelation(article.relation)) &&
    (approved ||
      (selection !== "candidates" && article.reviewStatus === "saved") ||
      (selection !== "saved" &&
        (source ||
          (article.analysisStatus === "done" &&
            article.decision === "candidate"))))
  );
}

/** Automatic post candidates at `now` without a post record, newest publication first. */
export function candidates(
  state: Pick<Tables, "state" | "posts" | "articles">,
  now: number,
): Article[] {
  // A repaired legacy ID and a recollected publisher ID may coexist. Do not
  // merge their reviews/history, but never post the same URL twice for articles without source keys.
  // Explicit source keys can represent distinct notices on a shared page.
  const usedUrls = new Set(
    [...state.articles.values()]
      .filter(
        (article) =>
          !article.sourceKey &&
          (state.posts.has(article.id) || article.reviewStatus === "posted"),
      )
      .map((article) => article.url),
  );
  return [...state.articles.values()]
    .filter(
      (article) =>
        !state.posts.has(article.id) &&
        (Boolean(article.sourceKey) || !usedUrls.has(article.url)) &&
        eligible(state, article, now),
    )
    .sort(newestFirst);
}

/**
 * Articles that may be post candidates at `now`: those whose publication
 * window ends no earlier than an hour before, a margin for a later clock,
 * plus every article sharing their URL so a posted alias still blocks a
 * repeat. The candidate rules themselves apply afterwards.
 */
export function candidateScope(now: number): ArticleScope {
  const open = "json_extract(data,'$._publicationUntil')>=?";
  return {
    query: [
      `SELECT id,data FROM news_articles WHERE ${open} OR (COALESCE(json_extract(data,'$.sourceKey'),'')='' ` +
        `AND json_extract(data,'$.url') IN (SELECT json_extract(data,'$.url') FROM news_articles WHERE ${open}))`,
      [now - 3600, now - 3600],
    ],
  };
}

export function expirePosts(
  state: Pick<Tables, "state" | "posts">,
  now: number,
): number {
  let expired = 0;
  for (const post of state.posts.values()) {
    if (post.status === "publishing" && post.claim_expires_at <= now) {
      Object.assign(post, {
        status: "unknown",
        error:
          "送信中に処理が停止しました。Buffer と X の投稿結果を確認してください",
      });
      expired += 1;
    }
  }
  if (expired) disablePosting(state.state);
  return expired;
}

/** Whether the article still drafts exactly the claimed text. */
export function sameDraft(article: Article, text: string): boolean {
  try {
    return draft(article) === text;
  } catch (error) {
    if (error instanceof UserError) return false;
    throw error;
  }
}

export function requirePost(
  state: Pick<Tables, "posts">,
  articleId: string,
  statuses: readonly PostStatus[],
  claimToken?: string,
): Post {
  const post = state.posts.get(articleId);
  if (
    !post ||
    !statuses.includes(post.status) ||
    (claimToken !== undefined && post.claim_token !== claimToken)
  ) {
    throw new UserError("投稿処理の状態が変わりました");
  }
  return post;
}

export function finish(
  state: Pick<Tables, "state" | "articles" | "posts">,
  articleId: string,
  status: "posted" | "failed" | "unknown",
  postId: string | null,
  error: string | null,
  now: number,
  claimToken?: string,
): void {
  const post = requirePost(
    state,
    articleId,
    ["publishing", "submitted"],
    claimToken,
  );
  Object.assign(post, { status, post_id: postId, error });
  if (status === "posted") {
    // The round, not each post, holds the next one back: the rest of the
    // round follows as soon as this post is confirmed.
    const batch = batchOf(state.state);
    batch.articleIds = batch.articleIds.filter((id) => id !== articleId);
    if (!batch.articleIds.length) state.state.publication_batch = closedBatch();
    Object.assign(articleOf(state.articles, articleId), {
      reviewStatus: "posted",
      reviewedAt: timestamp(now),
    });
  } else {
    disablePosting(state.state);
  }
}
