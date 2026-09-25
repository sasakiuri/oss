'use client';

import { useEffect, useState } from 'react';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SegmentedControl,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import {
  REFERENCE_RATIOS,
  SOURCES_CHECKED_ON,
  YIELD_SOURCES,
  calculateMeatYield,
  freezerFit,
  isValidShare,
  packCount,
  type MeatYieldSpecies,
  type WeighedStage,
  type YieldSourceId,
  type YieldStage,
} from '@/lib/meat-yield';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialMeatYieldSettings, storageKey, useMeatYieldStore } from './_store';
import { MeatYieldSales } from './meat-yield-sales';

const stages: readonly YieldStage[] = ['dressed', 'carcass', 'meat'];

export function MeatYieldClient() {
  const {
    species,
    stage,
    weightKg,
    ratios,
    packGrams,
    freezerKg,
    setSpecies,
    setStage,
    setWeightKg,
    setRatio,
    restoreReferenceRatios,
    setPackGrams,
    setFreezerKg,
  } = useMeatYieldStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useMeatYieldStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const outcome = calculateMeatYield({ stage, weightKg, ratios });
  const result = outcome.ok ? outcome : null;
  const meatKg = result?.meatKg ?? null;
  const packs = meatKg === null ? null : packCount(meatKg, packGrams);
  const fit = meatKg === null || freezerKg === null ? null : freezerFit(meatKg, freezerKg);

  const number = (value: number, digits = 1) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const kg = (value: number | null) => (value === null ? '—' : number(value));

  const speciesName = (value: MeatYieldSpecies) =>
    ({ deer: t('シカ', 'Deer'), boar: t('イノシシ', 'Wild boar'), other: t('その他', 'Other') })[value];
  const weighedName = (value: WeighedStage) =>
    ({
      whole: t('全体重', 'Whole animal'),
      dressed: t('内臓摘出後', 'Field-dressed'),
      carcass: t('枝肉', 'Carcass'),
    })[value];
  const stageName = (value: YieldStage) =>
    ({
      dressed: t('内臓摘出後', 'Field-dressed'),
      carcass: t('枝肉', 'Carcass'),
      meat: t('食肉にできる部位', 'Usable meat'),
    })[value];

  const weightInvalid = !Number.isFinite(weightKg) || weightKg <= 0;
  const packInvalid = !Number.isFinite(packGrams) || packGrams <= 0;
  const freezerInvalid = freezerKg !== null && !(Number.isFinite(freezerKg) && freezerKg > 0);
  const orderStages = outcome.ok || outcome.reason !== 'order' ? null : outcome.stages;
  const ratioError = (target: YieldStage) => {
    const value = ratios[target];
    if (value !== null && !isValidShare(value))
      return t('0 より大きく 100 以下の数値を入力してください。', 'Enter a number above 0 and no more than 100.');
    if (orderStages?.includes(target))
      return t(
        `${stageName(orderStages[1])}の割合は、${stageName(orderStages[0])}の割合以下にしてください。`,
        `The ${stageName(orderStages[1]).toLowerCase()} share must not be more than the ${stageName(orderStages[0]).toLowerCase()} share.`,
      );
    return null;
  };
  // The whole weight comes from the weighed stage's share, so nothing is calculated without it.
  const weighedShareMissing = stage !== 'whole' && ratios[stage] === null;

  const ratioHint = (target: YieldStage) => {
    const reference = REFERENCE_RATIOS[species][target];
    if (!reference) return t('参考値なし', 'No reference value');
    return t(`参考値 ${number(reference.percent)} %（農林水産省）`, `Reference: ${number(reference.percent)} % (MAFF)`);
  };

  const summary = (() => {
    if (!outcome.ok)
      return outcome.reason === 'weight'
        ? t('量った重さを入力してください。', 'Enter the weight.')
        : t('割合の入力を確認してください。', 'Check the shares.');
    if (meatKg === null)
      return t(
        '食肉にできる部位と、量った段階の割合を入力してください。',
        'Enter the usable meat share and the share for the stage weighed.',
      );
    return t(
      `食肉にできる部位は約 ${number(meatKg)} kg（全体重 ${kg(result?.wholeKg ?? null)} kg）。`,
      `About ${number(meatKg)} kg of usable meat (whole animal ${kg(result?.wholeKg ?? null)} kg).`,
    );
  })();

  useEffect(() => {
    // Nothing is read out for the defaults the page opens with before the saved settings are in.
    if (!ready) return;
    // Announce only once typing settles, so a screen reader is not read a new result on every keystroke.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  const stageNote = (target: WeighedStage | YieldStage, value: number | null) => {
    const share = target === 'whole' ? 100 : ratios[target];
    if (target === stage) return t('量った重さ', 'As weighed');
    if (value === null) return t('割合が未入力', 'No share entered');
    return share === null ? undefined : t(`全体重の ${number(share)} %`, `${number(share)} % of whole animal`);
  };

  const stageRow = (target: WeighedStage, value: number | null) => (
    <div key={target} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2">
      <dt>{weighedName(target)}</dt>
      <dd className="row-span-2 text-xl font-medium tabular-nums">
        {kg(value)}
        {value !== null && <span className="ml-1 text-sm font-normal text-on-surface-variant">kg</span>}
      </dd>
      <dd className="text-xs text-on-surface-variant">{stageNote(target, value)}</dd>
    </div>
  );

  const freezerSummary = !packs
    ? t('肉の重さが未計算', 'No meat weight yet')
    : t(
        `${number(packGrams, 0)} g ずつで ${number(packs.packs, 0)} パック${fit ? `・冷凍庫の ${number(fit.shownPercent, 0)} %` : ''}`,
        `${number(packs.packs, 0)} packs of ${number(packGrams, 0)} g${fit ? `, ${number(fit.shownPercent, 0)} % of the freezer` : ''}`,
      );

  const sourceIds = [
    ...new Set(
      Object.values(REFERENCE_RATIOS[species])
        .filter((reference) => reference !== null)
        .map((reference) => reference.source),
    ),
  ];

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('meat-yield').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '動物の種類・重さ・割合・部位と収支・冷凍の条件を初期値に戻します。',
                  en: 'Resets the species, weight, shares, cuts and balance, and freezer settings.',
                }}
                onReset={() =>
                  useMeatYieldStore.setState({
                    ...initialMeatYieldSettings,
                    lastValidSettings: initialMeatYieldSettings,
                  })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty so later text is announced; separate from the summary because status regions are atomic. */}
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('計算結果', 'Results')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="weight" className="text-xl font-medium">
                {t('量った重さ', 'Weight')}
              </h2>
              <SegmentedControl
                legend={t('動物の種類', 'Species')}
                orientation="inline"
                value={species}
                options={(['deer', 'boar', 'other'] as const).map((value) => ({
                  value,
                  label: speciesName(value),
                }))}
                onChange={(value) => setSpecies(value as MeatYieldSpecies)}
              />
              <SegmentedControl
                legend={t('量ったときの状態', 'Weighed as')}
                orientation="inline"
                value={stage}
                options={(['whole', 'dressed', 'carcass'] as const).map((value) => ({
                  value,
                  label: weighedName(value),
                }))}
                onChange={(value) => setStage(value as WeighedStage)}
              />
              <NumberField
                label={t('量った重さ', 'Weight')}
                unit="kg"
                value={weightKg}
                onChange={setWeightKg}
                min={0}
                invalid={weightInvalid}
                errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                hint={t(
                  '全体重は内臓を出す前、枝肉は頭部・内臓・皮を除いた重さです。',
                  'Whole animal: before gutting. Carcass: without the head, viscera and hide.',
                )}
              />
            </Card>
          }
          secondary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <div className="space-y-2">
                <h2 id="ratios" className="text-xl font-medium">
                  {t('歩留まりの割合', 'Yield shares')}
                </h2>
                <p className="text-sm text-on-surface-variant">{t('全体重に対する %', 'Of the whole animal')}</p>
              </div>
              {stages.map((target) => {
                const error = ratioError(target);
                return (
                  <NumberField
                    key={`${species}-${target}`}
                    label={t(`${stageName(target)}の割合`, `${stageName(target)} share`)}
                    unit="%"
                    value={ratios[target] ?? NaN}
                    onChange={(value) => setRatio(target, Number.isNaN(value) ? null : value)}
                    min={0}
                    max={100}
                    invalid={error !== null || (target === stage && weighedShareMissing)}
                    errorText={
                      error ?? t('量った段階の割合を入力してください。', 'Enter the share for the stage weighed.')
                    }
                    hint={ratioHint(target)}
                  />
                );
              })}
              <Button type="button" variant="outline" onClick={restoreReferenceRatios}>
                {t(
                  `${speciesName(species)}の参考値に戻す`,
                  `Reset to ${speciesName(species).toLowerCase()} reference values`,
                )}
              </Button>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('各段階の重さの目安', 'Estimated weight at each stage')}
              </h2>
              <ResultPanel>
                <ResultFigure
                  size="lead"
                  label={stageName('meat')}
                  value={kg(meatKg)}
                  unit={meatKg === null ? undefined : 'kg'}
                  note={stageNote('meat', meatKg)}
                />
              </ResultPanel>
              <dl className="divide-y divide-outline-variant text-sm">
                {stageRow('whole', result?.wholeKg ?? null)}
                {stageRow('dressed', result?.dressedKg ?? null)}
                {stageRow('carcass', result?.carcassKg ?? null)}
              </dl>
              {!outcome.ok && outcome.reason !== 'weight' && (
                <p className="text-sm text-destructive">
                  {t('割合の欄を確認してください。', 'Check the share fields.')}
                </p>
              )}
              {outcome.ok && weighedShareMissing && (
                <p className="text-sm text-destructive">
                  {t(
                    `${weighedName(stage)}の割合を入力してください。`,
                    `Enter the ${weighedName(stage).toLowerCase()} share.`,
                  )}
                </p>
              )}
              <p className="text-xs text-on-surface-variant">
                {t(
                  '食肉を販売・提供するには、食肉処理業の許可を受けた施設での処理が必要です。',
                  'Meat for sale or serving must be processed in a licensed facility.',
                )}
              </p>
            </Card>
          }
          extras={
            <>
              <MeatYieldSales language={language} meatKg={meatKg} />
              <ConditionSection
                id="freezer"
                title={t('パック数と冷凍庫', 'Packs and freezer space')}
                summary={freezerSummary}
                forceOpen={packInvalid || freezerInvalid}
              >
                <div className="grid grid-cols-2 items-start gap-4">
                  <NumberField
                    label={t('1 パックの重さ', 'Pack size')}
                    unit="g"
                    value={packGrams}
                    onChange={setPackGrams}
                    min={0}
                    invalid={packInvalid}
                    errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                  />
                  <NumberField
                    label={t('冷凍庫に入る肉の重さ', 'Freezer capacity (meat weight)')}
                    unit="kg"
                    value={freezerKg ?? NaN}
                    onChange={(value) => setFreezerKg(Number.isNaN(value) ? null : value)}
                    min={0}
                    invalid={freezerInvalid}
                    errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                    hint={t('任意。リットルでなく肉の重さで', 'Optional. Meat weight, not litres')}
                  />
                </div>
                <dl className="grid gap-3 rounded-sm bg-surface-container p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-on-surface-variant">{t('パック数', 'Packs')}</dt>
                    <dd className="mt-1 text-2xl font-medium tabular-nums">{packs ? number(packs.packs, 0) : '—'}</dd>
                    {packs && packs.lastPackGrams < packGrams && (
                      <dd className="mt-1 text-on-surface-variant tabular-nums">
                        {t(
                          `最後の 1 パックは約 ${number(packs.lastPackGrams, 0)} g`,
                          `The last pack is about ${number(packs.lastPackGrams, 0)} g`,
                        )}
                      </dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-on-surface-variant">{t('冷凍庫に占める割合', 'Freezer used')}</dt>
                    <dd className="mt-1 text-2xl font-medium tabular-nums">
                      {fit ? `${number(fit.shownPercent, 0)} %` : '—'}
                    </dd>
                    {fit && (
                      <dd className="mt-1 text-on-surface-variant">
                        {fit.animals === 0
                          ? t('1 頭分が入りきりません。', 'One animal does not fit.')
                          : t(
                              `この大きさなら ${number(fit.animals, 0)} 頭分まで入ります。`,
                              `Room for ${number(fit.animals, 0)} ${fit.animals === 1 ? 'animal' : 'animals'} this size.`,
                            )}
                      </dd>
                    )}
                  </div>
                </dl>
              </ConditionSection>

              <ConditionSection
                id="sources"
                title={t('計算方法と出典', 'Method and sources')}
                summary={t(
                  `参考値：農林水産省の資料（確認日 ${SOURCES_CHECKED_ON}）`,
                  `Reference values: MAFF (checked ${SOURCES_CHECKED_ON})`,
                )}
              >
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t('全体重 = 量った重さ ÷ 量った段階の割合', 'Whole animal = weight ÷ share of the stage weighed')}
                  </li>
                  <li>{t('各段階の重さ = 全体重 × その段階の割合', 'Each stage = whole animal × its share')}</li>
                </ul>
                <ul className="space-y-4 text-sm">
                  {(Object.keys(YIELD_SOURCES) as YieldSourceId[]).map((id) => {
                    const source = YIELD_SOURCES[id];
                    return (
                      <li key={id} className={sourceIds.includes(id) ? undefined : 'text-on-surface-variant'}>
                        <a href={source.url} className="underline" target="_blank" rel="noreferrer">
                          {source.publisher}「{source.title}」{source.issued}
                        </a>
                        <p className="mt-1 text-on-surface-variant">
                          {source.location}：「{source.quote}」
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    'シカの枝肉 50 % は食肉処理施設の収支計算例の想定値です。シカ 20 %・イノシシ 30 % は資料では「程度」とされています。',
                    'The 50 % deer carcass share is from a worked example of a processing plant’s accounts. The 20 % (deer) and 30 % (wild boar) are given as approximate.',
                  )}
                </p>
                {language === 'en' && <p className="text-xs text-on-surface-variant">Sources are in Japanese.</p>}
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
