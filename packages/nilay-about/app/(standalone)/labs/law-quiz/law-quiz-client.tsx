'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LuArrowRight, LuCheck, LuPlay, LuRotateCcw, LuSkipForward, LuX } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  SegmentedControl,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card, Progress } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { currentPrompt, isSessionComplete, questionsInScope, type QuizPrompt } from '@/lib/law-quiz';
import {
  lawQuizCategories,
  lawQuizCategoryFamily,
  lawQuizFamilies,
  type LawQuizCategory,
  type LawQuizFamily,
  type LawQuizScope,
} from '@/lib/schemas/law-quiz';
import { rehydrateLanguage, useLanguage, useSetLanguage, type Language } from '@/store';

import { sessionScore, storageKey, useLawQuizStore } from './_store';
import {
  LAW_REFERENCES,
  LAW_TEXT_CHECKED_ON,
  lawQuestionCountByCategory,
  lawQuestions,
  lawQuestionsById,
  type LawQuestion,
} from './questions';

/** The counts offered. Anything above the questions in scope falls back to all of them. */
const QUESTION_COUNTS = [5, 10, 20] as const;

const categoryLabels: Record<LawQuizCategory, { ja: string; en: string }> = {
  basics: { ja: '狩猟の基本', en: 'Hunting basics' },
  licence: { ja: '狩猟免許と狩猟者登録', en: 'Licence and registration' },
  areas: { ja: '区域と期間の制限', en: 'Areas and seasons' },
  methods: { ja: '猟法の制限', en: 'Hunting methods' },
  safety: { ja: '銃猟の制限と安全', en: 'Shooting restrictions' },
  duties: { ja: '捕獲後の義務・報告・罰則', en: 'Duties, reports and penalties' },
  possession: { ja: '銃砲の所持と許可', en: 'Gun permits' },
  keeping: { ja: '所持許可後の義務と保管', en: 'Permit holder duties and storage' },
  range: { ja: '射撃場と射撃練習', en: 'Ranges and practice' },
  powder: { ja: '火薬類の取扱い', en: 'Handling explosives' },
  ammunition: { ja: '実包の譲受けと消費', en: 'Buying and using cartridges' },
  manufacture: { ja: '猟銃等の製造と販売', en: 'Making and selling guns' },
};

/** Group headings in the scope list. */
const familyLabels: Record<LawQuizFamily, { ja: string; en: string }> = {
  wildlife: { ja: '鳥獣保護管理法', en: 'Wildlife Protection and Hunting Management Act' },
  firearms: { ja: '銃刀法', en: 'Firearms and Swords Control Act' },
  explosives: { ja: '火薬類取締法', en: 'Explosives Control Act' },
  arms: { ja: '武器等製造法', en: 'Arms Manufacturing Act' },
};

const scopeLabel = (scope: LawQuizScope, language: Language): string => {
  if (scope === 'all') return language === 'ja' ? 'すべて' : 'All areas';
  const labels =
    scope in familyLabels ? familyLabels[scope as LawQuizFamily] : categoryLabels[scope as LawQuizCategory];
  return language === 'ja' ? labels.ja : labels.en;
};

interface SelectOption {
  value: string;
  label: string;
  /** Rendered as an optgroup label. */
  group?: string;
}

