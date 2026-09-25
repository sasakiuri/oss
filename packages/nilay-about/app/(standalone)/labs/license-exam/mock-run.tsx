'use client';

import { useEffect, useRef } from 'react';
import { LuArrowLeft, LuArrowRight, LuFlag, LuSend } from 'react-icons/lu';

import { Button, Progress } from '@/components/ui';
import type { StudySession } from '@/lib/license-exam';
import { cn } from '@/lib/utils';
import type { Language } from '@/store';

import { studyQuestionsById } from './questions';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * The mock exam: every question open to move between, answers changeable until handed in, nothing
 * marked until then, and a clock that hands the paper in when it runs out.
 */
export function MockRun({
  session,
  title,
  remaining,
  language,
  onAnswer,
  onGoTo,
  onFlag,
  onFinish,
  onQuit,
}: {
  session: StudySession;
  title: string;
  remaining: number | null;
  language: Language;
  onAnswer: (choice: string) => void;
  onGoTo: (index: number) => void;
  onFlag: (id: string) => void;
  onFinish: () => void;
  onQuit: () => void;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const heading = useRef<HTMLHeadingElement>(null);
  const prompt = session.prompts[session.current];
  const question = prompt ? studyQuestionsById.get(prompt.id) : undefined;
  const given = session.answers[session.current] ?? null;
  const answered = session.answers.filter((answer) => answer !== null).length;
  const flagged = prompt ? session.flagged.includes(prompt.id) : false;

  const index = session.current;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [index]);

  if (!prompt || !question) return null;

  const handIn = () => {
    const blank = session.prompts.length - answered;
    const message =
      blank > 0
        ? t(`未回答が ${blank} 問あります。提出して採点しますか？`, `${blank} unanswered. Hand in and mark?`)
        : t('提出して採点しますか？', 'Hand in and mark?');
    if (window.confirm(message)) onFinish();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 sm:px-6">
        <span className="min-w-0 flex-1 text-sm font-medium">{title}</span>
        {remaining !== null && (
          <span className="text-sm tabular-nums" role="timer" aria-label={t('残り時間', 'Time left')}>
            {t('残り', 'Left')} {clock(remaining)}
          </span>
        )}
        <Button variant="ghost" size="sm" className="-my-3.5 shrink-0 px-3" onClick={onQuit}>
          {t('やめる', 'Quit')}
        </Button>
      </div>
      <Progress
        value={(answered / session.prompts.length) * 100}
        className="rounded-none"
        aria-label={t('回答済みの割合', 'Answered')}
      />
      <div className="space-y-5 p-5 sm:p-6">
        <p className="text-sm text-on-surface-variant">
          {t(
            `${session.current + 1} / ${session.prompts.length} 問目 · 回答済み ${answered} 問`,
            `Question ${session.current + 1} of ${session.prompts.length} · ${answered} answered`,
          )}
        </p>
        <h2 ref={heading} tabIndex={-1} className="text-lg font-medium sm:text-xl" lang="ja">
          {question.question}
        </h2>
        <div
          className={cn('grid gap-3', session.exam === 'course' && 'grid-cols-2')}
          role="group"
          aria-label={t('選択肢', 'Choices')}
        >
          {prompt.choices.map((choice) => (
            <Button
              key={choice}
              variant={given === choice ? 'default' : 'outline'}
              aria-pressed={given === choice}
              lang="ja"
              className="h-auto min-h-14 justify-start whitespace-normal px-4 py-3 text-left text-base"
              onClick={() => onAnswer(choice)}
            >
              {choice}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" disabled={session.current === 0} onClick={() => onGoTo(session.current - 1)}>
            <LuArrowLeft aria-hidden="true" />
            {t('前へ', 'Previous')}
          </Button>
          <Button variant="ghost" aria-pressed={flagged} onClick={() => onFlag(prompt.id)}>
            <LuFlag aria-hidden="true" />
            {flagged ? t('見直す印を外す', 'Unflag') : t('後で見直す', 'Flag to review')}
          </Button>
          <Button
            variant="ghost"
            disabled={session.current + 1 >= session.prompts.length}
            onClick={() => onGoTo(session.current + 1)}
          >
            {t('次へ', 'Next')}
            <LuArrowRight aria-hidden="true" />
          </Button>
        </div>
        <nav aria-label={t('問題の一覧', 'Questions')} className="border-t border-outline-variant pt-4">
          <ol className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
            {session.prompts.map((item, index) => {
              const done = session.answers[index] !== null;
              const marked = session.flagged.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onGoTo(index)}
                    aria-current={index === session.current ? 'step' : undefined}
                    aria-label={t(
                      `${index + 1} 問目${done ? '（回答済み）' : '（未回答）'}${marked ? '・見直す印あり' : ''}`,
                      `Question ${index + 1}${done ? ', answered' : ', unanswered'}${marked ? ', flagged' : ''}`,
                    )}
                    className={cn(
                      'relative flex h-11 w-full items-center justify-center rounded-md border text-sm tabular-nums',
                      done ? 'border-primary bg-primary-container' : 'border-outline-variant',
                      index === session.current && 'outline outline-2 outline-offset-1 outline-primary',
                    )}
                  >
                    {index + 1}
                    {marked && <LuFlag aria-hidden="true" className="absolute right-0.5 top-0.5 size-3" />}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <Button className="w-full" onClick={handIn}>
          <LuSend aria-hidden="true" />
          {t('提出して採点する', 'Hand in and mark')}
        </Button>
      </div>
    </>
  );
}
