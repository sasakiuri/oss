'use client';

// cspell:words nuqs

import { parseAsNativeArrayOf, parseAsString, useQueryStates } from 'nuqs';
import { type ReactNode, useEffect } from 'react';

import { SnsShare } from '@/components/sns-share';
import {
  articleDirectoryHref,
  filterArticles,
  getArticleTags,
  getDirectoryCategories,
  type DirectoryArticle,
} from '@/lib/content/taxonomy';

let hasMountedDirectory = false;

export interface ArticleDirectoryProps {
  articles: DirectoryArticle[];
  entries: Record<string, ReactNode>;
}

export function ArticleDirectory({
  articles,
  entries,
  structuredData,
}: ArticleDirectoryProps & { structuredData?: ReactNode }) {
  const [{ category, tag: tags }, setFilters] = useQueryStates(
    { category: parseAsString.withDefault(''), tag: parseAsNativeArrayOf(parseAsString) },
    { history: 'push', shallow: true, scroll: false },
  );
  const filters = { category, tags };
  const categories = getDirectoryCategories(articles);
  const allTags = getArticleTags(articles);
  const selectedTags = [...new Set(tags)];
  const shownTags = [...new Set([...allTags, ...selectedTags])];
  const filtered = filterArticles(articles, filters);
  const active = Boolean(category || tags.length);
  const knownCategory = categories.some((item) => item.id === category);

  useEffect(() => {
    if (hasMountedDirectory) return;
    const frame = requestAnimationFrame(() => {
      hasMountedDirectory = true;
      // The initial fragment scroll targets the static fallback. Correct it after
      // filtering, once per document, so later mounts preserve history restoration.
      const id = window.location.hash.slice(1);
      if (getDirectoryCategories(articles).some((item) => item.id === id)) {
        document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [articles]);

  function toggleTag(tag: string) {
    void setFilters({ tag: tags.includes(tag) ? tags.filter((value) => value !== tag) : [...tags, tag] });
  }

  return (
    <div className="min-w-0">
      {/* Full-directory markup only describes the unfiltered, visible list. */}
      {!active && structuredData}
      <section aria-labelledby="article-filters" className="border-b border-line pb-6">
        <h2 id="article-filters" className="text-lg font-semibold text-ink">
          記事を絞り込む
        </h2>
        <label className="mt-4 flex flex-wrap items-center gap-3 text-sm text-body">
          カテゴリー
          <select
            value={category}
            onChange={(event) => void setFilters({ category: event.target.value })}
            className="min-h-11 min-w-0 max-w-full rounded-sm border border-line-strong bg-surface px-3 text-sm text-body"
          >
            <option value="">すべてのカテゴリー</option>
            {category && !knownCategory && <option value={category}>不明なカテゴリー（{category}）</option>}
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}（{filterArticles(articles, { category: item.id, tags }).length}件）
              </option>
            ))}
          </select>
        </label>
        <fieldset className="mt-5 min-w-0">
          <legend className="text-sm font-semibold text-body">タグ</legend>
          <p className="mt-1 text-xs leading-6 text-subtle">複数選ぶと、すべてのタグを含む記事に絞り込みます。</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {shownTags.map((tag) => {
              const selected = tags.includes(tag);
              const count = filterArticles(articles, {
                category,
                tags: [...tags.filter((value) => value !== tag), tag],
              }).length;
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={selected}
                  disabled={!selected && count === 0}
                  onClick={() => toggleTag(tag)}
                  className={`min-h-11 max-w-full rounded-sm border px-3 py-2 text-left text-xs [overflow-wrap:anywhere] disabled:opacity-50 ${selected ? 'border-brand bg-selected font-semibold text-brand' : 'border-line text-body hover:border-brand hover:text-brand disabled:hover:border-line disabled:hover:text-body'}`}
                >
                  #{tag} <span className="tabular-nums">{count}件</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        {active && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="min-w-0 text-sm text-body [overflow-wrap:anywhere]">
              選択中：
              {[
                ...(category
                  ? [categories.find((item) => item.id === category)?.title ?? `不明なカテゴリー（${category}）`]
                  : []),
                ...selectedTags.map((tag) => `#${tag}`),
              ].join(' / ')}
            </p>
            <button
              type="button"
              onClick={() => void setFilters({ category: null, tag: null })}
              className="min-h-11 text-sm text-brand underline underline-offset-4"
            >
              絞り込みを解除
            </button>
          </div>
        )}
      </section>
      <p role="status" aria-atomic="true" className="py-5 text-sm text-subtle">
        {articles.length}件中 {filtered.length}件の記事
      </p>
      {filtered.length === 0 && (
        <p className="border border-line bg-muted p-5 text-sm leading-7 text-body">
          条件に一致する記事がありません。タグの選択を外すか、カテゴリーを変更してください。
        </p>
      )}
      <ArticleDirectoryResults articles={filtered} entries={entries} />
      <SnsShare title="記事一覧" slug={articleDirectoryHref(filters).slice(1)} />
    </div>
  );
}

/** Server-rendered fallback retains the full directory when JavaScript is unavailable. */
export function ArticleDirectoryResults({ articles, entries }: ArticleDirectoryProps) {
  return (
    <div className="space-y-8">
      {getDirectoryCategories(articles).map((category) => {
        const matches = articles.filter((article) => article.category.id === category.id);
        return (
          <section key={category.id} aria-labelledby={category.id} className="min-w-0">
            <h2
              id={category.id}
              tabIndex={-1}
              className="flex scroll-mt-[calc(var(--site-header-height)+1.5rem)] items-baseline justify-between gap-3 border-b border-line-strong pb-2 text-lg font-semibold text-ink"
            >
              {category.title}
              <span className="text-xs font-normal text-subtle">{matches.length}件</span>
            </h2>
            <ul>
              {matches.map((article) => (
                <li key={article.slug} className="border-b border-line py-3">
                  {entries[article.slug]}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
