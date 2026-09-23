'use client';

import type { ReactNode } from 'react';

import { useLanguage } from '@/store';

/** The landmark the skip link jumps to. Its name is read aloud, so it follows the language. */
export function MainRegion({ children }: { children: ReactNode }) {
  const language = useLanguage();
  return (
    <main
      id="main-content"
      role="main"
      tabIndex={-1}
      aria-label={language === 'ja' ? 'メインコンテンツ' : 'Main content'}
    >
      {children}
    </main>
  );
}
