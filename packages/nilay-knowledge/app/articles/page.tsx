import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumb } from '@/components/breadcrumb';
import { SnsShare } from '@/components/sns-share';
import { articleCategories } from '@/lib/content/navigation';

export const dynamic = 'force-static';

const title = '記事一覧';
const dir = 'articles';

export const metadata: Metadata = {
  title,
};

export default function ArticlesPage() {
  return (
    <>
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: title, slug: dir },
        ]}
      />
      <SnsShare title={title} slug={dir} />

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {articleCategories.map((category) => (
          <div key={category.title} className="overflow-hidden rounded-lg border border-line bg-surface">
            <h2 className="border-b border-line bg-muted px-4 py-3 text-lg font-bold text-ink">{category.title}</h2>
            <ul className="divide-y divide-line">
              {category.articleList.map((article) => (
                <li key={article.slug}>
                  <Link href={`/${article.slug}`} className="block px-4 py-3 text-brand hover:bg-muted">
                    <span className="font-medium">{article.title}</span>
                    {article.description && <p className="mt-1 text-sm text-subtle">{article.description}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
