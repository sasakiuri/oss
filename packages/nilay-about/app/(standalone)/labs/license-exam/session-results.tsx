'use client';

import { useEffect, useRef } from 'react';
import { LuRotateCcw } from 'react-icons/lu';

import { Button } from '@/components/ui';
import { mockBlueprint, type SessionScore, type StudyArea, type StudySession } from '@/lib/license-exam';
import type { Language } from '@/store';

import { areaLabels, label, SourceLine } from './labels';
import { studyQuestionsById } from './questions';

const percent = (correct: number, total: number) => (total ? Math.round((correct / total) * 100) : 0);

/** The score, the verdict of a mock, the rate per area and the questions that were missed. */
export function SessionResults({
  session,
  score,
  language,
  onRetryMissed,
  onBack,
}: {
  session: StudySession;
  score: SessionScore;
  language: Language;
  onRetryMissed: (() => void) | null;
  onBack: () => void;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const heading = useRef<HTMLHeadingElement>(null);
  const blueprint = session.mode === 'mock' ? mockBlueprint(session.exam, session.partial) : null;
  const passed = blueprint ? score.correct >= blueprint.passMark : null;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="space-y-6 p-5 sm:p-6">
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-medium">
        {session.mode === 'mock' ? t('模擬試験の結果', 'Mock exam results') : t('結果', 'Results')}
      </h2>
      <div className="space-y-2">
        <p>
          <span className="block text-sm text-on-surface-variant">{t('正答率', 'Score')}</span>
          <span className="block text-5xl font-medium tabular-nums">{percent(score.correct, score.total)}%</span>
        </p>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {[
            [t('正答', 'Correct'), `${score.correct} / ${score.total}`],
            [t('誤答', 'Wrong'), score.wrong],
            [t('未回答', 'No answer'), score.unanswered],
          ].map(([name, value]) => (
            <div key={String(name)} className="flex items-baseline gap-1.5">
              <dt className="text-on-surface-variant">{name}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {blueprint && passed !== null && (
        <p
          className={`rounded-sm p-4 font-medium ${passed ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-error-container text-on-error-container'}`}
        >
          {passed
            ? t(
                `合格基準（${blueprint.passMark} 問以上の正解）に達しています。`,
                `You reached the pass mark (${blueprint.passMark} correct).`,
              )
            : t(
                `合格基準（${blueprint.passMark} 問以上の正解）まであと ${blueprint.passMark - score.correct} 問です。`,
                `${blueprint.passMark - score.correct} short of the pass mark (${blueprint.passMark} correct).`,
              )}
        </p>
      )}
      <div className="space-y-2">
        <h3 className="font-medium">{t('分野別の正答率', 'By area')}</h3>
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th>{t('分野', 'Area')}</th>
              <th>{t('正答', 'Correct')}</th>
              <th>{t('正答率', 'Rate')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {(Object.entries(score.byArea) as [StudyArea, { total: number; correct: number }][]).map(
              ([area, tally]) => (
                <tr key={area}>
                  <th scope="row" className="py-2 text-left font-normal">
                    {label(areaLabels[area], language)}
                  </th>
                  <td className="py-2 text-right tabular-nums">
                    {tally.correct} / {tally.total}
                  </td>
                  <td className="w-16 py-2 text-right tabular-nums">{percent(tally.correct, tally.total)}%</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {onRetryMissed && score.missed.length > 0 && (
          <Button className="w-full sm:w-auto" onClick={onRetryMissed}>
            <LuRotateCcw aria-hidden="true" />
            {t(`間違えた ${score.missed.length} 問を解き直す`, `Retry the ${score.missed.length} missed`)}
          </Button>
        )}
        <Button variant="outline" className="w-full sm:w-auto" onClick={onBack}>
          {t('設定に戻る', 'Back to settings')}
        </Button>
      </div>
      {score.missed.length > 0 && (
        <div className="space-y-3 border-t border-outline-variant pt-5">
          <h3 className="font-medium">{t('間違えた問題', 'Missed questions')}</h3>
          <ul className="divide-y divide-outline-variant border-y border-outline-variant">
            {score.missed.map((id) => {
              const question = studyQuestionsById.get(id);
              const index = session.prompts.findIndex((prompt) => prompt.id === id);
              const given = session.answers[index] ?? null;
              if (!question) return null;
              return (
                <li key={id} className="space-y-2 py-4">
                  <p className="font-medium" lang="ja">
                    {question.question}
                  </p>
                  <p className="text-sm">
                    {t('正しい答え', 'Correct answer')}
                    {': '}
                    <span lang="ja">{question.answer}</span>
                  </p>
                  <p className="text-sm text-on-surface-variant">
                    {given === null ? (
                      t('未回答', 'No answer')
                    ) : (
                      <>
                        {t('選んだ答え：', 'You chose: ')}
                        <span lang="ja">{given}</span>
                      </>
                    )}
                  </p>
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
        </div>
      )}
    </div>
  );
}
