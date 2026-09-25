'use client';

import { useEffect, useRef, type Ref } from 'react';
import { LuArrowRight, LuCheck, LuSkipForward, LuX } from 'react-icons/lu';

import { Button, Progress } from '@/components/ui';
import type { StudySession } from '@/lib/license-exam';
import type { Language } from '@/store';

import { SourceLine } from './labels';
import { studyQuestionsById } from './questions';

/**
 * One question at a time with the answer shown straight away: practice, the daily test and review.
 */
export function PracticeRun({
  session,
  title,
  language,
  onAnswer,
  onAdvance,
  onQuit,
  nextRef,
}: {
  session: StudySession;
  title: string;
  language: Language;
  onAnswer: (choice: string | null, byKeyboard: boolean) => void;
  onAdvance: () => void;
  onQuit: () => void;
  nextRef: Ref<HTMLButtonElement>;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const prompt = session.prompts[session.current];
  const question = prompt ? studyQuestionsById.get(prompt.id) : undefined;
  const given = session.answers[session.current] ?? null;
  const correct = question !== undefined && given === question.answer;

  const index = session.current;
  const revealed = session.revealed;
  useEffect(() => {
    if (!revealed) firstChoice.current?.focus({ preventScroll: true });
  }, [index, revealed]);

  if (!prompt || !question) return null;
  const last = session.current + 1 >= session.prompts.length;

  return (
    <>
      <div className="flex items-center justify-between gap-2 p-4 sm:px-6">
        <span className="min-w-0 flex-1 text-sm font-medium">{title}</span>
        <span className="text-sm tabular-nums">
          {session.current + 1} / {session.prompts.length}
        </span>
        <Button variant="ghost" size="sm" className="-my-3.5 shrink-0 px-3" onClick={onQuit}>
          {t('やめる', 'Quit')}
        </Button>
      </div>
      <Progress
        value={((session.current + (session.revealed ? 1 : 0)) / session.prompts.length) * 100}
        className="rounded-none"
        aria-label={t('進み具合', 'Progress')}
      />
      <div className="space-y-5 p-5 sm:p-6">
        <h2 className="text-lg font-medium sm:text-xl" lang="ja">
          {question.question}
        </h2>
        {!session.revealed ? (
          <>
            <div className="grid gap-3" role="group" aria-label={t('選択肢', 'Choices')}>
              {prompt.choices.map((choice, index) => (
                <Button
                  key={choice}
                  ref={index === 0 ? firstChoice : undefined}
                  variant="outline"
                  lang="ja"
                  className="h-auto min-h-14 justify-start whitespace-normal px-4 py-3 text-left text-base"
                  onClick={(event) => onAnswer(choice, event.detail === 0)}
                >
                  {choice}
                </Button>
              ))}
            </div>
            <Button variant="ghost" className="w-full" onClick={(event) => onAnswer(null, event.detail === 0)}>
              <LuSkipForward aria-hidden="true" />
              {t('わからない（未回答で次へ）', 'Not sure (skip)')}
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            <p
              className={`flex items-center gap-2 text-lg font-medium ${correct ? 'text-primary' : 'text-destructive'}`}
            >
              {correct ? <LuCheck aria-hidden="true" /> : <LuX aria-hidden="true" />}
              {correct ? t('正解', 'Correct') : given === null ? t('未回答', 'No answer') : t('不正解', 'Wrong')}
            </p>
            {!correct && given !== null && (
              <p className="text-sm text-on-surface-variant">
                {t('選んだ答え：', 'You chose: ')}
                <span lang="ja">{given}</span>
              </p>
            )}
            <div className="rounded-sm bg-surface-container p-4">
              <p className="text-sm font-medium">
                {t('正しい答え', 'Correct answer')}
                {': '}
                <span lang="ja">{question.answer}</span>
              </p>
              <p className="mt-2 text-sm text-on-surface-variant" lang="ja">
                {question.explanation}
              </p>
            </div>
            <SourceLine question={question} language={language} />
            <Button ref={nextRef} className="w-full" onClick={onAdvance}>
              <LuArrowRight aria-hidden="true" />
              {last ? t('結果を見る', 'See results') : t('次の問題へ', 'Next question')}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
