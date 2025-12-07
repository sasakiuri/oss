import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/breadcrumb';
import { ImageZoom } from '@/components/image-zoom';
import { SnsShare } from '@/components/sns-share';
import { getArticleBySlug, getArticleSlugs, type TocItem } from '@/lib/markdown';
import { formatDate } from '@/lib/utils';
import { siteConfig } from '@/lib/config';
import { createArticleSchema } from '@/lib/schema';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getArticleSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return { title: '記事が見つかりません' };
  }

  // Use custom image if provided, otherwise generate dynamic OGP
  const ogImageUrl = article.frontmatter.image
    ? `${siteConfig.siteUrl}/content/articles/${slug}/${article.frontmatter.image}`
    : `${siteConfig.siteUrl}/api/og/?title=${encodeURIComponent(article.frontmatter.title)}`;

  return {
    title: article.frontmatter.title,
    openGraph: {
      title: article.frontmatter.title,
      type: 'article',
      url: `${siteConfig.siteUrl}/articles/${slug}/`,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      publishedTime: article.frontmatter.published,
      modifiedTime: article.frontmatter.updated,
    },
    twitter: {
      card: 'summary_large_image',
      title: article.frontmatter.title,
      images: [ogImageUrl],
    },
  };
}

function TableOfContents({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="目次"
      className="sticky top-20 hidden w-64 shrink-0 self-start md:block"
    >
      <h2 className="mb-3 text-sm font-bold text-slate-700">目次</h2>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li
            key={item.id}
            style={{ paddingLeft: `${(item.level - 2) * 1}rem` }}
          >
            <a
              href={`#${item.id}`}
              className="block px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const { frontmatter, html, tableOfContents } = article;
  const displayDate = frontmatter.updated || frontmatter.published;
  const image = frontmatter.image
    ? `/content/articles/${slug}/${frontmatter.image}`
    : undefined;

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
      <SnsShare title={frontmatter.title} slug={`articles/${slug}`} />

      <div className="mx-auto flex max-w-5xl gap-8 px-4 py-8">
        <article className="min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white p-8">
          <header className="mb-10">
            <time className="text-sm text-slate-500">
              {formatDate(displayDate)} 更新
            </time>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-800 [font-feature-settings:palt]">
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

        <TableOfContents items={tableOfContents} />
      </div>

      <ImageZoom />
    </>
  );
}
