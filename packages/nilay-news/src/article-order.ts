// SPDX-License-Identifier: MIT
import type { Article } from "./domain.ts";

export type ArticleOrder = Pick<Article, "id" | "publishedAt" | "discoveredAt">;

/** Shared chronological order for analysis work and its earlier comparisons. */
export function chronological(a: ArticleOrder, b: ArticleOrder): number {
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
