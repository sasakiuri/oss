'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LuCalendarCheck, LuClipboardList, LuPlay, LuRotateCcw } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  discardedSaveMessage,
  LanguageMenu,
  SegmentedControl,
  StudyProgress,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import {
  DAILY_COUNT,
  dueQuestions,
  MOCK_BLUEPRINTS,
  mockBlueprint,
  mockQuestionCount,
  remainingSeconds,
  summarizeProgress,
  type StudyArea,
  type StudyExam,
} from '@/lib/license-exam';
import { courseAreas, huntingAreas, licenceTypes, MASTERED_BOX, type LicenceType } from '@/lib/schemas/license-exam';
import { dateKey } from '@/lib/study-log';
import { rehydrateLanguage, useLanguage, useSetLanguage, useStudyLogStore } from '@/store';

import { poolFor, sessionScore, storageKey, useLicenseExamStore } from './_store';
import { areaLabels, examLabels, label, licenceLabels } from './labels';
import { MockRun } from './mock-run';
import { PracticeRun } from './practice-run';
import { SessionResults } from './session-results';
import { STUDY_SOURCES, STUDY_SOURCES_CHECKED_ON } from './sources';

const COUNTS = [10, 20, 30] as const;

const percent = (correct: number, total: number) => (total ? Math.round((correct / total) * 100) : 0);

/** Scrolls a new screen of the run to its top when the page has been scrolled past it. */
function bringIntoView(element: HTMLElement | null) {
  if (!element) return;
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--labs-bar-height')) || 64;
  if (element.getBoundingClientRect().top < bar) element.scrollIntoView({ block: 'start' });
}

