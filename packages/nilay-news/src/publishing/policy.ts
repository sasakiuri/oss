// SPDX-License-Identifier: MIT
// cspell:ignore riflesports gibier
import type { Article, PostStatus } from "../domain.ts";
import { JST_OFFSET, DAY_SECONDS } from "../time.ts";

/**
 * Minimum spacing between automatic posting rounds: the first round after
 * enabling, and each round after the previous one opened. A round posts
 * every candidate at its opening, one post per article, one after another.
 * An idle scheduler reserves nothing, so fresh news opens a round as soon as
 * it is due.
 */
export const POST_INTERVAL_SECONDS = 60 * 60;

/** The daily window in which a new automatic post may be sent, 06:00 inclusive. */
export const POST_WINDOW_START_SECONDS = 6 * 60 * 60;
/** The end of the daily window, 23:00 exclusive. */
export const POST_WINDOW_END_SECONDS = 23 * 60 * 60;
/** How the posting window is shown to people. */
export const POST_WINDOW_LABEL = "06:00〜23:00 JST（23:00以降送信なし）";

function secondOfJstDay(at: number): number {
  if (!Number.isFinite(at))
    throw new RangeError("投稿時刻の判定に不正な時刻が渡されました");
  const local = (at + JST_OFFSET) % DAY_SECONDS;
  return local < 0 ? local + DAY_SECONDS : local;
}

/**
 * Whether an automatic post may be sent at `at` (epoch seconds): from 06:00
 * up to, but not including, 23:00 JST. Only sending a new post is limited;
 * confirming an already submitted post is not.
 */
export function isPostingTime(at: number): boolean {
  const second = secondOfJstDay(at);
  return (
    second >= POST_WINDOW_START_SECONDS && second < POST_WINDOW_END_SECONDS
  );
}

/** The earliest time at or after `at` (epoch seconds) when a new automatic post may be sent. */
export function nextPostingAt(at: number): number {
  const second = secondOfJstDay(at);
  if (second < POST_WINDOW_START_SECONDS)
    return at + POST_WINDOW_START_SECONDS - second;
  if (second < POST_WINDOW_END_SECONDS) return at;
  return at + DAY_SECONDS - second + POST_WINDOW_START_SECONDS;
}
/** At most six read-only checks over one hour for an accepted Buffer identity. */
export const CONFIRMATION_MAX_CHECKS = 6;
export const CONFIRMATION_TIMEOUT_SECONDS = 3600;
export const confirmationDelay = (completed: number): number =>
  Math.min(120 * 2 ** completed, 900);

/**
 * Sources whose every article is a post candidate before and regardless of
 * Jev's classification: 日本ライフル射撃協会, 日本クレー射撃協会, and
 * 日本ジビエ振興協会. Matching is by exact source ID, so
 * an article collected from any of them qualifies whatever else collected it.
 */
const SOURCE_CANDIDATE_IDS: ReadonlySet<string> = new Set([
  "riflesports-news",
  "clay-shooting-news",
  "gibier-news",
]);

/** Whether the stored source IDs make the article a source-rule candidate. */
export function isSourceCandidate(
  article: Pick<Article, "sourceIds">,
): boolean {
  return article.sourceIds.some((sourceId) =>
    SOURCE_CANDIDATE_IDS.has(sourceId),
  );
}

/** Post states that keep automatic posting from starting. */
export const UNRESOLVED_POST_STATUSES: ReadonlySet<PostStatus> = new Set([
  "publishing",
  "submitted",
  "unknown",
  "failed",
]);

export function isBlockingRelation(
  relation: string | null | undefined,
): boolean {
  return ["duplicate", "uncertain"].includes(relation ?? "");
}

/** Lease of a post claimed for submission. */
export const POST_CLAIM_LEASE_SECONDS = 600;
