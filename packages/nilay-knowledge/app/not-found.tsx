import { Home } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-subtle">404</h1>
      <h2 className="mt-4 text-xl font-semibold text-ink">ページが見つかりません</h2>
      <p className="mt-2 text-subtle">お探しのページは存在しないか、移動した可能性があります。</p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-600"
      >
        <Home aria-hidden="true" className="h-4 w-4" />
        トップページへ戻る
      </Link>
    </div>
  );
}
