'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuPlay, LuSkipForward, LuX } from 'react-icons/lu';

import { SegmentedControl } from '@/components/labs';
import { Button, Progress } from '@/components/ui';
import type { Language } from '@/store';

import {
  buildJudgeQuestions,
  JUDGE_COUNT,
  judgeVerdict,
  scoreJudge,
  type JudgeAnswer,
  type JudgeQuestion,
} from './judge';
import { SpeciesImage } from './species-image';

type Category = 'all' | 'birds' | 'mammals';
type Limit = 5 | 10 | null;

/**
 * The exam-style identification test: game and non-game species mixed, "game species or not",
 * then the name. Like the four-choice test it is not saved; a reload starts over.
 */
export function JudgeMode({
  language,
  onAnswered,
  onRunningChange,
}: {
  language: Language;
  /** Called on every answer, for the study streak. */
  onAnswered: () => void;
  onRunningChange: (running: boolean) => void;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [category, setCategory] = useState<Category>('all');
  const [limit, setLimit] = useState<Limit>(5);
  const [questions, setQuestions] = useState<JudgeQuestion[] | null>(null);
  const [answers, setAnswers] = useState<JudgeAnswer[]>([]);
  const [step, setStep] = useState<'status' | 'name'>('status');
  const [left, setLeft] = useState<number | null>(null);
  const firstButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const index = answers.length;
  const running = questions !== null && index < questions.length;
  const question = running ? questions[index] : undefined;

  useEffect(() => onRunningChange(running), [running, onRunningChange]);

  const record = (answer: JudgeAnswer) => {
    setAnswers((given) => [...given, answer]);
    setStep('status');
    onAnswered();
  };

  // One clock per photo, across both steps; running out records whatever was given so far.
  const partial = useRef<JudgeAnswer>({ game: null, name: null });
  useEffect(() => {
    partial.current = { game: null, name: null };
    if (!running || limit === null) return;
    const deadline = Date.now() + limit * 1000;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining > 0) return;
      window.clearInterval(timer);
      setAnswers((given) => (given.length === index ? [...given, partial.current] : given));
      setStep('status');
    }, 200);
    return () => window.clearInterval(timer);
  }, [index, running, limit]);

  useEffect(() => {
    if (running) firstButton.current?.focus({ preventScroll: true });
    else if (questions) heading.current?.focus({ preventScroll: true });
  }, [index, step, running, questions]);

  const start = () => {
    setQuestions(buildJudgeQuestions(category, JUDGE_COUNT));
    setAnswers([]);
    setStep('status');
    setLeft(limit);
  };

  if (questions === null)
    return (
      <div className="space-y-5 p-5 sm:p-6">
        <div className="space-y-2">
          <h2 className="text-xl font-medium">{t('本番形式の判別テスト', 'Exam-style test')}</h2>
          <p className="text-sm text-on-surface-variant">
            {t(
              `狩猟鳥獣と、間違えやすい非狩猟鳥獣の写真を ${JUDGE_COUNT} 枚出題します。まず狩猟鳥獣かどうかを答え、狩猟鳥獣と答えたときは名前を選びます。`,
              `${JUDGE_COUNT} photos of game species and non-game species that are easily mistaken for them. Say whether each may be hunted, then name the ones you call game.`,
            )}
          </p>
        </div>
        <SegmentedControl
          legend={t('対象', 'Species')}
          orientation="inline"
          value={category}
          options={[
            { value: 'all', label: t('鳥獣（銃猟・網猟）', 'Birds and mammals') },
            { value: 'mammals', label: t('獣類（わな猟）', 'Mammals (traps)') },
            { value: 'birds', label: t('鳥類', 'Birds') },
          ]}
          onChange={(value) => setCategory(value as Category)}
        />
        <SegmentedControl
          legend={t('1 枚の制限時間', 'Time per photo')}
          orientation="inline"
          value={String(limit ?? 'none')}
          options={[
            { value: '5', label: t('5 秒', '5 s') },
            { value: '10', label: t('10 秒', '10 s') },
            { value: 'none', label: t('無制限', 'No limit') },
          ]}
          onChange={(value) => setLimit(value === 'none' ? null : (Number(value) as Limit))}
        />
        <Button className="w-full" onClick={start}>
          <LuPlay aria-hidden="true" />
          {t('本番形式で開始', 'Start')}
        </Button>
        <p className="text-sm text-on-surface-variant">
          {t(
            '16 枚・1 枚 5 秒程度の形式は、高知県の狩猟免許試験の案内によります。',
            'The 16 photos at about 5 seconds each follow Kochi Prefecture’s notice for the licence exam.',
          )}
        </p>
      </div>
    );

  if (!running) {
    const tally = scoreJudge(questions, answers);
    const missed = questions
      .map((item, position) => ({ item, answer: answers[position] }))
      .filter(({ item, answer }) => judgeVerdict(item, answer) !== 'correct');
    return (
      <div className="space-y-5 p-5 sm:p-6">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-medium">
          {t('判別テストの結果', 'Results')}
        </h2>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {[
            [t('正解', 'Correct'), `${tally.correct} / ${questions.length}`],
            [t('狩猟鳥獣かどうかの誤り', 'Wrong game status'), tally.wrongStatus],
            [t('名前の誤り', 'Wrong name'), tally.wrongName],
            [t('未回答', 'No answer'), tally.unanswered],
          ].map(([name, value]) => (
            <div key={String(name)} className="flex items-baseline gap-1.5">
              <dt className="text-on-surface-variant">{name}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-2 sm:flex">
          <Button className="w-full sm:w-auto" onClick={start}>
            {t('もう一度', 'Again')}
          </Button>
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setQuestions(null)}>
            {t('設定に戻る', 'Back to settings')}
          </Button>
        </div>
        {missed.length > 0 && (
          <ul className="divide-y divide-outline-variant border-y border-outline-variant">
            {missed.map(({ item, answer }) => (
              <li key={item.image} className="flex items-center gap-3 py-2">
                <Image
                  src={item.image}
                  alt=""
                  width={80}
                  height={80}
                  className="size-16 shrink-0 rounded-sm bg-surface-container object-cover"
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-medium" lang="ja">
                    {item.name}
                  </span>
                  <span className="block">
                    {item.game ? t('狩猟鳥獣', 'Game species') : t('非狩猟鳥獣', 'Not a game species')}
                  </span>
                  <span className="block text-on-surface-variant">
                    {!answer || answer.game === null
                      ? t('未回答', 'No answer')
                      : answer.game !== item.game
                        ? answer.game
                          ? t('狩猟鳥獣と回答', 'You said game')
                          : t('非狩猟鳥獣と回答', 'You said not game')
                        : answer.name === null
                          ? t('名前が未回答', 'No name given')
                          : t(`名前を「${answer.name}」と回答`, `You named it ${answer.name}`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!question) return null;
  return (
    <>
      <div className="flex items-center justify-between gap-2 p-4 sm:px-6">
        <span className="min-w-0 flex-1 text-sm font-medium">{t('本番形式', 'Exam style')}</span>
        <span className="text-sm tabular-nums">
          {index + 1} / {questions.length}
        </span>
        {limit !== null && (
          <span className="text-sm tabular-nums">{t(`残り ${left ?? limit} 秒`, `${left ?? limit} s left`)}</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="-my-3.5 shrink-0 px-3"
          onClick={() => {
            if (window.confirm(t('テストを終了しますか？', 'End this test?'))) setQuestions(null);
          }}
        >
          {t('やめる', 'Quit')}
        </Button>
      </div>
      <Progress
        value={(index / questions.length) * 100}
        className="rounded-none"
        aria-label={t('進み具合', 'Progress')}
      />
      <SpeciesImage
        key={question.image}
        quiz={{ image: question.image, answer: question.name, category: 'birds' }}
        showingAnswer={false}
        language={language}
      />
      <div className="space-y-3 p-4 sm:p-6">
        {step === 'status' ? (
          <>
            <h2 className="text-lg font-medium">{t('狩猟鳥獣ですか？', 'Is this a game species?')}</h2>
            <div
              className="grid grid-cols-2 gap-3"
              role="group"
              aria-label={t('狩猟鳥獣かどうか', 'Game species or not')}
            >
              <Button
                ref={firstButton}
                variant="outline"
                className="min-h-14 text-base"
                onClick={() => {
                  partial.current = { game: true, name: null };
                  setStep('name');
                }}
              >
                <LuCheck aria-hidden="true" />
                {t('狩猟鳥獣', 'Game')}
              </Button>
              <Button
                variant="outline"
                className="min-h-14 text-base"
                onClick={() => record({ game: false, name: null })}
              >
                <LuX aria-hidden="true" />
                {t('狩猟鳥獣ではない', 'Not game')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-medium">{t('名前は？', 'Which species?')}</h2>
            <div className="grid grid-cols-2 gap-3" role="group" aria-label={t('名前の選択肢', 'Names')}>
              {question.choices.map((choice, position) => (
                <Button
                  key={choice}
                  ref={position === 0 ? firstButton : undefined}
                  variant="outline"
                  lang="ja"
                  className="h-auto min-h-14 whitespace-normal px-3 py-3 text-base"
                  onClick={() => record({ game: true, name: choice })}
                >
                  {choice}
                </Button>
              ))}
            </div>
          </>
        )}
        <Button variant="ghost" className="w-full" onClick={() => record(partial.current)}>
          <LuSkipForward aria-hidden="true" />
          {t('わからない（次へ）', 'Not sure (next)')}
        </Button>
      </div>
    </>
  );
}
