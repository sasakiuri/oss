'use client';

import type { Language } from '@/store';

export function ExamScopeNotice({ language }: { language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <div className="rounded-sm bg-secondary-container p-4 text-sm text-on-secondary-container">
      <p>
        {t(
          '出題は狩猟鳥獣 44 種だけです。狩猟免許試験の鳥獣判別では非狩猟鳥獣も出題され、狩猟鳥獣かどうかも問われます。',
          'Only the 44 game species are shown. The licence exam also shows non-game species and asks which ones may be hunted.',
        )}
      </p>
    </div>
  );
}
