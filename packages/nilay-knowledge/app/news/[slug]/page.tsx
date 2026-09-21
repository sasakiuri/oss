import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArticleFeedback } from '@/components/article-feedback';
import { Breadcrumb } from '@/components/breadcrumb';
import { ContentStyles } from '@/components/content-styles';
import { ImageZoom } from '@/components/image-zoom';
import { MarkdownContent } from '@/components/markdown-content';
import { SnsShare } from '@/components/sns-share';
import { TitleText } from '@/components/title-text';
import { createContentMetadata } from '@/lib/content/metadata';
import { getContentDocument, getContentSource, listContentSlugs } from '@/lib/content/server';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-static';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await listContentSlugs('news');
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const news = await getContentSource('news', slug);

  if (!news) {
    return { title: 'ニュースが見つかりません' };
  }

  return createContentMetadata(news);
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const news = await getContentDocument('news', slug);

  if (!news) {
    notFound();
  }

  const { frontmatter, html } = news;

  return (
    <>
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: 'ニュース', slug: 'news' },
          { name: frontmatter.title, slug: `news/${slug}` },
        ]}
      />

      <div className="reading-layout mx-auto max-w-3xl px-5 pt-8 pb-12 sm:px-8">
        <article className="reading-article min-w-0">
          <header className="mb-8 border-b border-line pb-8">
            <time dateTime={frontmatter.published} className="text-sm text-subtle">
              {formatDate(frontmatter.published)}
            </time>
            <h1 className="page-title mt-3 [font-feature-settings:palt]">
              <TitleText>{frontmatter.title}</TitleText>
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {frontmatter.tags.map((tag) => (
                <span key={tag} className="text-xs text-subtle">
                  #{tag}
                </span>
              ))}
            </div>
          </header>

          <ContentStyles html={html} />
          <MarkdownContent key={slug} html={html} className="prose max-w-none" />
          <SnsShare printable title={frontmatter.title} slug={`news/${slug}`} />
          <ArticleFeedback type="news" slug={slug} title={frontmatter.title} />
          <Link
            href="/news"
            className="mt-6 inline-flex min-h-11 items-center text-sm text-brand hover:underline print:hidden"
          >
            ニュース一覧へ戻る
          </Link>
        </article>
      </div>

      <ImageZoom key={slug} />
    </>
  );
}
