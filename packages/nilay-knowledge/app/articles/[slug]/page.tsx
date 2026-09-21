import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArticleNavigation } from '@/components/article-navigation';
import { Breadcrumb } from '@/components/breadcrumb';
import { ContentStyles } from '@/components/content-styles';
import { ImageZoom } from '@/components/image-zoom';
import { MarkdownContent } from '@/components/markdown-content';
import { PrintContent } from '@/components/print-content';
import { SnsShare } from '@/components/sns-share';
import { TableOfContents } from '@/components/table-of-contents';
import { TitleText } from '@/components/title-text';
import { contentImageUrl, createContentMetadata } from '@/lib/content/metadata';
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
        className="max-w-5xl"
        items={[
          { name: 'トップ', slug: '' },
          { name: '記事一覧', slug: 'articles' },
          { name: frontmatter.title, slug: `articles/${slug}` },
        ]}
      />
      <SnsShare title={frontmatter.title} slug={`articles/${slug}`} />

      <div
        className={`reading-layout mx-auto grid max-w-5xl grid-cols-1 gap-4 px-4 py-8 ${tableOfContents.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-8' : ''}`}
      >
        <TableOfContents key={slug} items={tableOfContents} />
        <article className="reading-article min-w-0 overflow-hidden rounded-lg border border-line bg-surface p-5 sm:p-8 lg:col-start-1 lg:row-start-1">
          <header className="mb-10">
            <time dateTime={displayDate} className="text-sm text-subtle">
              {formatDate(displayDate)} 更新
            </time>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-ink [font-feature-settings:palt]">
              <TitleText>{frontmatter.title}</TitleText>
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {frontmatter.tags.map((tag) => (
                <span key={tag} className="rounded bg-muted-strong px-2 py-1 text-sm text-subtle">
                  #{tag}
                </span>
              ))}
            </div>
          </header>

          <ContentStyles html={html} />
          <MarkdownContent key={slug} html={html} className="article-content prose max-w-none" />
          <ArticleNavigation slug={slug} />
        </article>
      </div>

      <ImageZoom key={slug} />
      <PrintContent />
    </>
  );
}
