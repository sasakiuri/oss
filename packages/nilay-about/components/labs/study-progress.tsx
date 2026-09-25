'use client';

import { useEffect, useId, useState } from 'react';

import { useDiscardedSave } from '@/lib/browser-storage';
import { dateKeySchema } from '@/lib/schemas/study-log';
import { currentStreak, dateKey, daysBetween, longestStreak } from '@/lib/study-log';
import { studyLogStorageKey, useStudyLogStore, type Language } from '@/store';

import { discardedSaveMessage } from './discarded-save-notice';

/**
 * The study streak and the countdown to the exam, shown by every study tool.
 *
 * The record is shared, so a day of practice in any of the tools counts. Today's date is read on
 * the client after mounting: the page is rendered on a server whose day need not be the reader's.
 */
export function StudyProgress({ language }: { language: Language }) {
  const { days, examDate, hydrated, hydrate, setExamDate } = useStudyLogStore();
  const discarded = useDiscardedSave(studyLogStorageKey);
  const [today, setToday] = useState<string | null>(null);
  const fieldId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void hydrate().then(() => setToday(dateKey(new Date())));
  }, [hydrate]);

  if (!hydrated || today === null) return <div className="min-h-24" aria-hidden="true" />;

  const streak = currentStreak(days, today);
  const best = longestStreak(days);
  const studiedToday = days.includes(today);
  const remaining = examDate === null ? null : daysBetween(today, examDate);

  return (
    <section
      aria-label={t('学習の記録', 'Study record')}
      className="grid items-center gap-4 border-b border-outline-variant pb-4 sm:grid-cols-2"
    >
      <div className="space-y-1">
        <p className="text-sm tabular-nums">
          {t('連続学習日数', 'Study streak')}{' '}
          <span className="font-medium">{t(`${streak} 日`, `${streak} ${streak === 1 ? 'day' : 'days'}`)}</span>
          <span className="ml-3 text-on-surface-variant">
            {t(`最長 ${best} 日`, `Best: ${best} ${best === 1 ? 'day' : 'days'}`)}
          </span>
        </p>
        {studiedToday && <p className="text-sm text-on-surface-variant">{t('今日は学習済み', 'Studied today')}</p>}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-3">
          <label htmlFor={fieldId} className="shrink-0 text-sm text-on-surface-variant">
            {t('試験日', 'Exam date')}
          </label>
          <input
            id={fieldId}
            type="date"
            className="min-w-0 flex-1"
            value={examDate ?? ''}
            onChange={(event) => {
              const parsed = dateKeySchema.safeParse(event.target.value);
              setExamDate(parsed.success ? parsed.data : null);
            }}
          />
        </div>
        <p className="text-sm text-on-surface-variant" aria-live="polite">
          {remaining === null
            ? null
            : remaining > 0
              ? t(`試験まであと ${remaining} 日`, `${remaining} ${remaining === 1 ? 'day' : 'days'} to the exam`)
              : remaining === 0
                ? t('今日が試験日です', 'The exam is today')
                : t('試験日を過ぎています', 'The exam date has passed')}
        </p>
      </div>
      {discarded && (
        <p className="text-xs text-on-surface-variant sm:col-span-2">{discardedSaveMessage(language, 'record')}</p>
      )}
    </section>
  );
}
