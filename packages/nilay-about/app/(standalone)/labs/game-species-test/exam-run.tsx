'use client';

import { useEffect, useRef } from 'react';
import { LuSkipForward } from 'react-icons/lu';

import { Button, Progress } from '@/components/ui';
import { quizList } from '@/features/game-species/quiz-data';
import type { Language } from '@/store';

import type { ExamSession } from './_store';
import { SpeciesImage } from './species-image';

export function ExamRun({
  exam,
  language,
  remaining,
  onTick,
  onAnswer,
  onQuit,
}: {
  exam: ExamSession;
  language: Language;
  remaining: number | null;
  onTick: (index: number, remaining: number) => void;
  onAnswer: (choice: string | null) => void;
  onQuit: () => void;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const index = exam.answers.length;
  const question = exam.questions[index];
  const quiz = quizList.find((item) => item.image === question?.image);
  const limit = exam.timeLimit;
  const firstChoice = useRef<HTMLButtonElement>(null);
  const reported = useRef<number | null>(null);

  useEffect(() => {
    firstChoice.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    if (limit === null || !question) return;
    const deadline = Date.now() + limit * 1000;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      // Report whole seconds only.
      if (left !== reported.current) {
        reported.current = left;
        onTick(index, left);
      }
      if (left > 0) return;
      // Running out of time counts as no answer and moves on.
      window.clearInterval(timer);
      onAnswer(null);
    }, 200);
    return () => window.clearInterval(timer);
  }, [index, limit, question, onTick, onAnswer]);

  if (!question || !quiz) return null;
  const categoryLabel =
    exam.category === 'all'
      ? t('全種類', 'All species')
      : exam.category === 'birds'
        ? t('鳥類', 'Birds')
        : t('獣類', 'Mammals');

  return (
    <>
      <div className="flex items-center justify-between gap-2 p-4 sm:px-6">
        <span className="min-w-0 flex-1 text-sm font-medium">
          {t('判別テスト', 'Timed quiz')} · {categoryLabel}
        </span>
        <span className="text-sm tabular-nums">
          {index + 1} / {exam.questions.length}
        </span>
        {/* The negative margin keeps the hit area inside the row's padding. */}
        <Button variant="ghost" size="sm" className="-my-3.5 shrink-0 px-3" onClick={onQuit}>
          {t('やめる', 'Quit')}
        </Button>
      </div>
      <Progress
        value={(index / exam.questions.length) * 100}
        className="rounded-none"
        aria-label={t('テストの進み具合', 'Quiz progress')}
      />
      {/* No onOpen pause: the countdown keeps running while the photo is enlarged. */}
      <SpeciesImage quiz={quiz} showingAnswer={false} language={language} />
      <div className="space-y-3 p-4 sm:p-6">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-medium">{t('この鳥獣の名前は？', 'Which species is this?')}</h2>
            {limit !== null && (
              <span className="flex shrink-0 gap-1 text-sm">
                <span>{t('残り時間', 'Time left')}</span>
                <span className="tabular-nums">{t(`${remaining ?? limit} 秒`, `${remaining ?? limit} s`)}</span>
              </span>
            )}
          </div>
          {/* Duplicates the countdown text. */}
          {limit !== null && <Progress value={((remaining ?? limit) / limit) * 100} aria-hidden="true" />}
        </div>
        {/* 2 × 2 at every width, so all four fit on a phone screen. */}
        <div className="grid grid-cols-2 gap-3" role="group" aria-label={t('選択肢', 'Choices')}>
          {question.choices.map((choice, choiceIndex) => (
            <Button
              key={choice}
              ref={choiceIndex === 0 ? firstChoice : undefined}
              variant="outline"
              lang="ja"
              className="h-auto min-h-14 whitespace-normal px-3 py-3 text-base"
              onClick={() => onAnswer(choice)}
            >
              {choice}
            </Button>
          ))}
        </div>
        <Button variant="ghost" className="w-full" onClick={() => onAnswer(null)}>
          <LuSkipForward aria-hidden="true" />
          {t('わからない（未回答で次へ）', 'Not sure (skip)')}
        </Button>
      </div>
    </>
  );
}
