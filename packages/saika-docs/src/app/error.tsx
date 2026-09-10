// SPDX-License-Identifier: MIT
'use client';

import { Button } from '@/shared/ui/button';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" role="alert" className="py-20 text-center">
      <h1 className="mb-4 text-2xl font-semibold">文書を読み込めませんでした</h1>
      <p className="text-subtle mb-8">もう一度読み込んでください。</p>
      <Button onClick={reset}>再読み込み</Button>
    </main>
  );
}
