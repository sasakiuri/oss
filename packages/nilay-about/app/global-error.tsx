'use client';

import Link from 'next/link';

/**
 * Global Error Boundary for the entire application
 *
 * This is a minimal implementation that doesn't use React hooks
 * to avoid SSG prerendering issues with Next.js 16. That rules out reading the reader's chosen
 * language, which lives in a store, so both languages are written out instead. It is the last
 * page the site can show, and whoever reaches it should be able to read it.
 *
 * IMPORTANT: This component must include its own <html> and <body> tags
 * because it replaces the root layout entirely when triggered.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling#handling-errors-in-root-layouts
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ja">
      <body>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '2rem' }}>
          <h1 lang="ja">エラーが発生しました</h1>
          <p style={{ marginTop: '1rem' }} lang="ja">
            申し訳ございません。予期しないエラーが発生しました。
          </p>
          <p style={{ marginTop: '0.5rem' }} lang="en">
            Sorry - something unexpected happened.
          </p>
          <div style={{ marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                textDecoration: 'underline',
                marginRight: '1rem',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
              }}
            >
              <span lang="ja">再試行</span> / <span lang="en">Try again</span>
            </button>
            <Link href="/" style={{ textDecoration: 'underline' }}>
              <span lang="ja">ホームに戻る</span> / <span lang="en">Front page</span>
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
