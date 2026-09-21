import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArticleTags } from '@/components/article-tags';
import { Breadcrumb } from '@/components/breadcrumb';
import { JsonLd } from '@/components/json-ld';
import { TitleText } from '@/components/title-text';
import { getArticleCategoryPages } from '@/lib/content/category-pages';
import { listContent } from '@/lib/content/server';
import { createArticleDirectory } from '@/lib/content/taxonomy';
import { createPageMetadata } from '@/lib/metadata';
import { createCollectionSchema } from '@/lib/schema';

export const dynamic = 'force-static';

interface Props {
  params: Promise<{ category: string }>;
}

async function categoryPages() {
  return getArticleCategoryPages(createArticleDirectory(await listContent('articles')));
}

export async function generateStaticParams() {
  return (await categoryPages()).map(({ id }) => ({ category: id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: id } = await params;
  const category = (await categoryPages()).find((item) => item.id === id);
  if (!category) notFound();
  return createPageMetadata(category);
}

export default async function ArticleCategoryPage({ params }: Props) {
  const { category: id } = await params;
  const categories = await categoryPages();
  const category = categories.find((item) => item.id === id);
  if (!category) notFound();

  return (
    <>
      <JsonLd data={createCollectionSchema(category)} />
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: '記事一覧', slug: 'articles' },
          { name: category.title, slug: category.path.slice(1) },
        ]}
      />
      <div className="site-container max-w-3xl pt-6 pb-12 sm:pt-8">
        <header className="border-b border-line pb-8">
          <h1 className="page-title">
            <TitleText>{category.title}</TitleText>
          </h1>
          <p className="mt-4 text-sm leading-7 text-body">{category.description}</p>
          <p className="mt-3 text-sm leading-7 text-subtle">{category.introduction}</p>
        </header>
        <section aria-labelledby="category-articles" className="pt-8">
          <h2 id="category-articles" className="section-title">
            この分野の記事（{category.articles.length}件）
          </h2>
          <ul className="mt-4 divide-y divide-line">
            {category.articles.map((article) => (
              <li key={article.slug} className="py-5">
                <Link href={`/articles/${article.slug}/`} className="group block min-h-11">
                  <h3 className="font-medium leading-7 text-brand underline-offset-4 group-hover:underline">
                    <TitleText>{article.frontmatter.title}</TitleText>
                  </h3>
                </Link>
                {article.description && <p className="mt-2 text-sm leading-7 text-subtle">{article.description}</p>}
                <ArticleTags tags={article.frontmatter.tags} />
              </li>
            ))}
          </ul>
        </section>
        <nav aria-label="ほかの分野を探す" className="mt-8 border-t border-line pt-6">
          <h2 className="section-title">ほかの分野を探す</h2>
          <ul className="mt-3">
            {categories
              .filter((item) => item.id !== id)
              .map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.path}
                    className="inline-flex min-h-11 items-center text-sm text-brand hover:underline"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
          </ul>
          <Link href="/articles/" className="mt-3 inline-flex min-h-11 items-center text-sm text-brand hover:underline">
            すべての記事を見る
          </Link>
        </nav>
      </div>
    </>
  );
}