export function LicenseExamClient() {
  const store = useLicenseExamStore();
  const { options, session, progress, setOptions } = store;
  const recordStudy = useStudyLogStore((state) => state.recordStudy);
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [today, setToday] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const areaId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useLicenseExamStore.persist.rehydrate(), rehydrateLanguage()]).then(() => {
      setToday(dateKey(new Date()));
      setReady(true);
    });
  }, []);

  // The mock's clock. It runs from the stored start, so a reload does not give the time back.
  const timed = session !== null && session.mode === 'mock' && !session.finished;
  useEffect(() => {
    if (!timed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [timed]);
  const remaining = session && timed ? remainingSeconds(session, now) : null;
  useEffect(() => {
    if (remaining === 0 && today) store.finish(today);
  }, [remaining, today, store]);

  const exam = options.exam;
  const pool = poolFor(options);
  const areas: readonly StudyArea[] = exam === 'hunting' ? huntingAreas : courseAreas;
  const inArea = pool.filter((question) => options.area === 'all' || question.area === options.area);
  const due = today ? dueQuestions(pool, progress, today) : [];
  const summary = summarizeProgress(pool, progress);
  const blueprint = mockBlueprint(exam, exam === 'hunting' && options.partial);
  const score = sessionScore(session);

  const setExam = (value: StudyExam) =>
    setOptions({ ...options, exam: value, area: 'all', partial: value === 'hunting' && options.partial });

  const begin = (draw: () => void) => {
    draw();
    window.requestAnimationFrame(() => bringIntoView(card.current));
  };

  const answerPractice = (choice: string | null, byKeyboard: boolean) => {
    if (!today) return;
    store.answer(choice, today);
    void recordStudy(today);
    window.requestAnimationFrame(() => {
      bringIntoView(card.current);
      nextButton.current?.focus({ preventScroll: !byKeyboard });
    });
  };

  const answerMock = (choice: string) => {
    if (!today) return;
    store.answer(choice, today);
    void recordStudy(today);
  };

  const leave = () => {
    if (
      session &&
      !session.finished &&
      session.answers.some((answer) => answer !== null) &&
      !window.confirm(t('ここまでの回答は残りません。やめますか？', 'Your answers so far will be lost. Quit?'))
    )
      return;
    store.exit();
    window.requestAnimationFrame(() => startButton.current?.focus());
  };

  const modeTitle = (() => {
    if (!session) return '';
    const name = label(examLabels[session.exam], language);
    switch (session.mode) {
      case 'daily':
        return `${t('今日のテスト', "Today's test")} · ${name}`;
      case 'review':
        return `${t('復習', 'Review')} · ${name}`;
      case 'mock':
        return `${t('模擬試験', 'Mock exam')} · ${name}`;
      default:
        return name;
    }
  })();

  const settings = (
    <div className="space-y-6 p-5 sm:p-6">
      <h2 className="text-xl font-medium">{t('出題の設定', 'Settings')}</h2>
      <SegmentedControl
        legend={t('試験', 'Exam')}
        value={exam}
        options={(['hunting', 'course'] as const).map((value) => ({
          value,
          label: label(examLabels[value], language),
        }))}
        onChange={(value) => setExam(value as StudyExam)}
      />
      {exam === 'hunting' && (
        <SegmentedControl
          legend={t('免許の種類', 'Licence')}
          orientation="inline"
          value={options.licence}
          options={licenceTypes.map((value) => ({ value, label: label(licenceLabels[value], language) }))}
          onChange={(value) => setOptions({ ...options, licence: value as LicenceType })}
        />
      )}

      <section className="space-y-4 border-t border-outline-variant pt-5">
        <h3 className="font-medium">{t('練習', 'Practice')}</h3>
        <div className="min-w-0 space-y-2">
          <label htmlFor={areaId} className="block text-sm font-medium">
            {t('分野', 'Area')}
          </label>
          <select
            id={areaId}
            value={options.area}
            onChange={(event) => setOptions({ ...options, area: event.target.value as StudyArea | 'all' })}
          >
            <option value="all">{t(`すべて（${pool.length} 問）`, `All (${pool.length})`)}</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {label(areaLabels[area], language)}（{pool.filter((question) => question.area === area).length}）
              </option>
            ))}
          </select>
        </div>
        <SegmentedControl
          legend={t('出題数', 'Number of questions')}
          orientation="inline"
          value={options.count !== null && options.count < inArea.length ? String(options.count) : 'all'}
          options={[
            ...COUNTS.filter((count) => count < inArea.length).map((count) => ({
              value: String(count),
              label: t(`${count} 問`, `${count}`),
            })),
            { value: 'all', label: t(`全 ${inArea.length} 問`, `All ${inArea.length}`) },
          ]}
          onChange={(value) => setOptions({ ...options, count: value === 'all' ? null : Number(value) })}
        />
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Button ref={startButton} className="w-full sm:w-auto" onClick={() => begin(() => store.startPractice())}>
            <LuPlay aria-hidden="true" />
            {t('練習を開始', 'Start practice')}
          </Button>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!today}
            onClick={() => today && begin(() => store.startDaily(today))}
          >
            <LuCalendarCheck aria-hidden="true" />
            {t(`今日のテスト（${DAILY_COUNT} 問）`, `Today's test (${DAILY_COUNT})`)}
          </Button>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!today || due.length === 0}
            onClick={() => today && begin(() => store.startReview(today))}
          >
            <LuRotateCcw aria-hidden="true" />
            {t(`復習（${due.length} 問）`, `Review (${due.length})`)}
          </Button>
        </div>
      </section>

      <section className="space-y-4 border-t border-outline-variant pt-5">
        <h3 className="font-medium">{t('本番形式の模擬試験', 'Mock exam')}</h3>
        {exam === 'hunting' && (
          <label className="flex min-h-12 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={options.partial}
              onChange={(event) => setOptions({ ...options, partial: event.target.checked })}
            />
            {t(
              'ほかの種類の狩猟免許を持っている（知識試験の一部免除：猟具のみ）',
              'I already hold another hunting licence (gear only)',
            )}
          </label>
        )}
        <p className="text-sm">
          {exam === 'course'
            ? t(
                `正誤式 ${mockQuestionCount(blueprint)} 問・${blueprint.minutes} 分・${blueprint.passMark} 問以上の正解で合格。`,
                `${mockQuestionCount(blueprint)} true-or-false, ${blueprint.minutes} minutes, ${blueprint.passMark} to pass.`,
              )
            : options.partial
              ? t(
                  `猟具の三肢択一 ${mockQuestionCount(blueprint)} 問・${blueprint.minutes} 分・${blueprint.passMark} 問以上（70%）の正解で合格。`,
                  `${mockQuestionCount(blueprint)} gear questions, ${blueprint.minutes} minutes, ${blueprint.passMark} (70%) to pass.`,
                )
              : t(
                  `三肢択一 ${mockQuestionCount(blueprint)} 問（法令 13・猟具 6・鳥獣 9・保護管理 2）・${blueprint.minutes} 分・${blueprint.passMark} 問以上（70%）の正解で合格。`,
                  `${mockQuestionCount(blueprint)} three-way questions (law 13, gear 6, wildlife 9, management 2), ${blueprint.minutes} minutes, ${blueprint.passMark} (70%) to pass.`,
                )}
        </p>
        <Button className="w-full sm:w-auto" onClick={() => begin(() => store.startMock(Date.now()))}>
          <LuClipboardList aria-hidden="true" />
          {t('模擬試験を開始', 'Start mock exam')}
        </Button>
        <p className="text-sm text-on-surface-variant">
          {t('時間切れで自動的に提出します。', 'Time running out hands the paper in.')}
        </p>
      </section>

      <section className="space-y-3 border-t border-outline-variant pt-5">
        <h3 className="font-medium">{t('学習の状況', 'Progress')}</h3>
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          {[
            [t('未学習', 'New'), summary.unseen],
            [t('学習中', 'Learning'), summary.learning],
            [t('習得済み', 'Learnt'), summary.mastered],
          ].map(([name, count]) => (
            <div key={String(name)} className="flex items-baseline gap-2">
              <dt className="text-sm text-on-surface-variant">{name}</dt>
              <dd className="text-2xl font-medium tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
        {Object.keys(summary.byArea).length > 0 && (
          <table className="w-full text-sm">
            <caption className="py-1 text-left text-on-surface-variant">
              {t('これまでの分野別正答率', 'Rate so far, by area')}
            </caption>
            <tbody className="divide-y divide-outline-variant">
              {areas
                .filter((area) => summary.byArea[area])
                .map((area) => {
                  const tally = summary.byArea[area] ?? { total: 0, correct: 0 };
                  return (
                    <tr key={area}>
                      <th scope="row" className="py-2 text-left font-normal">
                        {label(areaLabels[area], language)}
                      </th>
                      <td className="py-2 text-right tabular-nums">
                        {tally.correct} / {tally.total}
                      </td>
                      <td className="w-16 py-2 text-right tabular-nums">{percent(tally.correct, tally.total)}%</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
        <p className="text-sm text-on-surface-variant">
          {t(
            `間違えた問題は復習に入り、${MASTERED_BOX} 回続けて正解すると習得済みになります。`,
            `A missed question goes into review until you get it right ${MASTERED_BOX} times in a row.`,
          )}
        </p>
        {Object.keys(progress).length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              if (
                window.confirm(t('復習と習得の記録をすべて消しますか？', 'Clear the whole review and progress record?'))
              )
                store.resetProgress();
            }}
          >
            {t('学習の記録を消す', 'Clear progress')}
          </Button>
        )}
      </section>
      {language === 'en' && (
        <p className="text-sm text-on-surface-variant">Questions, choices and explanations are in Japanese.</p>
      )}
    </div>
  );

  const body = (() => {
    if (!session) return settings;
    if (session.finished && score)
      return (
        <SessionResults
          session={session}
          score={score}
          language={language}
          onRetryMissed={session.mode === 'mock' ? null : () => begin(() => store.startWith(score.missed))}
          onBack={() => {
            store.exit();
            window.requestAnimationFrame(() => startButton.current?.focus());
          }}
        />
      );
    if (session.mode === 'mock')
      return (
        <MockRun
          session={session}
          title={modeTitle}
          remaining={remaining}
          language={language}
          onAnswer={answerMock}
          onGoTo={store.goTo}
          onFlag={store.toggleFlag}
          onFinish={() => today && store.finish(today)}
          onQuit={leave}
        />
      );
    return (
      <PracticeRun
        session={session}
        title={modeTitle}
        language={language}
        onAnswer={answerPractice}
        onAdvance={() => {
          store.advance();
          window.requestAnimationFrame(() => bringIntoView(card.current));
        }}
        onQuit={leave}
        nextRef={nextButton}
      />
    );
  })();

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('license-exam').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language, 'record') : ''}
      </p>
      <div lang={language} className="mx-auto max-w-3xl space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} subject="record" />
        <StudyProgress language={language} />
        <Card
          ref={card}
          variant="outlined"
          className="scroll-mt-[calc(var(--labs-bar-height,4rem)+1rem)] overflow-hidden rounded-md"
        >
          {body}
        </Card>

        <ConditionSection
          id="license-exam-sources"
          title={t('出典と試験の形式', 'Sources and exam format')}
          summary={t(
            `法令・警察庁通達・環境省資料・都道府県の案内（${STUDY_SOURCES_CHECKED_ON} 確認）`,
            `Statutes, the police circular, Ministry of the Environment guidance and prefectural notices (checked ${STUDY_SOURCES_CHECKED_ON})`,
          )}
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
            <li>
              {t(
                `狩猟免許試験の知識試験は、法令・猟具・鳥獣・鳥獣の保護及び管理について行い、70% 以上で合格です（規則第 54 条）。三肢択一 ${mockQuestionCount(MOCK_BLUEPRINTS.hunting)} 問・90 分と分野ごとの問題数は高知県の案内、一部免除者の猟具 10 問・30 分は東京都の案内によります。形式は都道府県によって異なることがあります。`,
                'The hunting licence knowledge test covers law, gear, wildlife and wildlife management, with 70% to pass (regulation art. 54). The 30 three-way questions, 90 minutes and the split by area follow Kochi Prefecture’s notice; the 10 gear questions in 30 minutes for existing licence holders follow Tokyo’s. Prefectures may differ.',
              )}
            </li>
            <li>
              {t(
                '猟銃等講習会の考査は、正誤式 50 問・60 分・45 点以上で合格と警察庁の通達が定めています。分野ごとの問題数は同通達の出題基準（別添1）の配点です。',
                'The firearms course test is 50 true-or-false questions in 60 minutes with 45 to pass, as the National Police Agency circular sets it; the split by area follows its syllabus weights (appendix 1).',
              )}
            </li>
            <li>
              {t(
                '法令の問題は「狩猟・銃砲の法令テスト」の鳥獣保護管理法の問題を三肢にしたものです。ほかの問題は下の資料によります。',
                'Law questions are the law quiz’s wildlife questions cut to three choices. The others follow the documents below.',
              )}
            </li>
          </ul>
          <ul className="space-y-2 text-sm text-on-surface-variant">
            {(Object.keys(STUDY_SOURCES) as (keyof typeof STUDY_SOURCES)[]).map((key) => {
              const reference = STUDY_SOURCES[key];
              return (
                <li key={key} lang="ja">
                  <a href={reference.url} target="_blank" rel="noreferrer" className="underline">
                    {reference.name}
                  </a>
                  （{reference.publisher}、{reference.version}）
                </li>
              );
            })}
          </ul>
        </ConditionSection>
        <div className="space-y-2 text-sm text-on-surface-variant">
          <p role="status">
            {storageAvailable
              ? ''
              : t(
                  'このブラウザーでは保存できません。再読み込みすると最初からになります。',
                  'This browser cannot save anything. Reloading starts over.',
                )}
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
