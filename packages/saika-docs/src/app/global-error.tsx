// SPDX-License-Identifier: MIT
'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN)
      void import('@sentry/react').then(({ captureException }) => captureException(error));
  }, [error]);
  return (
    <html lang="ja">
      <body>
        <main>
          <h1>画面を表示できませんでした</h1>
          <p>再読み込みしてお試しください。</p>
          <button onClick={reset}>再読み込み</button>
        </main>
      </body>
    </html>
  );
}
