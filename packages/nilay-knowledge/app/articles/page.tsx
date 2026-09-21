import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { ArticleDirectory, ArticleDirectoryResults } from '@/components/article-directory';
import { ArticleTags } from '@/components/article-tags';
import { Breadcrumb } from '@/components/breadcrumb';
import { HomeSearchButton } from '@/components/search-dialog';
import { TitleText } from '@/components/title-text';
import { listContent } from '@/lib/content/server';
import { articleDirectoryHref, createArticleDirectory, getDirectoryCategories } from '@/lib/content/taxonomy';

const title = '記事一覧';
export const metadata: Metadata = { title, alternates: { canonical: '/articles/' } };

export default async function ArticlesPage() {
  const articles = createArticleDirectory(await listContent('articles'));
  const categories = getDirectoryCategories(articles);
  const entries = Object.fromEntries(
    articles.map((article) => [
      article.slug,
      <div key={article.slug}>
        <Link href={`/articles/${article.slug}/`} className="group block min-h-11 py-2">
          <h3 className="font-medium leading-7 text-brand underline-offset-4 group-hover:underline">
            <TitleText>{article.frontmatter.title}</TitleText>
          </h3>
          {article.description && <p className="mt-1 text-sm leading-6 text-subtle">{article.description}</p>}
        </Link>
        <ArticleTags tags={article.frontmatter.tags} />
      </div>,
    ]),
  );
  return (
    <>
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: title, slug: 'articles' },
        ]}
      />
      <div className="site-container pb-12">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pt-4 pb-8 sm:pt-8">
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="mt-3 text-sm leading-7 text-subtle">
              免許の取得、各種手続き、射撃と狩猟の基礎知識。カテゴリーとタグから探せます。
            </p>
          </div>
          <HomeSearchButton compact />
        </header>
        <div className="grid gap-8 pt-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="記事の分野" className="self-start lg:sticky lg:top-[calc(var(--site-header-height)+2rem)]">
            <h2 className="mb-3 text-sm font-semibold text-body">分野から探す</h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line pb-5 lg:block lg:space-y-1 lg:border-b-0 lg:border-l lg:pb-0">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`${articleDirectoryHref({ category: category.id })}#${category.id}`}
                    className="inline-flex min-h-11 items-center justify-between gap-4 text-sm text-body underline-offset-4 hover:text-brand hover:underline lg:w-full lg:px-4"
                  >
                    {category.title}
                    <span aria-hidden="true" className="hidden text-xs text-faint tabular-nums lg:inline">
                      {articles.filter((article) => article.category.id === category.id).length}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/news/" className="mt-4 inline-flex min-h-11 items-center text-sm text-brand hover:underline">
              銃・射撃・狩猟ニュース
            </Link>
          </nav>
          <div className="min-w-0 space-y-8">
            <Suspense fallback={<ArticleDirectoryResults articles={articles} entries={entries} />}>
              <ArticleDirectory articles={articles} entries={entries} />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  );
}
