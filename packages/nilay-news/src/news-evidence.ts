// SPDX-License-Identifier: MIT
import type { Article } from "./domain.ts";
import { citationOnly, type Metadata } from "./sources/types.ts";
import { truncate } from "./text.ts";

export const BODY_LIMIT = 12000;
const BODY_NOTE =
  "本文は記事ページから抽出した最大12000文字の参考情報で、ナビゲーションや他の記事の見出しが混じる場合がある。見出しの主題に対応する部分だけを根拠にする。";
const GAZETTE_NOTE =
  "官報は開始ページ全体の抽出で、別の項目が混在する。見出しの項目に対応する部分だけを根拠にする。";
/** Collection and fetch bookkeeping; none of it describes what the article is about. */
const STATUS_KEYS: ReadonlySet<string> = new Set([
  "contentStatus",
  "publicationPrecision",
  "tocUrl",
]);
/**
 * An explicit related-content marker at a line or bracket boundary. Everything after it
 * belongs to other stories; bare mentions of the words inside a sentence are left alone.
 */
const SIDEBAR =
  /(?<=^|\n|[。　 ])\s*(?:[【［[■▼▽◆◇●○★☆>＞]\s*)?(?:関連記事|関連ニュース|関連リンク|関連ワード|あわせて読みたい|合わせて読みたい|こちらもおすすめ|おすすめ記事|人気記事|アクセスランキング)\s*(?:[】］\]：:>＞]|\s|$)/u;

export interface ModelEvidence {
  title: string | null;
  excerpt: string | null;
  sourceName: string | null;
  publishedAt: string | null;
  metadata: Metadata | null;
  body?: string;
  bodyNote?: string;
}

/** Text before an explicit sidebar marker; unchanged when there is none. */
export function withoutSidebar(text: string): string {
  const match = SIDEBAR.exec(text);
  return match ? text.slice(0, match.index).trim() : text;
}

/**
 * The excerpt as a lead of this article, or null. Keyword-search snippets start mid-text
 * (often inside a neighbouring story) and a roundup citation's excerpt describes the
 * roundup post, so neither is evidence about the linked article.
 */
export function lead(
  excerpt: string | null | undefined,
  cited = false,
): string | null {
  const text = (excerpt ?? "").trim();
  if (!text || cited || /^(?:\.{2,}|…|‥)/u.test(text)) return null;
  return withoutSidebar(text) || null;
}

function isGazette(article: Partial<Article>): boolean {
  return (
    !!article.sourceKey?.startsWith("kanpo:") ||
    !!article.sourceIds?.includes("kanpo")
  );
}

/**
 * The bounded, pure view of an article sent to the model. The stored article is never
 * changed: only noise that is not about this article's topic is left out.
 */
export function modelEvidence(article: Partial<Article>): ModelEvidence {
  const cited = !!article.metadata && citationOnly(article.metadata);
  const metadata = cited
    ? null
    : Object.fromEntries(
        Object.entries(article.metadata ?? {}).filter(
          ([key]) => !STATUS_KEYS.has(key),
        ),
      );
  // The part after `｜` names the collector's search query, not the article's topic.
  const publisher = article.sourceName?.split(/[｜|]/u)[0]?.trim();
  const result: ModelEvidence = {
    title: article.title ?? null,
    excerpt: lead(article.excerpt, cited),
    sourceName: publisher || null,
    publishedAt: article.publishedAt ?? null,
    metadata: metadata && Object.keys(metadata).length ? metadata : null,
  };
  // A body kept from an older successful fetch may describe a different revision.
  const body = article.bodyStale
    ? ""
    : withoutSidebar(truncate(article.body ?? "", BODY_LIMIT)).trim();
  if (body) {
    result.body = body;
    result.bodyNote = isGazette(article) ? GAZETTE_NOTE : BODY_NOTE;
  }
  return result;
}
