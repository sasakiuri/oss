// SPDX-License-Identifier: MIT
// cspell:ignore riflesports gibier
import type { Article } from "./domain.ts";

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
