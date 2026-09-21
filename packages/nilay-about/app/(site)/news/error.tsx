'use client';

import Link from 'next/link';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error Boundary for News pages
 */
export default function NewsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[News Error]', error);
  }, [error]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>ニュースの読み込みに失敗しました</h1>

      <p className="mt-4">ニュースの取得中にエラーが発生しました。しばらく時間をおいてから再度お試しください。</p>

      <div className="mt-6 space-x-4">
        <button type="button" onClick={reset} className="underline">
          再読み込み
        </button>
        <Link href="/news" className="underline">
          ニュース一覧に戻る
        </Link>
      </div>
    </div>
  );
}
