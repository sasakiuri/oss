// cspell:words palt
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArticleFeedback } from '@/components/article-feedback';
import { ArticleNavigation } from '@/components/article-navigation';
import { ArticleTags } from '@/components/article-tags';
import { Breadcrumb } from '@/components/breadcrumb';
import { ContentReview } from '@/components/content-review';
import { ContentStyles } from '@/components/content-styles';
import { ImageZoom } from '@/components/image-zoom';
import { JsonLd } from '@/components/json-ld';
import { MarkdownContent } from '@/components/markdown-content';
import { SnsShare } from '@/components/sns-share';
import { TableOfContents } from '@/components/table-of-contents';
import { TitleText } from '@/components/title-text';
import { siteConfig } from '@/lib/config';
import { articleCategoryHref, getArticleCategoryPages } from '@/lib/content/category-pages';
import { createContentMetadata } from '@/lib/content/metadata';
import { getContentDocument, getContentSource, listContent, listContentSlugs } from '@/lib/content/server';
import { createArticleDirectory, getArticleCategory, getRelatedArticles } from '@/lib/content/taxonomy';
import { createContentSchema } from '@/lib/schema';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-static';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await listContentSlugs('articles');
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getContentSource('articles', slug);

  if (!article) {
    return { title: '記事が見つかりません' };
  }

  return createContentMetadata(article);
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getContentDocument('articles', slug);

  if (!article) {
    notFound();
  }

  const { frontmatter, html, tableOfContents } = article;
  const category = getArticleCategory(article);
  const articles = createArticleDirectory(await listContent('articles'));
  const relatedArticles = getRelatedArticles(articles, slug);
  const categoryPage = getArticleCategoryPages(articles).find((item) => item.id === category.id);

  return (
    <>
      <JsonLd data={createContentSchema(article)} />
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: '記事一覧', slug: 'articles' },
          ...(categoryPage ? [{ name: category.title, slug: categoryPage.path.slice(1) }] : []),
          { name: frontmatter.title, slug: `articles/${slug}` },
        ]}
      />

      <div
        className={`reading-layout site-container grid grid-cols-1 gap-6 pt-6 pb-12 ${tableOfContents.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-20' : ''}`}
      >
        <TableOfContents key={slug} items={tableOfContents} />
        <article className="reading-article min-w-0 lg:col-start-1 lg:row-start-1">
          <header className="mb-8 border-b border-line pb-8">
            {category && (
              <Link
                href={articleCategoryHref(articles, category.id)}
                className="mb-3 inline-flex min-h-8 items-center text-sm text-brand hover:underline"
              >
                {category.title}
              </Link>
            )}
            <h1 className="page-title [font-feature-settings:palt]">
              <TitleText>{frontmatter.title}</TitleText>
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <time dateTime={frontmatter.published} className="text-sm text-subtle">
                {formatDate(frontmatter.published)} 公開
              </time>
              {frontmatter.updated && (
                <time dateTime={frontmatter.updated} className="text-sm text-subtle">
                  {formatDate(frontmatter.updated)} 更新
                </time>
              )}
              <Link href="/about/" rel="author" className="text-sm text-brand hover:underline">
                {siteConfig.author.name}
              </Link>
              <ArticleTags tags={frontmatter.tags} />
            </div>
            <ContentReview review={frontmatter.review} />
          </header>

          <ContentStyles html={html} />
          <MarkdownContent key={slug} html={html} className="article-content prose max-w-none" />
          <SnsShare printable title={frontmatter.title} slug={`articles/${slug}`} />
          <ArticleFeedback type="articles" slug={slug} title={frontmatter.title} />
          {relatedArticles.length > 0 && (
            <aside aria-labelledby="related-articles" className="mt-8 border-t border-line pt-6 print:hidden">
              <h2 id="related-articles" className="text-lg font-semibold text-ink">
                関連記事
              </h2>
              <p className="mt-2 text-sm text-subtle">共通のタグや同じカテゴリーの記事を紹介します。</p>
              <ul className="mt-3 divide-y divide-line">
                {relatedArticles.map((related) => (
                  <li key={related.slug} className="py-3">
                    <Link
                      href={`/articles/${related.slug}/`}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
                    >
                      <TitleText>{related.frontmatter.title}</TitleText>
                    </Link>
                    <ArticleTags tags={related.frontmatter.tags} />
                  </li>
                ))}
              </ul>
            </aside>
          )}
          <ArticleNavigation slug={slug} />
        </article>
      </div>

      <ImageZoom key={slug} />
    </>
  );
}
