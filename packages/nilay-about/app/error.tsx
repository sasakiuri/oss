"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global Error Boundary for the application
 *
 * This component catches runtime errors in the app and displays
 * a user-friendly error message with recovery options.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to monitoring service in production
    // TODO: Integrate with Sentry, LogRocket, or similar
    console.error("[App Error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>エラーが発生しました</h1>

      <p className="mt-4">
        申し訳ございません。予期しないエラーが発生しました。
      </p>

      {error.digest && (
        <p className="mt-2 text-sm">
          エラーID: <code>{error.digest}</code>
        </p>
      )}

      <div className="mt-6 space-x-4">
        <button
          type="button"
          onClick={reset}
          className="underline"
        >
          再試行
        </button>
        <a href="/" className="underline">
          ホームに戻る
        </a>
      </div>

      <hr className="my-8" />

      <details className="text-sm">
        <summary className="cursor-pointer">技術的な詳細</summary>
        <pre className="mt-2 p-4 bg-muted overflow-auto text-xs">
          {error.message}
        </pre>
      </details>
    </div>
  );
}
