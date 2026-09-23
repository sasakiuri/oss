'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { useLanguage } from '@/store';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Check if running in development mode
 * Note: This check happens at build time for static optimization
 */
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Global Error Boundary for the application
 *
 * This component catches runtime errors in the app and displays
 * a user-friendly error message with recovery options.
 *
 * Security: Error details are only shown in development mode to prevent
 * leaking internal implementation details or sensitive information.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function Error({ error, reset }: ErrorProps) {
  const language = useLanguage();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    // Log error to monitoring service in production
    // TODO: Integrate with Sentry, LogRocket, or similar
    if (isDevelopment) {
      console.error('[App Error]', {
        message: error.message,
        digest: error.digest,
        stack: error.stack,
      });
    } else {
      // In production, log only the digest for correlation
      console.error('[App Error]', {
        digest: error.digest,
      });
    }
  }, [error]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>{t('エラーが発生しました', 'Something went wrong')}</h1>

      <p className="mt-4">
        {t('申し訳ございません。予期しないエラーが発生しました。', 'Sorry - something unexpected happened.')}
      </p>

      {error.digest && (
        <p className="mt-2 text-sm">
          {t('エラーID: ', 'Error ID: ')}
          <code>{error.digest}</code>
        </p>
      )}

      <div className="mt-6 space-x-4">
        <button type="button" onClick={reset} className="underline">
          {t('再試行', 'Try again')}
        </button>
        <Link href="/" className="underline">
          {t('ホームに戻る', 'Back to the front page')}
        </Link>
      </div>

      {/* 開発環境でのみ技術的な詳細を表示 */}
      {isDevelopment && (
        <>
          <hr className="my-8" />
          <details className="text-sm">
            <summary className="cursor-pointer">
              {t('技術的な詳細（開発環境のみ）', 'Technical detail (development only)')}
            </summary>
            <pre className="mt-2 p-4 bg-muted overflow-auto text-xs">
              {error.message}
              {error.stack && `\n\nStack trace:\n${error.stack}`}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
