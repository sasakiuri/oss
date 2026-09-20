'use client';

import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log to error reporting service
    console.error('Application Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <AlertTriangle aria-hidden="true" className="h-16 w-16 text-amber-500" />
      <h1 className="mt-4 text-xl font-semibold text-ink">エラーが発生しました</h1>
      <p className="mt-2 text-subtle">申し訳ありません。ページの読み込み中にエラーが発生しました。</p>
      <div className="mt-6 flex flex-wrap justify-center gap-4">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2 text-body hover:bg-muted"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          再試行
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-600"
        >
          <Home aria-hidden="true" className="h-4 w-4" />
          トップへ戻る
        </Link>
      </div>
    </div>
  );
}
