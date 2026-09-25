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
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import {
  DENSITY_SOURCES,
  DENSITY_SOURCES_CHECKED_ON,
  FUNRYU_EXAMPLE_TEMPERATURES,
  FUNRYU_MONTHS_BACK,
  PELLETS_PER_DAY_PRESETS,
  funryuDensity,
  pelletClearanceDensity,
  remDensity,
} from '@/lib/deer-density';
import { labsTool } from '@/lib/labs-tools';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import {
  DEER_DENSITY_STORAGE_KEY,
  initialDeerDensitySettings,
  useDeerDensityStore,
  type DensityMethod,
} from './_store';

const MONTHS_JA = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DeerDensityClient() {
  const { method, rem, clearance, funryu, setMethod, setRem, setClearance, setFunryu } = useDeerDensityStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(DEER_DENSITY_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useDeerDensityStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const number = (value: number, digits = 2) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

  const remResult = remDensity(rem);
  const clearanceResult = pelletClearanceDensity(clearance);
  const funryuResult = funryuDensity(funryu);
  const result =
    method === 'rem' ? remResult : method === 'clearance' ? (clearanceResult?.perKm2 ?? null) : funryuResult;

  const invalid = (value: number, check: (value: number) => boolean) => !(Number.isFinite(value) && check(value));
  const positiveText = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeText = t('0 以上の数値を入力してください。', 'Enter zero or more.');
  const months = language === 'ja' ? MONTHS_JA : MONTHS_EN;

  const methodName = (value: DensityMethod) =>
    ({
      rem: t('カメラ（REM）', 'Camera (REM)'),
      clearance: t('糞粒法（消失率を実測）', 'Pellets (measured loss)'),
      funryu: t('糞粒法（FUNRYU）', 'Pellets (FUNRYU)'),
    })[value];

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('deer-density').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: 'すべての手法の入力を初期値に戻します。',
                  en: 'Resets the inputs of every method.',
                }}
                onReset={() =>
                  useDeerDensityStore.setState({
                    ...initialDeerDensitySettings,
                    lastValidSettings: initialDeerDensitySettings,
                  })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={DEER_DENSITY_STORAGE_KEY} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('推定密度', 'Estimated density')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="inputs" className="text-xl font-medium">
                {t('調査の結果', 'Survey results')}
              </h2>
              <SegmentedControl
                legend={t('手法', 'Method')}
                orientation="vertical"
                value={method}
                options={(['rem', 'clearance', 'funryu'] as const).map((value) => ({
                  value,
                  label: methodName(value),
                }))}
                onChange={(value) => setMethod(value as DensityMethod)}
              />
              {method === 'rem' && (
                <div className="grid grid-cols-2 items-start gap-4">
                  <NumberField
                    label={t('撮影回数（独立した出現）', 'Independent passes')}
                    unit={t('回', '')}
                    value={rem.photos}
                    onChange={(value) => setRem('photos', value)}
                    min={0}
                    invalid={invalid(rem.photos, (value) => value >= 0)}
                    errorText={nonNegativeText}
                  />
                  <NumberField
                    label={t('カメラ稼働', 'Camera effort')}
                    unit={t('台・日', 'camera-days')}
                    value={rem.cameraDays}
                    onChange={(value) => setRem('cameraDays', value)}
                    min={0}
                    invalid={invalid(rem.cameraDays, (value) => value > 0)}
                    errorText={positiveText}
                  />
                  <NumberField
                    label={t('1 日の移動距離', 'Day range')}
                    unit="km"
                    value={rem.dayRangeKm}
                    onChange={(value) => setRem('dayRangeKm', value)}
                    min={0}
                    invalid={invalid(rem.dayRangeKm, (value) => value > 0)}
                    errorText={positiveText}
                  />
                  <NumberField
                    label={t('検知距離', 'Detection radius')}
                    unit="m"
                    value={rem.radiusM}
                    onChange={(value) => setRem('radiusM', value)}
                    min={0}
                    invalid={invalid(rem.radiusM, (value) => value > 0)}
                    errorText={positiveText}
                  />
                  <NumberField
                    label={t('検知角度', 'Detection angle')}
                    unit="°"
                    value={rem.angleDegrees}
                    onChange={(value) => setRem('angleDegrees', value)}
                    min={0}
                    max={360}
                    invalid={invalid(rem.angleDegrees, (value) => value >= 0 && value <= 360)}
                    errorText={t('0 から 360 度で入力してください。', 'Enter 0 to 360 degrees.')}
                  />
                  <NumberField
                    label={t('平均群サイズ', 'Mean group size')}
                    unit={t('頭', '')}
                    value={rem.groupSize}
                    onChange={(value) => setRem('groupSize', value)}
                    min={0}
                    invalid={invalid(rem.groupSize, (value) => value > 0)}
                    errorText={positiveText}
                    hint={t(
                      '群れを 1 回と数えた場合。1 頭ずつ数えたなら 1。',
                      'When a group counts as one pass; 1 if each animal was counted.',
                    )}
                  />
                  <p className="col-span-2 text-xs text-on-surface-variant">
                    {t(
                      '初期値の移動距離 7.4 km/日・検知距離 18.1 m・角度 57° は群馬県のニホンジカでの値です。検知距離は設置したカメラで実測してください。',
                      'The defaults of 7.4 km/day, 18.1 m and 57° are from a Gunma Prefecture sika deer study. Measure the detection radius of your own cameras.',
                    )}
                  </p>
                </div>
              )}
              {method === 'clearance' && (
                <div className="grid grid-cols-2 items-start gap-4">
                  <NumberField
                    label={t('2 回目の調査の糞粒密度', 'Pellets at the second survey')}
                    unit={t('粒/m²', '/m²')}
                    value={clearance.pelletsPerM2}
                    onChange={(value) => setClearance('pelletsPerM2', value)}
                    min={0}
                    invalid={invalid(clearance.pelletsPerM2, (value) => value >= 0)}
                    errorText={nonNegativeText}
                  />
                  <NumberField
                    label={t('調査の間隔', 'Days between surveys')}
                    unit={t('日', 'days')}
                    value={clearance.days}
                    onChange={(value) => setClearance('days', value)}
                    min={0}
                    invalid={invalid(clearance.days, (value) => value > 0)}
                    errorText={positiveText}
                  />
                  <NumberField
                    label={t('置いた糞の数（1 回目）', 'Pellets set out (first survey)')}
                    unit={t('粒', '')}
                    value={clearance.placed}
                    onChange={(value) => setClearance('placed', value)}
                    min={0}
                    invalid={invalid(clearance.placed, (value) => value > 0)}
                    errorText={positiveText}
                  />
                  <NumberField
                    label={t('残っていた糞の数（2 回目）', 'Pellets left (second survey)')}
                    unit={t('粒', '')}
                    value={clearance.remaining}
                    onChange={(value) => setClearance('remaining', value)}
                    min={0}
                    invalid={invalid(clearance.remaining, (value) => value > 0 && value < clearance.placed)}
                    errorText={t(
                      '0 より大きく、置いた数より少ない数を入力してください。',
                      'Enter more than zero and fewer than were set out.',
                    )}
                  />
                  <NumberField
                    label={t('1 頭 1 日あたりの排糞数', 'Pellets per deer per day')}
                    unit={t('粒', '')}
                    value={clearance.pelletsPerDay}
                    onChange={(value) => setClearance('pelletsPerDay', value)}
                    min={0}
                    invalid={invalid(clearance.pelletsPerDay, (value) => value > 0)}
                    errorText={positiveText}
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    {PELLETS_PER_DAY_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        variant="outline"
                        size="sm"
                        onClick={() => setClearance('pelletsPerDay', preset.pelletsPerDay)}
                      >
                        {preset.label[language]} {preset.pelletsPerDay}
                      </Button>
                    ))}
                  </div>
                  <p className="col-span-2 text-xs text-on-surface-variant">
                    {t(
                      '長野県の方法：調査区内の約 1.5 km のルートに約 10 m ごとに 1 m² の測定点を 110 か所置き、脇に置いた糞の残り方から消失の速さを測ります。',
                      'Nagano’s design: 110 plots of 1 m² about every 10 m along a route of about 1.5 km, with pellets set out beside them to measure how fast they disappear.',
                    )}
                  </p>
                </div>
              )}
              {method === 'funryu' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 items-start gap-4">
                    <NumberField
                      label={t('糞粒密度', 'Pellet density')}
                      unit={t('粒/m²', '/m²')}
                      value={funryu.pelletsPerM2}
                      onChange={(value) => setFunryu({ pelletsPerM2: value })}
                      min={0}
                      invalid={invalid(funryu.pelletsPerM2, (value) => value >= 0)}
                      errorText={nonNegativeText}
                    />
                    <SelectField
                      label={t('調査した月', 'Survey month')}
                      value={String(funryu.surveyMonth)}
                      onChange={(value) => setFunryu({ surveyMonth: Number(value) })}
                      options={months.map((label, index) => ({ value: String(index + 1), label }))}
                    />
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">
                      {t('調査地の月平均気温（°C）', 'Monthly mean temperature at the site (°C)')}
                    </legend>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {months.map((label, index) => (
                        <NumberField
                          key={label}
                          label={label}
                          unit="°C"
                          value={funryu.temperatures[index] ?? Number.NaN}
                          onChange={(value) =>
                            setFunryu({
                              temperatures: funryu.temperatures.map((current, position) =>
                                position === index ? value : current,
                              ),
                            })
                          }
                          invalid={!Number.isFinite(funryu.temperatures[index])}
                          errorText={t('数値を入力', 'Enter a number')}
                        />
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFunryu({ temperatures: [...FUNRYU_EXAMPLE_TEMPERATURES] })}
                    >
                      {t('論文の例（犬ヶ岳）の気温に戻す', 'Use the paper’s example temperatures')}
                    </Button>
                  </fieldset>
                </div>
              )}
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('推定密度', 'Estimated density')}</h2>
              <ResultPanel>
                <ResultFigure
                  size="lead"
                  label={methodName(method)}
                  value={result === null ? '—' : number(result)}
                  unit={result === null ? undefined : t('頭/km²', 'per km²')}
                  note={
                    method === 'clearance' && clearanceResult
                      ? t(`${number(clearanceResult.perHa, 4)} 頭/ha`, `${number(clearanceResult.perHa, 4)} per ha`)
                      : undefined
                  }
                />
              </ResultPanel>
              {result === null && (
                <p className="text-sm text-destructive">{t('入力を確認してください。', 'Check the inputs.')}</p>
              )}
              <ul className="list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
                {method === 'rem' && (
                  <>
                    <li>D = (y/t) · π / (v · r · (2 + θ)) · g（Rowcliffe et al. 2008, eqn 4）</li>
                    <li>
                      {t(
                        'カメラはランダムに置き、動物がカメラに引き寄せられたり避けたりしないことが前提です。移動距離の値で結果が大きく変わります。',
                        'Cameras must be placed at random, and animals must neither seek nor avoid them. The day range moves the result a great deal.',
                      )}
                    </li>
                  </>
                )}
                {method === 'clearance' && (
                  <li>n = 1/p × m₂ × k₁/(k₁ − k₂) × ln(k₁/k₂)/(t₂ − t₁) × 10000（{t('1 ha あたり', 'per ha')}）</li>
                )}
                {method === 'funryu' && (
                  <>
                    <li>
                      {t(
                        `消失率 D(%) = (0.188T + 0.778)/(0.027A + 0.057)（T は気温、A は糞の月齢）を ${FUNRYU_MONTHS_BACK} か月さかのぼって積み上げます。発見率は 1 とします。`,
                        `Loss D(%) = (0.188T + 0.778)/(0.027A + 0.057) (T temperature, A age in months), traced back ${FUNRYU_MONTHS_BACK} months, with a finding rate of 1.`,
                      )}
                    </li>
                    <li>
                      {t(
                        '著者は、当面は九州本土の森林内に限って使うよう述べています。',
                        'The authors advise using it, for now, only in forests on the Kyushu mainland.',
                      )}
                    </li>
                    <li>
                      {t(
                        '月平均気温が約 −4.1 °C を下回る月があると、式の消失率が負になるため計算しません。',
                        'A month colder than about −4.1 °C makes the loss negative, so nothing is calculated.',
                      )}
                    </li>
                  </>
                )}
              </ul>
            </Card>
          }
          extras={
            <ConditionSection
              id="sources"
              title={t('出典', 'Sources')}
              summary={t(`確認日 ${DENSITY_SOURCES_CHECKED_ON}`, `Checked ${DENSITY_SOURCES_CHECKED_ON}`)}
            >
              <ul className="space-y-2 text-sm">
                {Object.values(DENSITY_SOURCES).map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.citation}
                    </a>
                  </li>
                ))}
              </ul>
            </ConditionSection>
          }
        />
      </div>
    </AppLayout>
  );
}
