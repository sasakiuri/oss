"use client";

/**
 * Global Error Boundary for the entire application
 *
 * This is a minimal implementation that doesn't use React hooks
 * to avoid SSG prerendering issues with Next.js 16.
 *
 * IMPORTANT: This component must include its own <html> and <body> tags
 * because it replaces the root layout entirely when triggered.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling#handling-errors-in-root-layouts
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body>
        <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem" }}>
          <h1>エラーが発生しました</h1>
          <p style={{ marginTop: "1rem" }}>
            申し訳ございません。予期しないエラーが発生しました。
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                textDecoration: "underline",
                marginRight: "1rem",
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
              }}
            >
              再試行
            </button>
            <a href="/" style={{ textDecoration: "underline" }}>
              ホームに戻る
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
