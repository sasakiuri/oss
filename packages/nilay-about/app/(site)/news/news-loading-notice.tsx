'use client';

import { useLanguage } from '@/store';

/** What stands in for the list while it is being fetched. */
export function NewsLoadingNotice() {
  const language = useLanguage();

  return (
    <div role="status" aria-label={language === 'ja' ? 'ニュースを読み込み中' : 'Loading the news'} className="mt-4">
      <p>{language === 'ja' ? '読み込み中...' : 'Loading…'}</p>
    </div>
  );
}
