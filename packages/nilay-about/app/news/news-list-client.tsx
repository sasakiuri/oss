"use client";

import Link from "next/link";
import { useNewsList } from "@/hooks";
import {
  Skeleton,
  EmptyState,
  ErrorMessage,
} from "@/components/ui";
import { LuMegaphone, LuNewspaper } from "react-icons/lu";
import { formatDate, stripHtml, truncate } from "@/lib/utils";
import type { News } from "@/lib/schemas";

const SUMMARY_MAX_LENGTH = 140;

function NewsListSkeleton() {
  return (
    <div
      className="space-y-4 mt-8"
      role="status"
      aria-label="ニュースを読み込み中"
    >
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4 p-4 border-b border-border">
          <Skeleton className="h-6 w-6 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
      <span className="sr-only">読み込み中</span>
    </div>
  );
}

interface NewsListItemProps {
  news: News;
  isLast: boolean;
}

function NewsListItem({ news, isLast }: NewsListItemProps) {
  const summary = truncate(stripHtml(news.summary), SUMMARY_MAX_LENGTH);
  const dateStr = formatDate(news.date);

  return (
    <article className={!isLast ? "border-b border-border" : ""}>
      <Link
        href={`/news/${news.id}`}
        className="flex gap-4 p-4 hover:bg-secondary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      >
        <div className="text-foreground shrink-0 pt-1" aria-hidden="true">
          <LuMegaphone className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-medium text-foreground mb-2 truncate">
            {news.title}
          </h3>
          <p className="text-sm text-muted-foreground">
            <time dateTime={news.date.toISOString()} className="text-foreground">
              {dateStr}
            </time>
            <span className="mx-2" aria-hidden="true">
              —
            </span>
            <span>{summary}</span>
          </p>
        </div>
      </Link>
    </article>
  );
}

export function NewsListClient() {
  const { data, isLoading, error, refetch } = useNewsList();

  if (isLoading) {
    return <NewsListSkeleton />;
  }

  if (error) {
    return (
      <ErrorMessage
        message="ニュースの取得に失敗しました。"
        onRetry={() => refetch()}
        className="mt-8"
      />
    );
  }

  if (!data || data.newsList.length === 0) {
    return (
      <EmptyState
        icon={LuNewspaper}
        title="ニュースはありません"
        description="新しいお知らせが投稿されるとここに表示されます。"
        className="mt-8"
      />
    );
  }

  return (
    <section className="mt-8" aria-label="ニュース一覧">
      {data.newsList.map((news, index) => (
        <NewsListItem
          key={news.id}
          news={news}
          isLast={index === data.newsList.length - 1}
        />
      ))}
    </section>
  );
}
