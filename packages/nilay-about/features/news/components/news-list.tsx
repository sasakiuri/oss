'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { formatDate, stripHtml, truncate } from '@/lib/utils';
import { useLanguage, type Language } from '@/store';

import { newsQueries } from '../queries';
import type { News } from '../schema';

const SUMMARY_MAX_LENGTH = 140;

function NewsListSkeleton({ language }: { language: Language }) {
  return (
    <div role="status" aria-label={language === 'ja' ? 'ニュースを読み込み中' : 'Loading the news'}>
      <p>{language === 'ja' ? '読み込み中...' : 'Loading…'}</p>
    </div>
  );
}

interface NewsListItemProps {
  news: News;
  language: Language;
}

function NewsListItem({ news, language }: NewsListItemProps) {
  const summary = truncate(stripHtml(news.summary), SUMMARY_MAX_LENGTH);
  const dateStr = formatDate(news.date, 'short', language);

  return (
    <li>
      <time dateTime={news.date.toISOString()}>{dateStr}</time>
      {' - '}
      {/* The news itself is written in Japanese, and saying so is what lets a screen reader
          pronounce it: the page around it may be in English, but these two are not. */}
      <Link href={`/news/${encodeURIComponent(news.id)}`} lang="ja">
        {news.title}
      </Link>
      <br />
      <span className="ml-8 text-sm" lang="ja">
        {summary}
      </span>
    </li>
  );
}

export function NewsListClient() {
  const { data, isLoading, error, refetch } = useQuery(newsQueries.list());
  const language = useLanguage();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  if (isLoading) {
    return <NewsListSkeleton language={language} />;
  }

  if (error) {
    return (
      <div className="mt-4">
        <p className="text-destructive">{t('ニュースの取得に失敗しました。', 'The news could not be fetched.')}</p>
        <p>
          <button type="button" onClick={() => refetch()} className="underline">
            {t('再試行', 'Try again')}
          </button>
        </p>
      </div>
    );
  }

  if (!data || data.newsList.length === 0) {
    return (
      <div className="mt-4">
        <p>{t('現在、お知らせはありません。', 'There is no news at the moment.')}</p>
        <p>
          {t('新しいお知らせが投稿されるとここに表示されます。', 'Anything new will appear here when it is posted.')}
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-4" aria-label={t('ニュース一覧', 'News')}>
      {data.newsList.map((news) => (
        <NewsListItem key={news.id} news={news} language={language} />
      ))}
    </ul>
  );
}
