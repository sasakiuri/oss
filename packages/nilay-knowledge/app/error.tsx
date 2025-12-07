'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service
    console.error('Application Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <AlertTriangle className="h-16 w-16 text-amber-500" />
      <h1 className="mt-4 text-xl font-semibold text-slate-800">
        エラーが発生しました
      </h1>
      <p className="mt-2 text-slate-600">
        申し訳ありません。ページの読み込み中にエラーが発生しました。
      </p>
      <div className="mt-6 flex gap-4">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" />
          再試行
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-600"
        >
          <Home className="h-4 w-4" />
          トップへ戻る
        </Link>
      </div>
    </div>
  );
}
