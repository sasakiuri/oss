'use client';

export function SkipLink() {
  return (
    <a
      href="#main-content"
      onClick={() => document.getElementById('main-content')?.focus({ preventScroll: true })}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-slate-800 focus:px-4 focus:py-2 focus:text-white"
    >
      メインコンテンツへスキップ
    </a>
  );
}
