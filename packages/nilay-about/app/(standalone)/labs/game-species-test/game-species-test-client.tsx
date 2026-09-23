'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LuArrowLeft, LuArrowRight, LuCheck, LuEye, LuPause, LuPlay, LuRotateCcw } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  discardedSaveMessage,
  LanguageMenu,
  SegmentedControl,
} from '@/components/labs';
import { Button, Card, Progress } from '@/components/ui';
import { quizList } from '@/features/game-species/quiz-data';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { speciesStorageKey, useGameSpeciesStore, type ExamOptions, type SessionOptions } from './_store';
import { ExamIntro } from './exam-intro';
import { ExamResults } from './exam-results';
import { ExamRun } from './exam-run';
import { SessionResults } from './session-results';
import { SpeciesImage, SpeciesImageFrame } from './species-image';

/** A two-line tab label, read out as one phrase. */
const modeLabel = (name: string, detail: string, spoken: string) => (
  <>
    <span aria-hidden="true">
      {name}
      <span className="block text-xs opacity-80">{detail}</span>
    </span>
    <span className="sr-only">{spoken}</span>
  </>
);

export function GameSpeciesTestClient() {
  const state = useGameSpeciesStore();
  const [ready, setReady] = useState(false);
  const [toolMode, setToolMode] = useState<'slideshow' | 'exam'>('slideshow');
  const [options, setOptions] = useState<SessionOptions>({ category: 'all', questionCount: null });
  const [examOptions, setExamOptions] = useState<ExamOptions>({ category: 'all', questionCount: 10, timeLimit: 10 });
  const [examAttempt, setExamAttempt] = useState(0);
  const [examTick, setExamTick] = useState<{ index: number; left: number } | null>(null);
  // The photo a reload resumed at.
  const [resumedAt, setResumedAt] = useState<string | null>(null);
  const quizCard = useRef<HTMLDivElement>(null);
  const revealButton = useRef<HTMLButtonElement>(null);
  const gradeButton = useRef<HTMLButtonElement>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const examIntroHeading = useRef<HTMLHeadingElement>(null);
  // Scrolls to the card's top only when the page is scrolled past it.
  const bringCardIntoView = () => {
    const element = quizCard.current;
    if (!element) return;
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--labs-bar-height')) || 64;
    if (element.getBoundingClientRect().top < bar) element.scrollIntoView({ block: 'start' });
  };
  const focusNextAction = (scroll = false) =>
    window.requestAnimationFrame(() => {
      (revealButton.current ?? summaryHeading.current)?.focus({ preventScroll: true });
      if (scroll) quizCard.current?.scrollIntoView({ block: 'start' });
      else bringCardIntoView();
    });
  const grade = (known: boolean) => {
    rate(known);
    focusNextAction();
  };
  const storageAvailable = useStorageStatus((s) => s.available);
  const storageDiscarded = useDiscardedSave(speciesStorageKey);
  const {
    order,
    currentIndex,
    showingAnswer,
    autoPlay,
    interval,
    mode,
    results,
    sessionAnswers,
    exam,
    start,
    startSelected,
    reveal,
    rate,
    next,
    previous,
    setAutoPlay,
    setInterval: setPlaybackInterval,
    startExam,
    answerExam,
    exitExam,
  } = state;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const currentQuiz = quizList.find((quiz) => quiz.image === order[currentIndex]);
  const finished = order.length > 0 && currentIndex === order.length;
  const candidates = quizList.filter((quiz) => options.category === 'all' || quiz.category === options.category);
  const reviewCount = candidates.filter((quiz) => results[quiz.image] === false).length;
  const examCandidates = quizList.filter(
    (quiz) => examOptions.category === 'all' || quiz.category === examOptions.category,
  );
  const examCount = Math.min(examOptions.questionCount ?? examCandidates.length, examCandidates.length);
  const showingExam = toolMode === 'exam';
  const examRunning = exam !== null && exam.answers.length < exam.questions.length;
  const examIndex = exam ? exam.answers.length : 0;
  // Ignore a tick from the previous question.
  const examLeft = examTick?.index === examIndex ? examTick.left : null;
  const examMessage =
    !exam || !examRunning
      ? ''
      : exam.timeLimit === null
        ? t(`${examIndex + 1} 問目。制限時間なし。`, `Question ${examIndex + 1}. No time limit.`)
        : examLeft !== null && examLeft <= 3
          ? t('残り 3 秒。', '3 seconds left.')
          : t(
              `${examIndex + 1} 問目。残り ${exam.timeLimit} 秒。`,
              `Question ${examIndex + 1}. ${exam.timeLimit} seconds left.`,
            );
  const handleExamTick = useCallback((index: number, left: number) => setExamTick({ index, left }), []);
  const sessionCategory = new Set(order.map((id) => quizList.find((quiz) => quiz.image === id)?.category));
  const sessionLabel =
    !order.length || sessionCategory.size > 1
      ? t('全種類', 'All species')
      : sessionCategory.has('birds')
        ? t('鳥類', 'Birds')
        : t('獣類', 'Mammals');
  const discardedNotice = discardedSaveMessage(language, 'record');
  const savingNotice = !storageAvailable
    ? t('このブラウザーでは記録を保存できません。', 'This browser cannot save your record.')
    : t('進み具合は自動保存され、次回は続きから再開します。', 'Progress is saved and resumes next time.');
  // Only problems are announced, each in its own region so one is not re-read with the other.
  const discardedAlert = storageDiscarded ? discardedNotice : '';
  const savingAlert = storageAvailable ? '' : savingNotice;
  const knownCount = Object.values(sessionAnswers).filter(Boolean).length;
  const incorrectCount = Object.values(sessionAnswers).filter((known) => !known).length;

  useEffect(() => {
    void Promise.all([useGameSpeciesStore.persist.rehydrate(), rehydrateLanguage()]).then(() => {
      const saved = useGameSpeciesStore.getState();
      setOptions({ category: saved.category, questionCount: saved.questionCount });
      if (!saved.order.length) start('all');
      else if (saved.currentIndex > 0 && saved.currentIndex < saved.order.length)
        setResumedAt(saved.order[saved.currentIndex] ?? null);
      setReady(true);
    });
    return () => {
      const { setAutoPlay: pause, exitExam: endExam } = useGameSpeciesStore.getState();
      pause(false);
      // Leaving the tool ends the quiz.
      endExam();
    };
  }, [start]);

  useEffect(() => {
    if (!autoPlay || finished || !ready || showingExam) return;
    const timer = window.setTimeout(() => (showingAnswer ? next() : reveal()), interval * 1000);
    return () => window.clearTimeout(timer);
  }, [autoPlay, finished, ready, showingExam, showingAnswer, currentIndex, interval, next, reveal]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setAutoPlay(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || !ready || showingExam) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          'button, a, input, select, textarea, summary, [contenteditable], [role="menuitem"], [role="dialog"]',
        )
      )
        return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previous();
      } else if (!finished && (event.key === 'ArrowRight' || event.key === ' ')) {
        event.preventDefault();
        setAutoPlay(false);
        next();
      } else if (!finished && event.key === 'Enter') {
        event.preventDefault();
        setAutoPlay(false);
        reveal();
      }
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      window.removeEventListener('keydown', handleKey);
    };
  }, [ready, finished, showingExam, next, previous, reveal, setAutoPlay]);

  // Every path that ends a running quiz confirms here first.
  const discardExam = () => {
    if (
      examRunning &&
      !window.confirm(
        t('今のテストを終了しますか？ 回答は保存されません。', 'End this quiz? Your answers will not be saved.'),
      )
    )
      return false;
    if (exam) exitExam();
    return true;
  };

  const restart = (nextMode: 'all' | 'review') => {
    if (
      !finished &&
      currentIndex > 0 &&
      !window.confirm(
        t(
          '今の学習を終了して、新しく始めますか？ 復習の記録は残ります。',
          'End this session and start a new one? Review marks are kept.',
        ),
      )
    )
      return;
    if (!discardExam()) return;
    start(nextMode, options);
    setResumedAt(null);
    focusNextAction(true);
  };

  const launchExam = (nextOptions: ExamOptions) => {
    if (!discardExam()) return;
    startExam(nextOptions);
    setExamTick(null);
    setToolMode('exam');
    setExamAttempt((attempt) => attempt + 1);
    window.requestAnimationFrame(() => quizCard.current?.scrollIntoView({ block: 'start' }));
  };

  const beginExam = () => launchExam(examOptions);

  // Retry with the settings the quiz ran with.
  const retryExam = () => {
    if (!exam) return;
    launchExam({ category: exam.category, questionCount: exam.questionCount, timeLimit: exam.timeLimit });
  };

  // The pressed button unmounts, so focus the settings heading.
  const focusExamIntro = () =>
    window.requestAnimationFrame(() => {
      examIntroHeading.current?.focus({ preventScroll: true });
      bringCardIntoView();
    });

  const leaveExam = () => {
    if (!discardExam()) return;
    focusExamIntro();
  };

  const switchMode = (value: 'slideshow' | 'exam') => {
    if (value === toolMode) return;
    // Leaving quiz mode ends the quiz.
    if (value === 'slideshow' && !discardExam()) return;
    setAutoPlay(false);
    setToolMode(value);
  };

  const reviewSelected = (images: string[]) => {
    startSelected(images);
    setResumedAt(null);
    focusNextAction(true);
  };

  const categoryLabel = (category: SessionOptions['category']) =>
    category === 'all' ? t('全種類', 'All species') : category === 'birds' ? t('鳥類', 'Birds') : t('獣類', 'Mammals');
  const categoryOptions = [
    { value: 'all', name: t('全種類', 'All'), count: 44 },
    { value: 'birds', name: t('鳥類', 'Birds'), count: 28 },
    { value: 'mammals', name: t('獣類', 'Mammals'), count: 16 },
  ].map(({ value, name, count }) => ({
    value,
    label: (
      <span>
        {name}
        <span className="block text-xs opacity-80">{t(`${count} 種`, `${count}`)}</span>
      </span>
    ),
  }));
  const slideshowCount = Math.min(options.questionCount ?? candidates.length, candidates.length);
  const missedThisSession = order.filter((id) => sessionAnswers[id] === false);
  const resumed = resumedAt !== null && resumedAt === order[currentIndex] && !finished;

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('game-species-test').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      {/* Mounted empty: a status region inserted with text is not announced. */}
      <p className="sr-only" role="status" lang={language}>
        {discardedAlert}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {savingAlert}
      </p>
      <div lang={language} className="mx-auto max-w-3xl space-y-4" inert={!ready} aria-busy={!ready}>
        {/* Outside the card, which remounts per question. */}
        <p className="sr-only" role="status">
          {examMessage}
        </p>
        <DiscardedSaveNotice storageKey={speciesStorageKey} language={language} subject="record" />
        {/* The legend is for screen readers only. */}
        <div className="[&_legend]:sr-only">
          <SegmentedControl
            legend={t('モード', 'Mode')}
            orientation="inline"
            value={toolMode}
            options={[
              {
                value: 'slideshow',
                label: modeLabel(
                  t('スライドショー', 'Slideshow'),
                  t('自己採点', 'self-marked'),
                  t('スライドショー（自己採点）', 'Slideshow (self-marked)'),
                ),
              },
              {
                value: 'exam',
                label: modeLabel(
                  t('判別テスト', 'Timed quiz'),
                  t('4 択・制限時間つき', 'four choices'),
                  t('判別テスト（4 択・制限時間つき）', 'Timed quiz (four choices)'),
                ),
              },
            ]}
            onChange={(value) => switchMode(value as 'slideshow' | 'exam')}
          />
        </div>
        <Card
          ref={quizCard}
          variant="outlined"
          className="scroll-mt-[calc(var(--labs-bar-height,4rem)+1rem)] overflow-hidden rounded-md"
        >
          {showingExam ? (
            !exam ? (
              <ExamIntro
                language={language}
                options={examOptions}
                count={examCount}
                categoryOptions={categoryOptions}
                onChange={setExamOptions}
                onStart={beginExam}
                headingRef={examIntroHeading}
              />
            ) : examRunning ? (
              // Remounted per question to restart the countdown.
              <ExamRun
                key={`${examAttempt}-${examIndex}`}
                exam={exam}
                language={language}
                remaining={examLeft}
                onTick={handleExamTick}
                onAnswer={answerExam}
                onQuit={leaveExam}
              />
            ) : (
              <ExamResults
                exam={exam}
                language={language}
                onReview={(images) => {
                  if (!discardExam()) return;
                  setToolMode('slideshow');
                  reviewSelected(images);
                }}
                onRetry={retryExam}
                onChangeSettings={() => {
                  exitExam();
                  focusExamIntro();
                }}
              />
            )
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 p-4 sm:px-6">
                <span className="text-sm font-medium">
                  {mode === 'review' ? `${t('復習', 'Review')} · ${sessionLabel}` : sessionLabel}
                </span>
                <span className="text-sm tabular-nums" aria-live={ready ? 'polite' : undefined}>
                  {order.length ? `${finished ? order.length : currentIndex + 1} / ${order.length}` : ''}
                </span>
              </div>
              <Progress
                value={order.length ? (currentIndex / order.length) * 100 : 0}
                className="rounded-none"
                aria-label={t('学習の進み具合', 'Session progress')}
              />
              {finished ? (
                <div className="space-y-5 p-5 sm:p-6">
                  <h2 ref={summaryHeading} tabIndex={-1} className="text-2xl font-medium">
                    {t('学習結果', 'Session results')}
                  </h2>
                  <dl className="flex flex-wrap gap-x-6 gap-y-1">
                    {[
                      [t('わかった', 'Knew it'), knownCount],
                      [t('要復習', 'To review'), incorrectCount],
                      [t('未採点', 'Not graded'), order.length - knownCount - incorrectCount],
                    ].map(([label, count]) => (
                      <div key={String(label)} className="flex items-baseline gap-2">
                        <dt className="text-sm text-on-surface-variant">{label}</dt>
                        <dd className="text-2xl font-medium tabular-nums">{count}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    {missedThisSession.length > 0 && (
                      <Button className="w-full sm:w-auto" onClick={() => reviewSelected(missedThisSession)}>
                        <LuRotateCcw aria-hidden="true" />
                        {t(
                          `要復習の ${missedThisSession.length} 問をもう一度`,
                          `Review the ${missedThisSession.length} marked`,
                        )}
                      </Button>
                    )}
                    <Button
                      variant={missedThisSession.length > 0 ? 'outline' : 'default'}
                      className="w-full sm:w-auto"
                      onClick={() => restart('all')}
                    >
                      {t('同じ出題設定でもう一度', 'Retry with the same settings')}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        previous();
                        focusNextAction(true);
                      }}
                    >
                      <LuArrowLeft aria-hidden="true" />
                      {t('最後の画像に戻る', 'Back to last photo')}
                    </Button>
                  </div>
                  <SessionResults
                    order={order}
                    answers={sessionAnswers}
                    language={language}
                    onReview={reviewSelected}
                  />
                </div>
              ) : (
                // Before the first draw there is no photo yet; its frame keeps the layout.
                (currentQuiz || !order.length) && (
                  <>
                    {resumed && (
                      <p className="px-4 pt-3 text-sm text-on-surface-variant sm:px-6">
                        {t('前回の続きから再開しています。', 'Resumed where you left off.')}
                      </p>
                    )}
                    {currentQuiz ? (
                      <SpeciesImage
                        key={currentQuiz.image}
                        quiz={currentQuiz}
                        showingAnswer={showingAnswer}
                        language={language}
                        onOpen={() => setAutoPlay(false)}
                      />
                    ) : (
                      <SpeciesImageFrame />
                    )}
                    <div className="space-y-4 p-4 sm:p-6">
                      <div className="min-h-9 text-center" aria-live={ready ? 'polite' : undefined}>
                        <h2 className="text-xl font-medium" lang={showingAnswer ? 'ja' : language}>
                          {showingAnswer && currentQuiz
                            ? currentQuiz.answer
                            : t('この鳥獣の名前は？', 'Which species is this?')}
                        </h2>
                      </div>
                      {showingAnswer ? (
                        <div className="grid grid-cols-2 gap-3">
                          <Button variant="outline" onClick={() => grade(false)}>
                            <LuRotateCcw aria-hidden="true" />
                            {t('要復習', 'To review')}
                          </Button>
                          <Button ref={gradeButton} onClick={() => grade(true)}>
                            <LuCheck aria-hidden="true" />
                            {t('わかった', 'Knew it')}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          ref={revealButton}
                          className="w-full"
                          onClick={() => {
                            setAutoPlay(false);
                            reveal();
                            window.requestAnimationFrame(() => gradeButton.current?.focus({ preventScroll: true }));
                          }}
                        >
                          <LuEye aria-hidden="true" />
                          {t('答えを見る', 'Show answer')}
                        </Button>
                      )}
                      <div className="flex items-center justify-between gap-2 border-t border-outline-variant pt-3">
                        <Button variant="ghost" onClick={previous} disabled={currentIndex === 0}>
                          <LuArrowLeft aria-hidden="true" />
                          {t('前へ', 'Previous')}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setAutoPlay(false);
                            next();
                            // Skipping the last photo unmounts this button, so focus the results.
                            if (currentIndex + 1 === order.length) focusNextAction();
                          }}
                        >
                          {t('採点せず次へ', 'Next without grading')}
                          <LuArrowRight aria-hidden="true" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button variant="ghost" aria-pressed={autoPlay} onClick={() => setAutoPlay(!autoPlay)}>
                          {autoPlay ? <LuPause aria-hidden="true" /> : <LuPlay aria-hidden="true" />}
                          {autoPlay ? t('一時停止', 'Pause') : t('自動再生', 'Auto play')}
                        </Button>
                        <div className="flex items-center gap-2 whitespace-nowrap text-sm">
                          <label htmlFor="playback-interval">{t('切り替え', 'Interval')}</label>
                          <select
                            id="playback-interval"
                            className="w-auto"
                            value={interval}
                            onChange={(event) => setPlaybackInterval(Number(event.target.value) as 3 | 5 | 10)}
                          >
                            {[3, 5, 10].map((seconds) => (
                              <option key={seconds} value={seconds}>
                                {t(`${seconds}秒`, `${seconds} s`)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </>
                )
              )}
            </>
          )}
        </Card>
        {!showingExam && (
          <ConditionSection
            id="quiz-settings"
            title={t('出題設定', 'Session settings')}
            summary={
              t(
                `${categoryLabel(options.category)} · ${slideshowCount} 問`,
                `${categoryLabel(options.category)} · ${slideshowCount} questions`,
              ) + (reviewCount ? t(` · 要復習 ${reviewCount} 種`, ` · ${reviewCount} to review`) : '')
            }
          >
            <SegmentedControl
              legend={t('種類', 'Species')}
              orientation="inline"
              value={options.category}
              options={categoryOptions}
              onChange={(value) => setOptions({ ...options, category: value as SessionOptions['category'] })}
            />
            <SegmentedControl
              legend={t('問題数', 'Questions')}
              orientation="inline"
              value={String(options.questionCount ?? 'all')}
              options={[
                // Capped at the species in the chosen group.
                ...[5, 10, 20].map((count) => {
                  const asked = Math.min(count, candidates.length);
                  return { value: String(count), label: t(`${asked} 問`, `${asked}`) };
                }),
                { value: 'all', label: t('すべて', 'All') },
              ]}
              onChange={(value) => setOptions({ ...options, questionCount: value === 'all' ? null : Number(value) })}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => restart('all')}>
                {t(`この設定で開始（${slideshowCount} 問）`, `Start (${slideshowCount} questions)`)}
              </Button>
              <Button variant="outline" disabled={!reviewCount} onClick={() => restart('review')}>
                {t(
                  `要復習から出題（${Math.min(options.questionCount ?? reviewCount, reviewCount)} 問）`,
                  `From review list (${Math.min(options.questionCount ?? reviewCount, reviewCount)})`,
                )}
              </Button>
            </div>
          </ConditionSection>
        )}
        <div className="space-y-2">
          {(!showingExam || !storageAvailable) && <p className="text-xs text-on-surface-variant">{savingNotice}</p>}
          {!showingExam && (
            <>
              <p className="text-xs text-on-surface-variant">
                {t('自動再生では採点しません。', 'Auto play does not mark answers.')}
              </p>
              <p className="hidden text-xs text-on-surface-variant lg:block">
                {t('キーボード：← 前へ / → 次へ / Enter 答え', 'Keyboard: ← back / → next / Enter answer')}
              </p>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
