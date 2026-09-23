'use client';

import type { ReactNode, Ref } from 'react';
import { LuPlay } from 'react-icons/lu';

import { SegmentedControl } from '@/components/labs';
import { Button } from '@/components/ui';
import type { Language } from '@/store';

import type { ExamOptions, ExamTimeLimit } from './_store';
import { ExamScopeNotice } from './exam-notice';

export function ExamIntro({
  language,
  options,
  count,
  categoryOptions,
  onChange,
  onStart,
  headingRef,
}: {
  language: Language;
  options: ExamOptions;
  count: number;
  categoryOptions: { value: string; label: ReactNode }[];
  onChange: (options: ExamOptions) => void;
  onStart: () => void;
  /** Where the focus lands when a quiz is left for its settings. */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="space-y-2">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-medium">
          {t('判別テストの設定', 'Quiz settings')}
        </h2>
        <p className="text-sm text-on-surface-variant">
          {t(
            '時間切れは未回答として次へ進みます。正誤は最後にまとめて表示します。',
            'Running out of time counts as no answer. Answers are marked at the end.',
          )}
        </p>
      </div>
      <SegmentedControl
        legend={t('対象', 'Species')}
        orientation="inline"
        value={options.category}
        options={categoryOptions}
        onChange={(value) => onChange({ ...options, category: value as ExamOptions['category'] })}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SegmentedControl
          legend={t('出題数', 'Questions')}
          orientation="inline"
          value={String(options.questionCount ?? 'all')}
          options={[
            ...[10, 16, 20].map((value) => ({ value: String(value), label: t(`${value} 問`, `${value}`) })),
            { value: 'all', label: t('全問', 'All') },
          ]}
          onChange={(value) => onChange({ ...options, questionCount: value === 'all' ? null : Number(value) })}
        />
        <SegmentedControl
          legend={t('1 問の制限時間', 'Time per question')}
          orientation="inline"
          value={String(options.timeLimit ?? 'none')}
          options={[
            { value: '5', label: t('5 秒', '5 s') },
            { value: '10', label: t('10 秒', '10 s') },
            { value: 'none', label: t('無制限', 'No limit') },
          ]}
          onChange={(value) =>
            onChange({ ...options, timeLimit: value === 'none' ? null : (Number(value) as ExamTimeLimit) })
          }
        />
      </div>
      <Button className="w-full" onClick={onStart}>
        <LuPlay aria-hidden="true" />
        {t(`テストを開始（${count} 問）`, `Start quiz (${count} questions)`)}
      </Button>
      <div className="space-y-3 border-t border-outline-variant pt-5">
        <p className="text-sm text-on-surface-variant">
          {t(
            '誤答・未回答の鳥獣を「要復習」に記録します。テストの途中経過は保存しません。',
            'Missed and skipped species are marked for review. A quiz in progress is not saved.',
          )}
        </p>
        <ExamScopeNotice language={language} />
      </div>
    </div>
  );
}
