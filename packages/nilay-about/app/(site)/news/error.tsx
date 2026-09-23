'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { useLanguage } from '@/store';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error Boundary for News pages
 */
export default function NewsError({ error, reset }: ErrorProps) {
  const language = useLanguage();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    console.error('[News Error]', error);
  }, [error]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>{t('ニュースの読み込みに失敗しました', 'The news could not be loaded')}</h1>

      <p className="mt-4">
        {t(
          'ニュースの取得中にエラーが発生しました。しばらく時間をおいてから再度お試しください。',
          'Something went wrong while fetching the news. Please give it a moment and try again.',
        )}
      </p>

      <div className="mt-6 space-x-4">
        <button type="button" onClick={reset} className="underline">
          {t('再読み込み', 'Reload')}
        </button>
        <Link href="/news" className="underline">
          {t('ニュース一覧に戻る', 'Back to the news')}
        </Link>
      </div>
    </div>
  );
}
