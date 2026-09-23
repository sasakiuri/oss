'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { LuRotateCcw } from 'react-icons/lu';

import { Button } from '@/components/ui';
import type { Language } from '@/store';

import type { ExamSession } from './_store';
import { ExamScopeNotice } from './exam-notice';

export function ExamResults({
  exam,
  language,
  onReview,
  onRetry,
  onChangeSettings,
}: {
  exam: ExamSession;
  language: Language;
  onReview: (images: string[]) => void;
  onRetry: () => void;
  onChangeSettings: () => void;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const heading = useRef<HTMLHeadingElement>(null);
  const missed = exam.questions
    .map((question, index) => ({ question, choice: exam.answers[index] ?? null }))
    .filter(({ question, choice }) => choice !== question.answer);
  const unanswered = missed.filter(({ choice }) => choice === null).length;
  const correct = exam.questions.length - missed.length;
  const [selected, setSelected] = useState(() => missed.map(({ question }) => question.image));

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-medium">
        {t('テスト結果', 'Quiz results')}
      </h2>
      <div className="space-y-2">
        <p>
          <span className="block text-sm text-on-surface-variant">{t('正答率', 'Score')}</span>
          <span className="block text-5xl font-medium tabular-nums">
            {Math.round((correct / exam.questions.length) * 100)}%
          </span>
        </p>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {[
            [t('正答', 'Correct'), correct],
            [t('誤答', 'Wrong'), missed.length - unanswered],
            [t('未回答', 'No answer'), unanswered],
          ].map(([label, count]) => (
            <div key={String(label)} className="flex items-baseline gap-1.5">
              <dt className="text-on-surface-variant">{label}</dt>
              <dd className="font-medium tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {missed.length > 0 && (
          <Button className="w-full sm:w-auto" onClick={() => onReview(missed.map(({ question }) => question.image))}>
            <LuRotateCcw aria-hidden="true" />
            {t(`間違えた ${missed.length} 種をスライドショーで復習`, `Review ${missed.length} missed in the slideshow`)}
          </Button>
        )}
        <Button variant={missed.length ? 'outline' : 'default'} className="w-full sm:w-auto" onClick={onRetry}>
          {t('同じ設定でもう一度', 'Retry with the same settings')}
        </Button>
        <Button variant="ghost" className="w-full sm:w-auto" onClick={onChangeSettings}>
          {t('設定を変えて始める', 'Change settings')}
        </Button>
      </div>
      {missed.length ? (
        <div className="space-y-4 border-t border-outline-variant pt-5">
          <h3 className="font-medium">{t('間違えた鳥獣', 'Missed species')}</h3>
          <ul className="divide-y divide-outline-variant border-y border-outline-variant">
            {missed.map(({ question, choice }) => (
              <li key={question.image}>
                <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(question.image)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, question.image]
                          : selected.filter((image) => image !== question.image),
                      )
                    }
                  />
                  <Image
                    src={question.image}
                    alt=""
                    width={96}
                    height={72}
                    className="h-14 w-20 shrink-0 rounded-sm bg-surface-container object-contain"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium" lang="ja">
                      {question.answer}
                    </span>
                    <span className="block text-sm text-on-surface-variant">
                      {choice === null ? (
                        t('未回答', 'No answer')
                      ) : (
                        <>
                          {t('選んだ答え：', 'You chose: ')}
                          <span lang="ja">{choice}</span>
                        </>
                      )}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button variant="outline" disabled={!selected.length} onClick={() => onReview(selected)}>
            {t(
              `選んだ ${selected.length} 問をスライドショーで復習`,
              `Review ${selected.length} selected in the slideshow`,
            )}
          </Button>
        </div>
      ) : (
        <p className="border-t border-outline-variant pt-5 text-sm">{t('すべて正解です。', 'All correct.')}</p>
      )}
      <ExamScopeNotice language={language} />
    </div>
  );
}
