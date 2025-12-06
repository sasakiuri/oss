"use client";

import { useMemo } from "react";
import { useNews } from "@/hooks";
import { ShareButtons } from "@/components/share-buttons";
import { siteConfig } from "@/lib/config";
import { sanitizeHtml } from "@/lib/security/sanitize";
import { format } from "date-fns";

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
  const { data, isLoading, error } = useNews(id);

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
  const dateStr = format(news.date, "yyyy年M月d日");
  const url = `${siteConfig.siteUrl}/news/${id}`;

  // Sanitize HTML content to prevent XSS attacks
  const sanitizedContent = useMemo(
    () => sanitizeHtml(news.summary),
    [news.summary]
  );

  return (
    <article className="mt-4">
      <h1>{news.title}</h1>

      <p>
        <time dateTime={news.date.toISOString()}>{dateStr}</time>
      </p>

      <ShareButtons
        title={`${news.title}：お知らせ`}
        url={url}
        twitter={siteConfig.social.twitter}
        className="my-4"
      />

      <hr />

      {/* Content is sanitized to remove XSS vectors */}
      <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
    </article>
  );
}
