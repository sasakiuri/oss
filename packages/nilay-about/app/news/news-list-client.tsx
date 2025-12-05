"use client";

import Link from "next/link";
import { useNewsList } from "@/hooks";
import { Skeleton } from "@/components/ui";
import { LuMegaphone } from "react-icons/lu";
import { format } from "date-fns";
import type { News } from "@/lib/schemas";

function stripHtml(html: string): string {
  return html.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, "");
}

function NewsListSkeleton() {
  return (
    <div className="space-y-4 mt-8">
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
    </div>
  );
}

function NewsListItem({
  news,
  isLast,
}: {
  news: News;
  isLast: boolean;
}) {
  const summary = stripHtml(news.summary).substring(0, 140) + "……";
  const dateStr = format(news.date, "yyyy年M月d日");

  return (
    <Link
      href={`/news/${news.id}`}
      className={`flex gap-4 p-4 hover:bg-secondary transition-colors ${
        !isLast ? "border-b border-border" : ""
      }`}
    >
      <div className="text-foreground shrink-0 pt-1">
        <LuMegaphone className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-medium text-foreground mb-2 truncate">
          {news.title}
        </h3>
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground">{dateStr}</span>
          <span className="mx-2">—</span>
          <span>{summary}</span>
        </p>
      </div>
    </Link>
  );
}

export function NewsListClient() {
  const { data, isLoading, error } = useNewsList();

  if (isLoading) {
    return <NewsListSkeleton />;
  }

  if (error) {
    return (
      <div className="mt-8 text-center text-destructive">
        ニュースの取得に失敗しました。
      </div>
    );
  }

  if (!data || data.newsList.length === 0) {
    return (
      <div className="mt-8 text-center text-muted-foreground">
        ニュースはありません。
      </div>
    );
  }

  return (
    <div className="mt-8">
      {data.newsList.map((news, index) => (
        <NewsListItem
          key={news.id}
          news={news}
          isLast={index === data.newsList.length - 1}
        />
      ))}
    </div>
  );
}
