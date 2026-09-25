'use client';

import { useEffect, useState } from 'react';

import { AppHeader, AppLayout, ConditionSection, LanguageMenu, SegmentedControl, ToolLayout } from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { BUTCHERING_GUIDELINE, BUTCHERING_STAGES, BUTCHERING_STEPS_CHECKED_ON } from '@/lib/butchering-steps';
import {
  GAME_CUTS,
  GAME_CUTS_CHECKED_ON,
  GAME_CUTS_SOURCES,
  type GameCutId,
  type GameCutSpecies,
} from '@/lib/game-cuts';
import { labsTool } from '@/lib/labs-tools';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

/**
 * A schematic of the carcass seen from the side, head to the left, drawn for this page. It places the
 * cuts roughly where the chart draws them; the chart itself is the reference for where to cut.
 */
const REGIONS: Record<GameCutSpecies, Partial<Record<GameCutId, string>>> = {
  deer: {
    neck: 'M30 70 L95 58 L100 128 L42 120 Z',
    shoulder: 'M95 58 L150 58 L150 150 L100 150 L100 128 Z',
    loin: 'M150 58 L280 58 L280 150 L150 150 Z',
    leg: 'M280 58 L325 62 L345 110 L330 150 L280 150 Z',
    shank: 'M300 150 L330 150 L326 205 L306 205 Z',
    foreShank: 'M108 150 L138 150 L134 205 L114 205 Z',
  },
  boar: {
    neck: 'M30 70 L95 58 L100 128 L42 120 Z',
    shoulderLoin: 'M95 58 L165 58 L165 95 L97 95 Z',
    shoulder: 'M97 95 L165 95 L165 150 L100 150 Z',
    loin: 'M165 58 L280 58 L280 100 L165 100 Z',
    belly: 'M165 100 L280 100 L280 150 L165 150 Z',
    leg: 'M280 58 L325 62 L345 110 L330 150 L280 150 Z',
    shank: 'M300 150 L330 150 L326 205 L306 205 Z',
    foreShank: 'M108 150 L138 150 L134 205 L114 205 Z',
  },
};

const LEG_PARTS: readonly GameCutId[] = ['outsideLeg', 'knuckle', 'insideLeg'];

