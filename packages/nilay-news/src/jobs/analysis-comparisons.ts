// SPDX-License-Identifier: MIT
/** Resolve uncertain links only after the lexical comparison shortlist is fixed. */
import type { Article } from "../domain.ts";
import { NotFoundError } from "../errors.ts";

/** Share at most six primary-key reads to bound database work across the three comparisons. */
const EXTRA_READ_LIMIT = 6;
/** Bound even entirely cached chains to 32 links per selected comparison. */
const LINK_LIMIT = 32;

export function analysisComparisons(
  target: Article,
  pool: readonly Article[],
  read: (id: string) => Promise<Article>,
  signal: AbortSignal,
) {
  const articles = new Map<string, Article | null>(
    pool.map((article) => [article.id, article]),
  );
  let reads = 0;
  async function load(id: string): Promise<Article | null> {
    signal.throwIfAborted();
    if (id === target.id) return null;
    if (articles.has(id)) return articles.get(id)!;
    if (reads === EXTRA_READ_LIMIT) return null;
    reads++;
    try {
      const article = await read(id);
      articles.set(id, article);
      return article;
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      articles.set(id, null);
      return null;
    }
  }
  return {
    get: (id: string) => articles.get(id),
    async resolve(candidate: Article): Promise<Article> {
      let comparison = candidate;
      let current = candidate;
      const visited = new Set<string>([target.id]);
      for (let links = 0; ; links++) {
        signal.throwIfAborted();
        // An incomplete path keeps the original lexical match, even after a redirect.
        if (visited.has(current.id)) return candidate;
        visited.add(current.id);
        // Preserve posted shortlist slots and explicit publication approval.
        if (
          // Location guards stop this article, not future lexical comparisons.
          // Keep any earlier uncertain replacement and spend no extra read.
          current.relationRoute === "location" ||
          current.reviewStatus === "posted" ||
          current.reviewStatus === "approved" ||
          (current.relation !== "duplicate" && current.relation !== "uncertain")
        )
          return comparison;
        if (links === LINK_LIMIT || !current.relatedArticleId) return candidate;
        const next = await load(current.relatedArticleId);
        if (!next) return candidate;
        if (current.relation === "uncertain") comparison = next;
        current = next;
      }
    },
  };
}
