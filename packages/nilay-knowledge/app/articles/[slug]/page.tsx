import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArticleFeedback } from '@/components/article-feedback';
import { ArticleNavigation } from '@/components/article-navigation';
import { Breadcrumb } from '@/components/breadcrumb';
import { ContentStyles } from '@/components/content-styles';
import { ImageZoom } from '@/components/image-zoom';
import { MarkdownContent } from '@/components/markdown-content';
import { SnsShare } from '@/components/sns-share';
import { TableOfContents } from '@/components/table-of-contents';
import { TitleText } from '@/components/title-text';
import { contentImageUrl, createContentMetadata } from '@/lib/content/metadata';
import { articleCategories } from '@/lib/content/navigation';
import { getContentDocument, getContentSource, listContentSlugs } from '@/lib/content/server';
import { createArticleSchema } from '@/lib/schema';
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

function ArticleSchemaScript({
  title,
  description,
  published,
  updated,
  slug,
  image,
}: {
  title: string;
  description: string;
  published: string;
  updated?: string;
  slug: string;
  image?: string;
}) {
  const jsonLd = createArticleSchema({
    title,
    description,
    published,
    updated,
    slug,
    image,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />
  );
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getContentDocument('articles', slug);

  if (!article) {
    notFound();
  }

  const { frontmatter, html, tableOfContents } = article;
  const category = articleCategories.find((item) =>
    item.articleList.some((entry) => entry.slug === `articles/${slug}`),
  );
  const displayDate = frontmatter.updated || frontmatter.published;
  const image = contentImageUrl(article);

  return (
    <>
      <ArticleSchemaScript
        title={frontmatter.title}
        description={article.content.slice(0, 160)}
        published={frontmatter.published}
        updated={frontmatter.updated}
        slug={slug}
        image={image}
      />
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: '記事一覧', slug: 'articles' },
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
                href={`/articles#${category.id}`}
                className="mb-3 inline-flex min-h-8 items-center text-sm text-brand hover:underline"
              >
                {category.title}
              </Link>
            )}
            <h1 className="page-title [font-feature-settings:palt]">
              <TitleText>{frontmatter.title}</TitleText>
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <time dateTime={displayDate} className="text-sm text-subtle">
                {formatDate(displayDate)} {frontmatter.updated ? '更新' : '公開'}
              </time>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {frontmatter.tags.map((tag) => (
                  <span key={tag} className="text-xs text-subtle">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </header>

          <ContentStyles html={html} />
          <MarkdownContent key={slug} html={html} className="article-content prose max-w-none" />
          <SnsShare printable title={frontmatter.title} slug={`articles/${slug}`} />
          <ArticleFeedback type="articles" slug={slug} title={frontmatter.title} />
          <ArticleNavigation slug={slug} />
        </article>
      </div>

      <ImageZoom key={slug} />
    </>
  );
}
