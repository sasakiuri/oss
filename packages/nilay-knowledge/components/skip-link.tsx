import Link from 'next/link';

export function SkipLink() {
  return (
    <Link
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-slate-800 focus:px-4 focus:py-2 focus:text-white focus:outline-none"
    >
      メインコンテンツへスキップ
    </Link>
  );
}
