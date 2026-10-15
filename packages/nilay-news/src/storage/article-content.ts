// SPDX-License-Identifier: MIT
import type { Article } from "../domain.ts";
import { NotFoundError } from "../errors.ts";
import { publicationSeconds, publicationWindow } from "../freshness.ts";
import { isSourceCandidate } from "../publishing/policy.ts";
import { citationOnly, type CollectedItem } from "../sources/types.ts";
import { sha256 } from "../text.ts";

import type { SQLStatement } from "./sql.ts";

const DETAIL_KEYS = [
  "body",
  "metadata",
  "attachments",
  "contentError",
] as const;

export const YAHOO_ARTICLE =
  /^https:\/\/news\.yahoo\.co\.jp\/articles\/[a-f0-9]{40}$/;

/** The article ID an identity derives. */
export async function identityKey(identity: string): Promise<string> {
  return (await sha256(identity)).slice(0, 24);
}

/** Identities an item may be stored under: Yahoo articles also had an RSS form. */
export function identityForms(identity: string): string[] {
  return YAHOO_ARTICLE.test(identity)
    ? [identity, `${identity}?source=rss`]
    : [identity];
}

/** Index projections share the publication policy and JavaScript Unicode search normalization. */
export function indexArticle(article: Article): void {
  Object.assign(article, {
    _publicationIndex: 3,
    _listSearch: [
      article.title,
      article.sourceName,
      article.excerpt,
      article.topic,
      article.body,
      JSON.stringify(article.metadata || {}),
      ...(article.attachments || []).map((attachment) => attachment.title),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase(),
    _sourceCandidate: isSourceCandidate(article),
    _listOrder:
      (Date.parse(article.publishedAt || article.discoveredAt) || 0) / 1000,
    _publicationSeconds: publicationSeconds(article.publishedAt),
    _publicationUntil:
      publicationWindow(
        article.publishedAt,
        article.metadata?.publicationPrecision,
      )?.until ?? null,
    _publicationDate:
      article.metadata?.publicationPrecision === "date" &&
      publicationWindow(
        article.publishedAt,
        article.metadata?.publicationPrecision,
      )?.date === true,
  });
}

export function publicArticle(article: Article): Article {
  const copy = { ...article };
  for (const key of Object.keys(copy))
    if (key.startsWith("_")) Reflect.deleteProperty(copy, key);
  return copy;
}

const ANALYSIS_RESET = {
  provenance: null,
  relationProvenance: null,
  postScreening: null,
  topic: null,
  decision: null,
  priority: null,
  reason: null,
  probability: null,
  analysisStatus: "pending",
  analysisError: null,
  relatedArticleId: null,
  relation: null,
  analyzedAt: null,
} as const;

export function resetAnalysis(article: Article): void {
  Object.assign(article, ANALYSIS_RESET);
}

/**
 * `resetAnalysis` of every article in the database, without loading them.
 * Search text keeps a former topic until the article is next written.
 */
export const RESET_ALL_ANALYSES: SQLStatement = [
  `UPDATE news_articles SET data=json_set(data,${Object.keys(ANALYSIS_RESET)
    .map((key) => `'$.${key}',json(?)`)
    .join(",")}) WHERE 1`,
  Object.values(ANALYSIS_RESET).map((value) => JSON.stringify(value)),
];

/** Details make a source the content owner; a roundup citation alone does not. */
export function hasDetails(value: Partial<CollectedItem>): boolean {
  return DETAIL_KEYS.some((key) =>
    key === "metadata"
      ? value.metadata !== undefined &&
        Object.keys(value.metadata).some(
          (name) => name !== "publicationPrecision",
        ) &&
        !citationOnly(value.metadata)
      : value[key] !== undefined,
  );
}

export function isCitation(item: CollectedItem): boolean {
  return (
    item.metadata !== undefined &&
    citationOnly(item.metadata) &&
    !hasDetails(item)
  );
}

export function updateContent(
  article: Article,
  item: CollectedItem,
  now: string,
): void {
  if (item.sourceKey !== undefined) article.sourceKey = item.sourceKey;
  if (item.attachments !== undefined) article.attachments = item.attachments;
  if (item.metadata !== undefined) article.metadata = item.metadata;
  if (item.contentError !== undefined) article.contentError = item.contentError;
  if (item.body)
    Object.assign(article, {
      body: item.body,
      bodyFetchedAt: now,
      bodyStale: false,
    });
  else if (item.contentError && article.body) article.bodyStale = true;
  else if (item.body !== undefined)
    Object.assign(article, { body: item.body, bodyStale: false });
}

export function articleOf(
  articles: Map<string, Article>,
  articleId: string,
): Article {
  const article = articles.get(articleId);
  if (!article) throw new NotFoundError("記事が見つかりません");
  return article;
}
