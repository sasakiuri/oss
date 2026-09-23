import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { JsonLd } from '@/components/json-ld';
import { NewsDetailClient } from '@/features/news/components/news-detail';
import { newsRepository } from '@/features/news/server/repository';
import { logger } from '@/lib/logging';
import { newsArticleJsonLd, pageMetadata } from '@/lib/seo';
import { stripHtmlTags, truncate } from '@/lib/utils/html';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * The article for the page's metadata and structured data. The body is still fetched in the
 * browser. When microCMS cannot be reached the error is logged and the page is served with a
 * generic title and `noindex`, so an outage is never indexed under the article's URL.
 */
const loadNews = cache(async (id: string) => {
  try {
    return { news: await newsRepository.find(id) };
  } catch (error) {
    logger.error('Failed to load news metadata', error instanceof Error ? error : undefined, {
      newsId: id,
      detail: String(error),
    });
    return { news: undefined };
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { news } = await loadNews(id);
  const path = `/news/${encodeURIComponent(id)}`;
  if (news === null) return { title: 'お知らせが見つかりません', robots: { index: false } };
  if (news === undefined) return { title: 'お知らせ', robots: { index: false } };
  const summary = stripHtmlTags(news.summary).replace(/\s+/g, ' ').trim();
  return pageMetadata({
    title: news.title,
    description: summary ? truncate(summary, 120) : news.title,
    path,
    type: 'article',
    publishedTime: news.date.toISOString(),
  });
}

export default async function NewsDetailPage({ params }: Props) {
  const { id } = await params;
  const { news } = await loadNews(id);
  if (news === null) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {news && <JsonLd data={newsArticleJsonLd(news)} />}
      <p>
        <Link href="/news">&lt; お知らせ一覧に戻る</Link>
      </p>
      <hr />
      <NewsDetailClient id={id} />
    </div>
  );
}