export function ButcheringGuideClient() {
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const [ready, setReady] = useState(false);
  const [species, setSpecies] = useState<GameCutSpecies>('deer');
  const [selected, setSelected] = useState<GameCutId>('loin');
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void rehydrateLanguage().then(() => setReady(true));
  }, []);

  const cuts = GAME_CUTS[species];
  const cut = cuts.find((item) => item.id === selected) ?? cuts.find((item) => item.id === 'loin')!;
  // The three parts of the leg are drawn on the leg itself.
  const highlighted = LEG_PARTS.includes(cut.id) ? 'leg' : cut.id;
  const toggle = (id: string) =>
    setDone((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('butchering-guide').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <ToolLayout
          resultLabel={t('部位', 'Cut')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="cuts" className="text-xl font-medium">
                {t('部位の名前', 'Names of the cuts')}
              </h2>
              <SegmentedControl
                legend={t('動物', 'Animal')}
                orientation="inline"
                value={species}
                onChange={(value) => setSpecies(value as GameCutSpecies)}
                options={[
                  { value: 'deer', label: t('シカ', 'Deer') },
                  { value: 'boar', label: t('イノシシ', 'Wild boar') },
                ]}
              />
              <svg viewBox="0 0 380 220" className="w-full" aria-hidden="true">
                {Object.entries(REGIONS[species]).map(([id, path]) => (
                  <path
                    key={id}
                    d={path}
                    className={cn(
                      'stroke-[var(--md-sys-color-outline)] stroke-[1.5]',
                      id === highlighted
                        ? 'fill-[var(--md-sys-color-primary)]'
                        : 'fill-[var(--md-sys-color-surface-container-high)]',
                    )}
                  />
                ))}
              </svg>
              <p className="text-xs text-on-surface-variant">{t('模式図（頭は左）', 'Schematic, head to the left')}</p>
              <div role="group" aria-label={t('部位を選ぶ', 'Choose a cut')} className="flex flex-wrap gap-2">
                {cuts.map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={item.id === cut.id ? 'default' : 'outline'}
                    aria-pressed={item.id === cut.id}
                    onClick={() => setSelected(item.id)}
                  >
                    {item[language]}
                  </Button>
                ))}
              </div>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-3 rounded-md p-5 sm:p-6">
              <h2 id="cut" className="text-xl font-medium">
                {cut.ja}
                {language === 'en' && <span className="ml-2 text-base text-on-surface-variant">{cut.en}</span>}
              </h2>
              <p className="text-sm">{cut.boundary[language]}</p>
              {species === 'deer' && (
                <p className="text-xs text-on-surface-variant">
                  {t(
                    'シカのカットチャートにバラはありません。腹部の肉が少ないためで、多い個体はバラとして流通させてよいとされています（ガイドブック Q5）。',
                    'The deer chart has no belly because there is little meat there; a deer with enough may be sold as belly (guidebook Q5).',
                  )}
                </p>
              )}
              <p className="text-xs text-on-surface-variant">
                {t('出典：', 'Source: ')}
                <a href={GAME_CUTS_SOURCES.chart.url} target="_blank" rel="noreferrer" className="underline">
                  {GAME_CUTS_SOURCES.chart.title}
                </a>
                {t(`（${GAME_CUTS_CHECKED_ON} 確認）`, ` (checked ${GAME_CUTS_CHECKED_ON})`)}
              </p>
            </Card>
          }
          secondary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="steps" className="text-xl font-medium">
                {t('解体の手順と衛生の要点', 'Steps and hygiene points')}
              </h2>
              {BUTCHERING_STAGES.map((stage) => (
                <fieldset key={stage.id} className="space-y-2">
                  <legend className="text-base font-medium">{stage.title[language]}</legend>
                  {stage.steps.map((step) => {
                    const key = `${stage.id}-${step.id}`;
                    return (
                      <div key={key} className="rounded-sm border border-outline-variant p-3">
                        <label className="flex cursor-pointer items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={done.has(key)}
                            onChange={() => toggle(key)}
                          />
                          <span className={done.has(key) ? 'text-on-surface-variant line-through' : undefined}>
                            {step.action[language]}
                          </span>
                        </label>
                        <details className="mt-2 text-xs text-on-surface-variant">
                          <summary className="cursor-pointer">
                            {t(`ガイドライン ${step.where}`, `Guideline ${step.where}`)}
                          </summary>
                          <blockquote lang="ja" className="mt-1 border-l-4 border-outline-variant pl-3">
                            {step.quote}
                          </blockquote>
                        </details>
                      </div>
                    );
                  })}
                </fieldset>
              ))}
              {done.size > 0 && (
                <Button variant="outline" onClick={() => setDone(new Set())}>
                  {t('チェックを外す', 'Clear the ticks')}
                </Button>
              )}
            </Card>
          }
          extras={
            <ConditionSection
              id="sources"
              title={t('出典', 'Sources')}
              summary={t(
                `厚生労働省のガイドラインと国産ジビエ認証制度（${BUTCHERING_STEPS_CHECKED_ON} 確認）`,
                `MHLW guideline and the national game meat certification scheme (checked ${BUTCHERING_STEPS_CHECKED_ON})`,
              )}
            >
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {[BUTCHERING_GUIDELINE, GAME_CUTS_SOURCES.chart, GAME_CUTS_SOURCES.guidebook].map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                      {source.title}
                    </a>
                    <span className="text-on-surface-variant">　{source.note}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-on-surface-variant">
                {t(
                  '食肉を販売・提供するには、食肉処理業の許可を受けた施設での処理が必要です。',
                  'Meat for sale or serving must be processed in a licensed facility.',
                )}
              </p>
              {language === 'en' && (
                <p className="text-xs text-on-surface-variant">The guideline’s words are quoted in Japanese.</p>
              )}
            </ConditionSection>
          }
        />
      </div>
    </AppLayout>
  );
}
