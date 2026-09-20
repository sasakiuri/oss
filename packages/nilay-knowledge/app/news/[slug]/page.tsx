import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumb } from '@/components/breadcrumb';
import { ImageZoom } from '@/components/image-zoom';
import { SnsShare } from '@/components/sns-share';
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
      <SnsShare title={frontmatter.title} slug={`news/${slug}`} />

      <div className="mx-auto max-w-3xl px-4 py-8">
        <article className="overflow-hidden rounded-lg border border-slate-200 bg-white p-8">
          <header className="mb-8">
            <time dateTime={frontmatter.published} className="text-sm text-slate-500">
              {formatDate(frontmatter.published)}
            </time>
            <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-800 [font-feature-settings:palt]">
              {frontmatter.title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {frontmatter.tags.map((tag) => (
                <span key={tag} className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-600">
                  #{tag}
                </span>
              ))}
            </div>
          </header>

          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>

      <ImageZoom />
    </>
  );
}
