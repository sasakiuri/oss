import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/breadcrumb';
import { ImageZoom } from '@/components/image-zoom';
import { SnsShare } from '@/components/sns-share';
import { getNewsBySlug, getNewsSlugs } from '@/lib/markdown';
import { formatDate } from '@/lib/utils';
import { siteConfig } from '@/lib/config';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getNewsSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const news = await getNewsBySlug(slug);

  if (!news) {
    return { title: 'ニュースが見つかりません' };
  }

  const ogImageUrl = `${siteConfig.siteUrl}/api/og/?title=${encodeURIComponent(news.frontmatter.title)}`;

  return {
    title: news.frontmatter.title,
    openGraph: {
      title: news.frontmatter.title,
      type: 'article',
      url: `${siteConfig.siteUrl}/news/${slug}/`,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      publishedTime: news.frontmatter.published,
    },
    twitter: {
      card: 'summary_large_image',
      title: news.frontmatter.title,
      images: [ogImageUrl],
    },
  };
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const news = await getNewsBySlug(slug);

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
            <time className="text-sm text-slate-500">
              {formatDate(frontmatter.published)}
            </time>
            <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-800 [font-feature-settings:palt]">
              {frontmatter.title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {frontmatter.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-600"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </header>

          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>
      </div>

      <ImageZoom />
    </>
  );
}
