'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { ShareButtons } from '@/components/share-buttons';
import { siteConfig } from '@/lib/config';
import { sanitizeHtml } from '@/lib/security/html';

import { newsQueries } from '../queries';

function NewsDetailSkeleton() {
  return (
    <div>
      <p>読み込み中...</p>
    </div>
  );
}

interface NewsDetailClientProps {
  id: string;
}

export function NewsDetailClient({ id }: NewsDetailClientProps) {
  const { data, isLoading, error } = useQuery(newsQueries.detail(id));

  if (isLoading) {
    return <NewsDetailSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="mt-4">
        <p className="text-destructive">ニュースの取得に失敗しました。</p>
      </div>
    );
  }

  const { news } = data;
  const dateStr = format(news.date, 'yyyy年M月d日');
  const url = `${siteConfig.siteUrl}/news/${encodeURIComponent(id)}`;

  // Sanitize HTML content to prevent XSS attacks
  const sanitizedContent = sanitizeHtml(news.summary);

  return (
    <article className="mt-4">
      <h1>{news.title}</h1>

      <p>
        <time dateTime={news.date.toISOString()}>{dateStr}</time>
      </p>

      <ShareButtons title={`${news.title}：お知らせ`} url={url} twitter={siteConfig.social.twitter} className="my-4" />

      <hr />

      {/* Content is sanitized to remove XSS vectors */}
      <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
    </article>
  );
}
