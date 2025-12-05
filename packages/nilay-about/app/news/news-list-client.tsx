"use client";

import Link from "next/link";
import { useNewsList } from "@/hooks";
import { formatDate, stripHtml, truncate } from "@/lib/utils";
import type { News } from "@/lib/schemas";

const SUMMARY_MAX_LENGTH = 140;

function NewsListSkeleton() {
  return (
    <div role="status" aria-label="ニュースを読み込み中">
      <p>読み込み中...</p>
    </div>
  );
}

interface NewsListItemProps {
  news: News;
}

function NewsListItem({ news }: NewsListItemProps) {
  const summary = truncate(stripHtml(news.summary), SUMMARY_MAX_LENGTH);
  const dateStr = formatDate(news.date);

  return (
    <li>
      <time dateTime={news.date.toISOString()}>{dateStr}</time>
      {" - "}
      <Link href={`/news/${news.id}`}>{news.title}</Link>
      <br />
      <span className="ml-8 text-sm">{summary}</span>
    </li>
  );
}

export function NewsListClient() {
  const { data, isLoading, error, refetch } = useNewsList();

  if (isLoading) {
    return <NewsListSkeleton />;
  }

  if (error) {
    return (
      <div className="mt-4">
        <p className="text-destructive">ニュースの取得に失敗しました。</p>
        <p>
          <button
            type="button"
            onClick={() => refetch()}
            className="underline"
          >
            再試行
          </button>
        </p>
      </div>
    );
  }

  if (!data || data.newsList.length === 0) {
    return (
      <div className="mt-4">
        <p>現在、お知らせはありません。</p>
        <p>新しいお知らせが投稿されるとここに表示されます。</p>
      </div>
    );
  }

  return (
    <ul className="mt-4" aria-label="ニュース一覧">
      {data.newsList.map((news) => (
        <NewsListItem key={news.id} news={news} />
      ))}
    </ul>
  );
}
