'use client';

import type { Language } from '@/store';

export function ExamScopeNotice({ language }: { language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <p className="text-sm text-on-surface-variant">
      {t(
        '出題は狩猟鳥獣 46 種です（ノウサギとユキウサギは 1 問）。',
        'Questions cover the 46 game species (the hare and the mountain hare share one).',
      )}
    </p>
  );
}
