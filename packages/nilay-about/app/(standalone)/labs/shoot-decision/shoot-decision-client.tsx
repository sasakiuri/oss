'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LuArrowRight, LuCheck, LuCrosshair, LuPlay, LuShieldAlert, LuX } from 'react-icons/lu';

import { AppHeader, AppLayout, ConditionSection, LanguageMenu, StudyProgress } from '@/components/labs';
import { Button, Card, Progress } from '@/components/ui';
import { labsTool } from '@/lib/labs-tools';
import {
  isSceneAnswerCorrect,
  shootReasons,
  shuffleScenes,
  type Scene,
  type SceneAnswer,
  type ShootReason,
} from '@/lib/shoot-decision';
import { rehydrateLanguage, useLanguage, useSetLanguage, useStudyLogStore } from '@/store';

import { STUDY_SOURCES, STUDY_SOURCES_CHECKED_ON } from '../license-exam/sources';

import { ScenePicture } from './scene-picture';
import { reasonLabels, scenes } from './scenes';
import { Vitals } from './vitals';

const holdReasons = shootReasons.filter((reason): reason is Exclude<ShootReason, 'shoot'> => reason !== 'shoot');

function SceneSources({ scene }: { scene: Scene }) {
  return (
    <p className="text-xs text-on-surface-variant">
      根拠:{' '}
      {scene.sources.map((source, index) => {
        const reference = STUDY_SOURCES[source.doc];
        return (
          <span key={`${source.doc}-${source.locator}`} lang="ja">
            {index > 0 && '、'}
            {reference.short} {source.locator}（
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

export function ShootDecisionClient() {
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const recordStudy = useStudyLogStore((state) => state.recordStudy);
  const markStudied = useCallback(() => void recordStudy(), [recordStudy]);
  const [ready, setReady] = useState(false);
  const [order, setOrder] = useState<Scene[] | null>(null);
  const [answers, setAnswers] = useState<SceneAnswer[]>([]);
  const [holding, setHolding] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const firstButton = useRef<HTMLButtonElement>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void rehydrateLanguage().then(() => setReady(true));
  }, []);

  const index = revealed ? answers.length - 1 : answers.length;
  const scene = order?.[index];
  const finished = order !== null && answers.length === order.length && !revealed;
  const given = revealed ? answers[answers.length - 1] : undefined;
  const correct = scene && given ? isSceneAnswerCorrect(scene, given) : false;

  useEffect(() => {
    firstButton.current?.focus({ preventScroll: true });
  }, [index, holding, revealed]);

  const start = () => {
    setOrder(shuffleScenes(scenes));
    setAnswers([]);
    setHolding(false);
    setRevealed(false);
  };

  const answer = (value: SceneAnswer) => {
    setAnswers((list) => [...list, value]);
    setHolding(false);
    setRevealed(true);
    markStudied();
  };

  const score = order
    ? answers.filter((value, position) => order[position] && isSceneAnswerCorrect(order[position], value)).length
    : 0;

  const practice = (() => {
    if (order === null)
      return (
        <div className="space-y-4 p-5 sm:p-6">
          <h2 className="text-xl font-medium">{t('撃つか撃たないかの判断', 'Shoot or hold')}</h2>
          <p className="text-sm text-on-surface-variant">
            {t(
              `シカ・イノシシ・クマに出会った ${scenes.length} の場面で、撃つか、撃たないならその理由を選びます。`,
              `${scenes.length} scenes with deer, wild boar and bears. Shoot, or say why not.`,
            )}
          </p>
          <Button className="w-full sm:w-auto" onClick={start}>
            <LuPlay aria-hidden="true" />
            {t('練習を開始', 'Start')}
          </Button>
        </div>
      );
    if (finished)
      return (
        <div className="space-y-4 p-5 sm:p-6">
          <h2 className="text-2xl font-medium">{t('結果', 'Results')}</h2>
          <p className="text-5xl font-medium tabular-nums">
            {score} / {order.length}
          </p>
          <ul className="divide-y divide-outline-variant border-y border-outline-variant text-sm">
            {order.map((item, position) => {
              const value = answers[position];
              if (!value || isSceneAnswerCorrect(item, value)) return null;
              return (
                <li key={item.id} className="space-y-1 py-3">
                  <p lang="ja">{item.situation}</p>
                  <p className="font-medium">
                    {t('正解', 'Answer')}:{' '}
                    <span lang="ja">{t(reasonLabels[item.answer].ja, reasonLabels[item.answer].en)}</span>
                  </p>
                </li>
              );
            })}
          </ul>
          <Button onClick={start}>{t('もう一度', 'Again')}</Button>
        </div>
      );
    if (!scene) return null;
    return (
      <>
        <div className="flex items-center justify-between gap-2 p-4 sm:px-6">
          <span className="text-sm font-medium">{t('判断の練習', 'Shoot or hold')}</span>
          <span className="text-sm tabular-nums">
            {index + 1} / {order.length}
          </span>
        </div>
        <Progress
          value={(answers.length / order.length) * 100}
          className="rounded-none"
          aria-label={t('進み具合', 'Progress')}
        />
        <div className="space-y-4 p-5 sm:p-6">
          <ScenePicture scene={scene} />
          <h2 className="text-lg font-medium" lang="ja">
            {scene.situation}
          </h2>
          {!revealed ? (
            !holding ? (
              <div className="grid grid-cols-2 gap-3" role="group" aria-label={t('判断', 'Decision')}>
                <Button
                  ref={firstButton}
                  className="min-h-14 text-base"
                  onClick={() => answer({ shoot: true, reason: null })}
                >
                  <LuCrosshair aria-hidden="true" />
                  {t('撃つ', 'Shoot')}
                </Button>
                <Button variant="outline" className="min-h-14 text-base" onClick={() => setHolding(true)}>
                  <LuShieldAlert aria-hidden="true" />
                  {t('撃たない', 'Hold')}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-medium">{t('撃たない理由は？', 'Why not?')}</p>
                <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={t('撃たない理由', 'Reasons')}>
                  {holdReasons.map((reason, position) => (
                    <Button
                      key={reason}
                      ref={position === 0 ? firstButton : undefined}
                      variant="outline"
                      lang="ja"
                      className="h-auto min-h-12 justify-start whitespace-normal px-4 py-2 text-left"
                      onClick={() => answer({ shoot: false, reason })}
                    >
                      {reasonLabels[reason].ja}
                    </Button>
                  ))}
                </div>
                <Button variant="ghost" onClick={() => setHolding(false)}>
                  {t('戻る', 'Back')}
                </Button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <p
                className={`flex items-center gap-2 text-lg font-medium ${correct ? 'text-primary' : 'text-destructive'}`}
              >
                {correct ? <LuCheck aria-hidden="true" /> : <LuX aria-hidden="true" />}
                {correct ? t('正解', 'Correct') : t('不正解', 'Wrong')}
              </p>
              <div className="rounded-sm bg-surface-container p-4">
                <p className="text-sm font-medium">
                  {t('正しい判断', 'Right call')}: <span lang="ja">{reasonLabels[scene.answer].ja}</span>
                </p>
                <p className="mt-2 text-sm text-on-surface-variant" lang="ja">
                  {scene.explanation}
                </p>
              </div>
              <SceneSources scene={scene} />
              <Button ref={firstButton} className="w-full" onClick={() => setRevealed(false)}>
                <LuArrowRight aria-hidden="true" />
                {answers.length >= order.length ? t('結果を見る', 'See results') : t('次の場面へ', 'Next scene')}
              </Button>
            </div>
          )}
        </div>
      </>
    );
  })();

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('shoot-decision').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <div lang={language} className="mx-auto max-w-3xl space-y-6" inert={!ready} aria-busy={!ready}>
        <StudyProgress language={language} />
        <Card variant="outlined" className="overflow-hidden rounded-md">
          {practice}
        </Card>
        <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
          <h2 className="text-xl font-medium">{t('急所の位置', 'Where to aim')}</h2>
          <Vitals language={language} onTried={markStudied} />
        </Card>
        <ConditionSection
          id="shoot-decision-sources"
          title={t('出典', 'Sources')}
          summary={t(
            `法令・警察庁通達・環境省と北海道の資料（${STUDY_SOURCES_CHECKED_ON} 確認）`,
            `Statutes, the police circular and government guidance (checked ${STUDY_SOURCES_CHECKED_ON})`,
          )}
        >
          <ul className="space-y-2 text-sm text-on-surface-variant">
            {(['act', 'regulation', 'npaCourse', 'moeCapture', 'moeEmergency', 'hokkaidoDeer'] as const).map((key) => {
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
        <p className="text-sm text-on-surface-variant">
          {t('猟場で少しでも迷ったら撃たないでください。', 'In the field, when in doubt, do not shoot.')}
        </p>
      </div>
    </AppLayout>
  );
}
