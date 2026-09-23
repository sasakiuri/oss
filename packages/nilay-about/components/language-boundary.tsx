'use client';

import { useEffect, type ReactNode } from 'react';

import { rehydrateLanguage, useLanguage } from '@/store';

/**
 * Reads the saved language once a page has loaded, and keeps the document in it.
 *
 * The choice lives in the browser rather than in the address, so the server has no way to know it
 * and renders Japanese. This is what turns that into the reader's language, and it is also what
 * keeps `lang` on the document truthful: a screen reader that is told Japanese and handed English
 * pronounces it as nonsense, so the attribute moves with the text rather than staying where the
 * server left it.
 */
export function LanguageBoundary({ children }: { children: ReactNode }) {
  const language = useLanguage();

  useEffect(() => {
    void rehydrateLanguage();
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return children;
}
