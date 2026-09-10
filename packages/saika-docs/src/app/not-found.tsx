// SPDX-License-Identifier: MIT
import Link from 'next/link';

import { Button } from '@/shared/ui/button';

export default function NotFound() {
  return (
    <main id="main-content" className="py-20 text-center">
      <p className="text-subtle mb-4 text-sm">404</p>
      <h1 className="mb-4 text-2xl font-semibold">ページが見つかりません</h1>
      <p className="text-subtle mb-8">文書メニューから目的のページを選んでください。</p>
      <Button asChild>
        <Link href="/">マニュアルの入口へ</Link>
      </Button>
    </main>
  );
}
