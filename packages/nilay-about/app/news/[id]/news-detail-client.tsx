"use client";

import { useNews } from "@/hooks";
import { ShareButtons } from "@/components/share-buttons";
import { Skeleton } from "@/components/ui";
import { siteConfig } from "@/lib/config";
import { format } from "date-fns";

function NewsDetailSkeleton() {
  return (
    <div className="pt-4 space-y-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
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
      <div className="pt-8 text-center text-destructive">
        ニュースの取得に失敗しました。
      </div>
    );
  }

  const { news } = data;
  const dateStr = format(news.date, "yyyy年M月d日");
  const url = `${siteConfig.siteUrl}/news/${id}`;

  return (
    <article className="pt-4">
      <ShareButtons
        title={`${news.title}：お知らせ`}
        url={url}
        twitter={siteConfig.social.twitter}
        className="mb-4"
      />

      <time className="block text-sm text-muted-foreground">{dateStr}</time>

      <h1 className="mt-4 text-2xl font-bold text-foreground mb-12">
        {news.title}
      </h1>

      <div
        className="prose prose-lg max-w-none text-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ __html: news.summary }}
      />
    </article>
  );
}
