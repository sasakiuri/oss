import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumb } from '@/components/breadcrumb';
import { HomeSearchButton } from '@/components/search-dialog';
import { SnsShare } from '@/components/sns-share';
import { TitleText } from '@/components/title-text';
import { articleCategories } from '@/lib/content/navigation';

export const dynamic = 'force-static';
const title = '記事一覧';
export const metadata: Metadata = { title };

export default function ArticlesPage() {
  const categories = [
    ...articleCategories.filter((category) => category.id !== 'news'),
    ...articleCategories.filter((category) => category.id === 'news'),
  ];
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
              免許の取得、各種手続き、射撃と狩猟の基礎知識。分野別に探せます。
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
                  <a
                    href={`#${category.id}`}
                    className="inline-flex min-h-11 items-center justify-between gap-4 text-sm text-body underline-offset-4 hover:text-brand hover:underline lg:w-full lg:px-4"
                  >
                    {category.title}
                    <span aria-hidden="true" className="hidden text-xs text-faint tabular-nums lg:inline">
                      {category.articleList.length}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0 space-y-8">
            {categories.map((category) => (
              <section key={category.id} aria-labelledby={category.id} className="min-w-0">
                <h2
                  id={category.id}
                  tabIndex={-1}
                  className="flex scroll-mt-[calc(var(--site-header-height)+1.5rem)] items-baseline justify-between gap-3 border-b border-line-strong pb-2 text-lg font-semibold text-ink"
                >
                  {category.title}
                  <span className="text-xs font-normal text-subtle">{category.articleList.length}件</span>
                </h2>
                <ul>
                  {category.articleList.map((article) => (
                    <li key={article.slug}>
                      <Link
                        href={`/${article.slug}`}
                        className="group -mx-3 flex min-h-11 items-center px-3 py-3 hover:bg-muted"
                      >
                        <div>
                          <h3 className="font-medium leading-7 text-brand underline-offset-4 group-hover:underline">
                            <TitleText>{article.title}</TitleText>
                          </h3>
                          {article.description && (
                            <p className="mt-1 text-sm leading-6 text-subtle">{article.description}</p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <SnsShare title={title} slug="articles" />
          </div>
        </div>
      </div>
    </>
  );
}
