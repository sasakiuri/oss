"use client";

import { useNews } from "@/hooks";
import { ShareButtons } from "@/components/share-buttons";
import { siteConfig } from "@/lib/config";
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

      <div dangerouslySetInnerHTML={{ __html: news.summary }} />
    </article>
  );
}