function SelectField({
  label,
  value,
  onChange,
  options,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  // Groups in first-use order.
  const groups = [...new Set(options.map((option) => option.group))];
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={fieldId} className="block text-sm font-medium">
        {label}
      </label>
      <select id={fieldId} value={value} onChange={(event) => onChange(event.target.value)}>
        {groups.map((group) => {
          const inGroup = options.filter((option) => option.group === group);
          const items = inGroup.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ));
          return group === undefined ? (
            items
          ) : (
            <optgroup key={group} label={group}>
              {items}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}

/** The articles a question is based on, cited in Japanese. */
function SourceLine({ question, language }: { question: LawQuestion; language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <p className="text-xs text-on-surface-variant">
      {t('根拠', 'Source')}: {/* Short name as cited in the explanation, then the full name linking to the text. */}
      {question.sources.map((source, index) => {
        const reference = LAW_REFERENCES[source.law];
        return (
          <span key={`${source.law}-${source.article}`} lang="ja">
            {index > 0 && '、'}
            {reference.short}
            {source.article}（
            <a href={reference.url} target="_blank" rel="noreferrer" className="underline">
              {reference.name}
            </a>
            ）
          </span>
        );
      })}
    </p>
  );
}

/** Scrolls a new screen of the run to its top. */
function bringIntoView(element: HTMLElement | null) {
  if (!element) return;
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--labs-bar-height')) || 64;
  if (element.getBoundingClientRect().top < bar) element.scrollIntoView({ block: 'start' });
}

export function LawQuizClient() {
  const { options, session, reviewIds, setScope, setQuestionCount, start, startReview, answer, advance, exit } =
    useLawQuizStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const firstChoice = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // The question a reload resumed at.
  const [resumedIndex, setResumedIndex] = useState<number | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useLawQuizStore.persist.rehydrate(), rehydrateLanguage()]).then(() => {
      const saved = useLawQuizStore.getState().session;
      if (saved && !isSessionComplete(saved))
        setResumedIndex(saved.revealed ? saved.answers.length - 1 : saved.answers.length);
      setReady(true);
    });
  }, []);

  const bringCardIntoView = () => bringIntoView(card.current);

  const complete = session !== null && isSessionComplete(session) && !session.revealed;
  const answeredIndex = session ? session.answers.length - 1 : -1;
  // The answered question while its answer is shown, otherwise the next one.
  const shownPrompt: QuizPrompt | null = session
    ? session.revealed
      ? (session.prompts[answeredIndex] ?? null)
      : currentPrompt(session)
    : null;
  const shownQuestion = shownPrompt ? (lawQuestionsById.get(shownPrompt.id) ?? null) : null;
  const shownIndex = session ? (session.revealed ? answeredIndex : session.answers.length) : -1;
  const givenAnswer = session && session.revealed ? (session.answers[answeredIndex] ?? null) : null;
  const wasCorrect = shownQuestion !== null && givenAnswer === shownQuestion.answer;
  const score = sessionScore(session);

  useEffect(() => {
    if (session && !session.revealed && !isSessionComplete(session))
      firstChoice.current?.focus({ preventScroll: true });
  }, [session]);

  useEffect(() => {
    if (!complete) return;
    bringIntoView(card.current);
    resultsHeading.current?.focus({ preventScroll: true });
  }, [complete]);

  // Screen reader text: the verdict after an answer, the tally at the end.
  const spoken = (() => {
    if (session === null) return '';
    if (complete && score)
      return t(
        `テスト終了。${session.prompts.length} 問中 ${score.correct} 問正解、誤答 ${score.wrong} 問、未回答 ${score.unanswered} 問です。`,
        `Quiz finished. ${score.correct} of ${session.prompts.length} correct, ${score.wrong} wrong and ${score.unanswered} unanswered.`,
      );
    if (session.revealed && shownQuestion)
      return t(
        `${wasCorrect ? '正解' : givenAnswer === null ? '未回答' : '不正解'}。正しい答えは「${shownQuestion.answer}」です。`,
        `${wasCorrect ? 'Correct' : givenAnswer === null ? 'No answer' : 'Wrong'}. The answer is ${shownQuestion.answer}.`,
      );
    return '';
  })();

  useEffect(() => {
    // Deferred: a status region changed in the same commit as the page is not reliably announced.
    const timer = window.setTimeout(() => setAnnouncement(spoken), 150);
    return () => window.clearTimeout(timer);
  }, [spoken]);

  const countLabel = (name: { ja: string; en: string }, count: number) =>
    t(`${name.ja}（${count} 問）`, `${name.en} (${count})`);
  // One group per act: the whole act first, then its areas.
  const scopeOptions = [
    {
      value: 'all',
      label: t(`すべて（${lawQuestions.length} 問）`, `All areas (${lawQuestions.length})`),
    },
    ...lawQuizFamilies.flatMap((family) => {
      const group = t(familyLabels[family].ja, familyLabels[family].en);
      const categories = lawQuizCategories.filter((category) => lawQuizCategoryFamily[category] === family);
      const whole = categories.reduce((sum, category) => sum + lawQuestionCountByCategory[category], 0);
      return [
        // Skip the whole-act option when the act has one area.
        ...(categories.length > 1
          ? [
              {
                value: family,
                group,
                label: countLabel({ ja: `${familyLabels[family].ja}のすべて`, en: 'All of this act' }, whole),
              },
            ]
          : []),
        ...categories.map((category) => ({
          value: category,
          group,
          label: countLabel(categoryLabels[category], lawQuestionCountByCategory[category]),
        })),
      ];
    }),
  ];

  const available = questionsInScope(lawQuestions, options.scope).length;
  const countOptions = [
    ...QUESTION_COUNTS.filter((count) => count < available).map((count) => ({
      value: String(count),
      label: t(`${count} 問`, `${count}`),
    })),
    { value: 'all', label: t(`全 ${available} 問`, `All ${available}`) },
  ];
  const selectedCount =
    options.questionCount !== null && options.questionCount < available ? String(options.questionCount) : 'all';

  // The pressed choice unmounts, so focus moves to the next button. Only a key press (`detail` 0) scrolls to it.
  const answerWith = (choice: string | null, byKeyboard: boolean) => {
    answer(choice);
    window.requestAnimationFrame(() => {
      bringCardIntoView();
      nextButton.current?.focus({ preventScroll: !byKeyboard });
    });
  };

  const begin = (draw: () => void) => {
    draw();
    setResumedIndex(null);
    window.requestAnimationFrame(bringCardIntoView);
  };

  const goOn = () => {
    advance();
    window.requestAnimationFrame(bringCardIntoView);
  };

  const leaveQuiz = () => {
    if (
      session &&
      session.answers.length > 0 &&
      !window.confirm(
        t('ここまでの回答は残りません。テストをやめますか？', 'Your answers so far will be lost. Quit the quiz?'),
      )
    )
      return;
    exit();
    setResumedIndex(null);
    // The pressed button unmounts, so focus the start button.
    window.requestAnimationFrame(() => startButton.current?.focus());
  };

  const intro = (
    <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
      <h2 className="text-xl font-medium">{t('出題の設定', 'Quiz settings')}</h2>
      <SelectField
        id="law-quiz-scope"
        label={t('分野', 'Area')}
        value={options.scope}
        onChange={(value) => setScope(value as LawQuizScope)}
        options={scopeOptions}
      />
      <SegmentedControl
        legend={t('出題数', 'Number of questions')}
        orientation="inline"
        value={selectedCount}
        options={countOptions}
        onChange={(value) => setQuestionCount(value === 'all' ? null : Number(value))}
      />
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Button ref={startButton} className="w-full sm:w-auto" onClick={() => begin(start)}>
          <LuPlay aria-hidden="true" />
          {t('テストを開始', 'Start quiz')}
        </Button>
        {reviewIds.length > 0 && (
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => begin(() => startReview())}>
            <LuRotateCcw aria-hidden="true" />
            {t(`要復習の ${reviewIds.length} 問だけ解く`, `Review ${reviewIds.length} marked questions`)}
          </Button>
        )}
      </div>
      {reviewIds.length > 0 && (
        <p className="text-sm text-on-surface-variant">
          {t(
            '誤答・未回答の問題は「要復習」に残ります。正答しても消えません。',
            'Missed and skipped questions stay marked for review, even after a correct answer.',
          )}
        </p>
      )}
      {language === 'en' && (
        <p className="text-sm text-on-surface-variant">Questions, choices and explanations are in Japanese.</p>
      )}
    </Card>
  );

  const run = session && shownPrompt && shownQuestion && (
    <Card
      ref={card}
      variant="outlined"
      className="scroll-mt-[calc(var(--labs-bar-height,4rem)+1rem)] overflow-hidden rounded-md"
    >
      <div className="flex items-center justify-between gap-2 p-4 sm:px-6">
        <span className="min-w-0 flex-1 text-sm font-medium">{scopeLabel(session.scope, language)}</span>
        <span className="text-sm tabular-nums">
          {shownIndex + 1} / {session.prompts.length}
        </span>
        <Button variant="ghost" size="sm" className="shrink-0 px-3" onClick={leaveQuiz}>
          {t('やめる', 'Quit')}
        </Button>
      </div>
      <Progress
        value={(session.answers.length / session.prompts.length) * 100}
        className="rounded-none"
        aria-label={t('テストの進み具合', 'Quiz progress')}
      />
      <div className="space-y-5 p-5 sm:p-6">
        {resumedIndex === shownIndex && (
          <p className="text-sm text-on-surface-variant">
            {t('前回の続きから再開しています。', 'Resumed where you left off.')}
          </p>
        )}
        <h2 className="text-lg font-medium sm:text-xl" lang="ja">
          {shownQuestion.question}
        </h2>
        {!session.revealed ? (
          <>
            <div className="grid gap-3" role="group" aria-label={t('選択肢', 'Choices')}>
              {shownPrompt.choices.map((choice, index) => (
                <Button
                  key={choice}
                  ref={index === 0 ? firstChoice : undefined}
                  variant="outline"
                  lang="ja"
                  className="h-auto min-h-14 justify-start whitespace-normal px-4 py-3 text-left text-base"
                  onClick={(event) => answerWith(choice, event.detail === 0)}
                >
                  {choice}
                </Button>
              ))}
            </div>
            <Button variant="ghost" className="w-full" onClick={(event) => answerWith(null, event.detail === 0)}>
              <LuSkipForward aria-hidden="true" />
              {t('わからない（未回答で次へ）', 'Not sure (skip)')}
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            <p
              className={`flex items-center gap-2 text-lg font-medium ${wasCorrect ? 'text-primary' : 'text-destructive'}`}
            >
              {wasCorrect ? <LuCheck aria-hidden="true" /> : <LuX aria-hidden="true" />}
              {wasCorrect
                ? t('正解', 'Correct')
                : givenAnswer === null
                  ? t('未回答', 'No answer')
                  : t('不正解', 'Wrong')}
            </p>
            {!wasCorrect && givenAnswer !== null && (
              <p className="text-sm text-on-surface-variant">
                {t('選んだ答え：', 'You chose: ')}
                <span lang="ja">{givenAnswer}</span>
              </p>
            )}
            <div className="rounded-sm bg-surface-container p-4">
              <p className="text-sm font-medium">
                {t('正しい答え', 'Correct answer')}
                {': '}
                <span lang="ja">{shownQuestion.answer}</span>
              </p>
              <p className="mt-2 text-sm text-on-surface-variant" lang="ja">
                {shownQuestion.explanation}
              </p>
            </div>
            <SourceLine question={shownQuestion} language={language} />
            <Button ref={nextButton} className="w-full" onClick={goOn}>
              <LuArrowRight aria-hidden="true" />
              {session.answers.length >= session.prompts.length
                ? t('結果を見る', 'See results')
                : t('次の問題へ', 'Next question')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );

  const missedCount = score?.missed.length ?? 0;
  const results = session && complete && score && (
    <div className="space-y-6">
      <Card
        ref={card}
        variant="outlined"
        className="scroll-mt-[calc(var(--labs-bar-height,4rem)+1rem)] space-y-5 rounded-md p-5 sm:p-6"
      >
        <h2 ref={resultsHeading} tabIndex={-1} className="text-2xl font-medium">
          {t('テスト結果', 'Quiz results')}
        </h2>
        <div className="space-y-2">
          <p>
            <span className="block text-sm text-on-surface-variant">{t('正答率', 'Score')}</span>
            <span className="block text-5xl font-medium tabular-nums">
              {Math.round((score.correct / session.prompts.length) * 100)}%
            </span>
          </p>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {[
              [t('正答', 'Correct'), score.correct],
              [t('誤答', 'Wrong'), score.wrong],
              [t('未回答', 'No answer'), score.unanswered],
            ].map(([label, count]) => (
              <div key={String(label)} className="flex items-baseline gap-1.5">
                <dt className="text-on-surface-variant">{label}</dt>
                <dd className="font-medium tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          {missedCount > 0 && (
            <Button
              className="w-full sm:w-auto"
              onClick={() => begin(() => startReview(score.missed.map((missed) => missed.id)))}
            >
              <LuRotateCcw aria-hidden="true" />
              {t(`間違えた ${missedCount} 問をもう一度`, `Retry the ${missedCount} you missed`)}
            </Button>
          )}
          <Button
            variant={missedCount > 0 ? 'outline' : 'default'}
            className="w-full sm:w-auto"
            onClick={() => begin(start)}
          >
            {t('同じ設定でもう一度', 'Retry with the same settings')}
          </Button>
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => exit()}>
            {t('出題の設定に戻る', 'Back to settings')}
          </Button>
        </div>
      </Card>
      {missedCount > 0 && (
        <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
          <h3 className="text-lg font-medium">{t('間違えた問題', 'Missed questions')}</h3>
          <ul className="divide-y divide-outline-variant border-y border-outline-variant">
            {score.missed.map((missed) => {
              const question = lawQuestionsById.get(missed.id);
              if (!question) return null;
              return (
                <li key={missed.id} className="space-y-2 py-4">
                  <p className="font-medium" lang="ja">
                    {question.question}
                  </p>
                  <p className="text-sm">
                    {t('正しい答え', 'Correct answer')}
                    {': '}
                    <span lang="ja">{question.answer}</span>
                  </p>
                  {missed.choice !== null && (
                    <p className="text-sm text-on-surface-variant">
                      {t('選んだ答え：', 'You chose: ')}
                      <span lang="ja">{missed.choice}</span>
                    </p>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer py-1 text-primary">
                      {t('解説と根拠', 'Explanation and source')}
                    </summary>
                    <div className="mt-2 space-y-2">
                      <p className="text-on-surface-variant" lang="ja">
                        {question.explanation}
                      </p>
                      <SourceLine question={question} language={language} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('law-quiz').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      {/* Mounted empty: a status region inserted with text is not announced. Separate regions so the
          notice is not repeated with each announcement. */}
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement}
      </p>
      <div lang={language} className="mx-auto max-w-3xl space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        {session === null ? intro : complete ? results : run}

        <ConditionSection
          id="law-quiz-sources"
          title={t('出典', 'Sources')}
          summary={t(
            `鳥獣保護管理法・銃刀法・火薬類取締法・武器等製造法とその政省令（${LAW_TEXT_CHECKED_ON} 時点）`,
            `The four acts and their orders and regulations, as of ${LAW_TEXT_CHECKED_ON}`,
          )}
        >
          <p className="text-sm text-on-surface-variant">
            {t(
              `${LAW_TEXT_CHECKED_ON} に e-Gov 法令検索で確認した条文から出題しています。その後の改正は反映していません。`,
              `Questions are based on the text on e-Gov 法令検索 as of ${LAW_TEXT_CHECKED_ON}. Later amendments are not reflected.`,
            )}
          </p>
          <ul className="space-y-2 text-sm text-on-surface-variant">
            {(Object.keys(LAW_REFERENCES) as (keyof typeof LAW_REFERENCES)[]).map((key) => {
              const reference = LAW_REFERENCES[key];
              return (
                <li key={key} lang="ja">
                  <a href={reference.url} target="_blank" rel="noreferrer" className="underline">
                    {reference.name}
                  </a>
                  （{reference.number}）— {reference.revision}
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-on-surface-variant">
            {t(
              '鳥獣保護管理法の分野の解説では、「法」は同法、「規則」は同法施行規則を指します。',
              'In the wildlife areas, 法 and 規則 in an explanation mean the Wildlife Protection and Hunting Management Act and its enforcement regulation.',
            )}
          </p>
          <p className="text-sm text-on-surface-variant">
            {t(
              '狩猟期間の短縮、捕獲数の制限、区域の指定などは都道府県が定めます。銃砲の所持許可や実包の譲受けの運用も、都道府県公安委員会ごとに異なります。',
              'Shortened seasons, bag limits and designated areas are set by each prefecture, and gun permits and cartridge purchases are handled differently by each public safety commission.',
            )}
          </p>
        </ConditionSection>
        <div className="space-y-2 text-sm text-on-surface-variant">
          <p>
            {t(
              '狩猟免許試験や猟銃等講習会の考査の再現ではありません。狩猟や射撃をする地域の規制を確認してください。',
              'This is not the hunting licence exam or the firearms course test. Check the rules where you hunt or shoot.',
            )}
          </p>
          <p role="status">
            {storageAvailable
              ? t(
                  '設定、途中経過、要復習の記録はこのブラウザーに保存されます。',
                  'Settings, progress and review marks are saved in this browser.',
                )
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
