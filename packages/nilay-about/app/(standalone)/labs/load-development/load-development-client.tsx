'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';

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
  SectionNav,
  SegmentedControl,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import {
  EXPLOSIVES_ACT_URL,
  EXPLOSIVES_REGULATION_URL,
  LAW_TEXT_CHECKED_ON,
  LOAD_STEP_LIMIT,
  STEP_SHOT_LIMIT,
  analyseCentres,
  analyseSeries,
  displayInterval,
  displayRectangle,
  hasDuplicateValues,
  readStep,
  type FlatRun,
  type Interval,
  type PairVerdict,
  type Pooled,
} from '@/lib/load-development';
import {
  STEP_TEXT_MAX,
  type ImpactMode,
  type LoadStep,
  type SpeedUnit,
  type StepUnit,
} from '@/lib/schemas/load-development';
import { summariseVelocities } from '@/lib/velocity-spread';
import { rehydrateLanguage, useLanguage, useSetLanguage, type Language } from '@/store';

import { initialLoadDevelopmentSettings, storageKey, useLoadDevelopmentStore } from './_store';

const STEP_UNIT_LABEL: Record<StepUnit, string> = { gr: 'gr', g: 'g', mm: 'mm', none: '' };

export function LoadDevelopmentClient() {
  const {
    stepUnit,
    speedUnit,
    impactMode,
    steps,
    velocityThreshold,
    movementThreshold,
    setStepUnit,
    setSpeedUnit,
    setImpactMode,
    setVelocityThreshold,
    setMovementThreshold,
    updateStep,
    addStep,
    removeStep,
  } = useLoadDevelopmentStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState<{ ja: string; en: string } | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useLoadDevelopmentStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const read = useMemo(() => steps.map((step) => readStep(step, impactMode)), [steps, impactMode]);
  const duplicate = useMemo(
    () => hasDuplicateValues(steps.map((step) => step.value).filter((value) => Number.isFinite(value))),
    [steps],
  );
  const velocityThresholdValid = Number.isFinite(velocityThreshold) && velocityThreshold >= 0;
  const movementThresholdValid = Number.isFinite(movementThreshold) && movementThreshold >= 0;

  const velocity = useMemo(
    () =>
      duplicate || !velocityThresholdValid
        ? null
        : analyseSeries(
            read.map((step) => ({ value: step.value, samples: step.velocities })),
            velocityThreshold,
          ),
    [read, duplicate, velocityThreshold, velocityThresholdValid],
  );
  const vertical = useMemo(
    () =>
      duplicate || !movementThresholdValid || impactMode !== 'vertical'
        ? null
        : analyseSeries(
            read.map((step) => ({ value: step.value, samples: step.heights })),
            movementThreshold,
          ),
    [read, duplicate, impactMode, movementThreshold, movementThresholdValid],
  );
  const centres = useMemo(
    () =>
      duplicate || !movementThresholdValid || impactMode !== 'both'
        ? null
        : analyseCentres(
            read.map((step) => ({ value: step.value, impacts: step.impacts })),
            movementThreshold,
          ),
    [read, duplicate, impactMode, movementThreshold, movementThresholdValid],
  );
  const impactRun = impactMode === 'vertical' ? (vertical?.flatRun ?? null) : (centres?.flatRun ?? null);
  const impactSteps = impactMode === 'vertical' ? vertical?.steps : centres?.steps;

  const scatterOf = (pooled: Pooled | null): 'none' | 'zero' | 'measured' =>
    pooled === null ? 'none' : pooled.sd > 0 ? 'measured' : 'zero';

  // Built in both languages so the status region switches language with the page.
  const describe = (lang: Language) => {
    const t = (ja: string, en: string) => (lang === 'ja' ? ja : en);
    const number = (value: number, digits = 1) =>
      Number.isFinite(value) ? new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value) : '—';
    const speedLabel = speedUnit === 'mps' ? 'm/s' : 'fps';
    const speed = (value: number, digits = 1) => `${number(value, digits)} ${speedLabel}`;
    const mm = (value: number, digits = 1) => `${number(value, digits)} mm`;
    const stepLabel = (value: number) => {
      const unit = STEP_UNIT_LABEL[stepUnit];
      return unit ? `${number(value, 3)} ${unit}` : number(value, 3);
    };
    const signed = (value: number, format: (value: number) => string) =>
      `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
    const range = (interval: Interval | null, format: (value: number) => string) =>
      interval === null
        ? '—'
        : t(
            `${format(interval.low)} 〜 ${format(interval.high)}`,
            `${format(interval.low)} to ${format(interval.high)}`,
          );

    const verdictLabel: Record<PairVerdict, string> = {
      small: t('小さい（区間も内側）', 'Small (interval inside)'),
      large: t('大きい（区間も外側）', 'Large (interval outside)'),
      undecided: t('この発数では判断できない', 'Cannot tell at this count'),
      'no-interval': t('区間なし（各段 1 発）', 'No interval (one shot per step)'),
      'no-dispersion': t('判定しない（段の中のばらつきが 0）', 'Not judged (no scatter within steps)'),
    };

    const runText = (
      run: FlatRun | null,
      analysed: readonly { value: number }[] | undefined,
      threshold: string,
      subject: { ja: string; en: string },
      scatter: 'none' | 'zero' | 'measured',
    ) => {
      const label = t(`${subject.ja}が ${threshold} 以内の段`, `Steps where the ${subject.en} is within ${threshold}`);
      if (!run || !analysed)
        return {
          label,
          range: t('なし', 'None'),
          verdict: null,
          supported: false,
          sentence: t(
            `${subject.ja}が ${threshold} 以内の隣り合う段はありません。`,
            `No adjacent steps have a ${subject.en} within ${threshold}.`,
          ),
        };
      const from = stepLabel(analysed[run.first]?.value ?? NaN);
      const to = stepLabel(analysed[run.last]?.value ?? NaN);
      const where = t(
        `${from} 〜 ${to} では、隣り合う段の${subject.ja}が ${threshold} 以内です。`,
        `From ${from} to ${to}, the ${subject.en} between adjacent steps is within ${threshold}.`,
      );
      const verdict =
        scatter === 'none'
          ? t(
              '各段 1 発のため、ばらつきとは比べられません。',
              'With one shot per step, it cannot be compared with the scatter.',
            )
          : scatter === 'zero'
            ? t('段の中のばらつきが 0 のため、判定しません。', 'The scatter within steps is zero, so it is not judged.')
            : run.supported
              ? t('95 % 区間もすべてその内側にあります。', 'All 95 % intervals are inside it too.')
              : t(
                  '95 % 区間がこの幅を超える段があり、この発数では小さいとは言えません。',
                  'Some 95 % intervals extend past it, so at this count the change is not shown to be small.',
                );
      return {
        label,
        range: t(`${from} 〜 ${to}`, `${from} to ${to}`),
        verdict,
        supported: scatter === 'measured' && run.supported,
        sentence: `${where}${t('', ' ')}${verdict}`,
      };
    };

    const velocityText = velocity
      ? runText(
          velocity.flatRun,
          velocity.steps,
          speed(velocityThreshold, 3),
          { ja: '平均初速の差', en: 'change in average velocity' },
          scatterOf(velocity.pooled),
        )
      : null;
    const impactScatter =
      impactMode === 'vertical'
        ? scatterOf(vertical?.pooled ?? null)
        : centres?.pooledX && centres.pooledY
          ? scatterOf(centres.pooledX.sd <= centres.pooledY.sd ? centres.pooledX : centres.pooledY)
          : 'none';
    const impactText =
      impactSteps && impactSteps.length >= 2
        ? runText(
            impactRun,
            impactSteps,
            mm(movementThreshold, 3),
            impactMode === 'vertical'
              ? { ja: '着弾の高さの中心の差', en: 'change in centre height' }
              : { ja: '群の中心の移動量', en: 'movement of the group centre' },
            impactScatter,
          )
        : null;

    const spoken = duplicate
      ? t(
          '同じ段階値の段が 2 つ以上あります。段階値を直してください。',
          'Two steps share a value. Give each step its own value.',
        )
      : velocityText === null && impactText === null
        ? t('2 段以上に初速か着弾を入力してください。', 'Enter velocities or impacts for two or more steps.')
        : [velocityText?.sentence, impactText?.sentence].filter(Boolean).join(' ');
    return { number, speed, mm, stepLabel, signed, range, verdictLabel, spoken, velocityText, impactText };
  };
  const said = { ja: describe('ja'), en: describe('en') };
  const { speed, mm, stepLabel, signed, range, verdictLabel, velocityText, impactText } = said[language];
  const speedLabel = speedUnit === 'mps' ? 'm/s' : 'fps';
  const spoken = said[language].spoken;
  const spokenJa = said.ja.spoken;
  const spokenEn = said.en.spoken;
  // Ends rounded outward, with as many decimals as it takes for them to read as the verdict does.
  const judgedRange = (
    interval: Interval | null,
    threshold: number,
    verdict: PairVerdict,
    format: (value: number, digits?: number) => string,
  ) => {
    if (interval === null) return '—';
    const shown = displayInterval(interval, threshold, verdict);
    return range(shown, (value) => signed(value, (amount) => format(amount, shown.digits)));
  };

  useEffect(() => {
    // Announce once typing settles, not on every keystroke.
    if (!ready) return;
    const timer = window.setTimeout(() => setAnnouncement({ ja: spokenJa, en: spokenEn }), 700);
    return () => window.clearTimeout(timer);
  }, [ready, spokenJa, spokenEn]);

  const thresholdError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');
  const separator = t('・', ' · ');
  const thresholdSummary = [
    t(`初速 ${speed(velocityThreshold, 3)} 以内`, `velocity within ${speed(velocityThreshold, 3)}`),
    t(`着弾 ${mm(movementThreshold, 3)} 以内`, `impacts within ${mm(movementThreshold, 3)}`),
  ].join(separator);

  const stepUnitOptions: { value: StepUnit; label: string }[] = [
    { value: 'gr', label: t('グレーン (gr)', 'Grains (gr)') },
    { value: 'g', label: t('グラム (g)', 'Grams (g)') },
    { value: 'mm', label: t('ミリメートル (mm)', 'Millimetres (mm)') },
    { value: 'none', label: t('単位なし', 'No unit') },
  ];

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'the-series', label: t('段ごとの記録', 'Series') },
            { id: 'what-the-series-says', label: t('変化の小さい段', 'Flat stretch') },
            { id: 'what-counts-as-small', label: t('小さい変化', 'Small change') },
            { id: 'velocity-by-step', label: t('初速', 'Velocity') },
            { id: 'impacts-by-step', label: t('着弾', 'Impacts') },
            { id: 'method-and-source', label: t('計算方法', 'Method') },
            { id: 'the-law', label: t('法令', 'Law') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('load-development').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '段ごとの記録と、小さいとみなす変化の設定を初期値に戻します。',
                  en: 'Resets the steps and the small-change thresholds to the defaults.',
                }}
                onReset={() =>
                  useLoadDevelopmentStore.setState({
                    ...initialLoadDevelopmentSettings,
                    lastValidSettings: initialLoadDevelopmentSettings,
                  })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty so the text is announced when it arrives. */}
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement ? announcement[language] : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('変化の小さい段', 'Flat stretch')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <div className="space-y-2">
                <h2 id="the-series" className="text-xl font-medium">
                  {t('段ごとの記録', 'Steps')}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '段階値は段ごとに変えた値（装薬量、シート長など）です。',
                    'The step value is what you changed at each step, such as the charge or the seating depth.',
                  )}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label={t('段階値の単位', 'Step unit')}
                  value={stepUnit}
                  onChange={(value) => setStepUnit(value as StepUnit)}
                  options={stepUnitOptions}
                  hint={t('表示だけで、値は換算しません。', 'Label only. Values are not converted.')}
                />
                <SegmentedControl
                  legend={t('初速の単位', 'Reading unit')}
                  orientation="inline"
                  value={speedUnit}
                  onChange={(value) => setSpeedUnit(value as SpeedUnit)}
                  options={[
                    { value: 'mps', label: 'm/s' },
                    { value: 'fps', label: 'fps' },
                  ]}
                />
              </div>
              <SegmentedControl
                legend={t('着弾の記録', 'Impacts recorded as')}
                orientation="inline"
                value={impactMode}
                onChange={(value) => setImpactMode(value as ImpactMode)}
                options={[
                  { value: 'vertical', label: t('高さだけ', 'Vertical only') },
                  { value: 'both', label: t('横と高さ', 'Horizontal and vertical') },
                ]}
              />
              <p className="text-xs text-on-surface-variant">
                {impactMode === 'vertical'
                  ? t(
                      '着弾は狙点からの高さ（mm、上が正）を 1 行に 1 つ入力します。',
                      'Enter each impact as its height from the aim point in mm (up is positive), one per line.',
                    )
                  : t(
                      '着弾は狙点からの位置（mm、右と上が正）を「右 上」の順に 1 行に 1 発入力します。',
                      'Enter each impact as its offset from the aim point in mm as "right up" (right and up positive), one per line.',
                    )}
              </p>
              <ol className="space-y-4">
                {steps.map((step, index) => (
                  <StepEditor
                    key={step.id}
                    step={step}
                    index={index}
                    read={read[index]}
                    language={language}
                    stepUnit={stepUnit}
                    speedLabel={speedLabel}
                    impactMode={impactMode}
                    canRemove={steps.length > 1}
                    onChange={(changes) => updateStep(step.id, changes)}
                    onRemove={() => removeStep(step.id)}
                  />
                ))}
              </ol>
              {duplicate && (
                <p className="text-sm text-destructive">
                  {t(
                    '同じ段階値の段が 2 つ以上あります。段階値を直してください。',
                    'Two steps share a value. Give each step its own value.',
                  )}
                </p>
              )}
              <Button variant="outline" onClick={addStep} disabled={steps.length >= LOAD_STEP_LIMIT}>
                {t('段を追加', 'Add a step')}
              </Button>
              <p className="text-xs text-on-surface-variant">
                {t(
                  `${LOAD_STEP_LIMIT} 段、各段 ${STEP_SHOT_LIMIT} 発まで。装薬量は弾頭・火薬・銃の製造者が公表する範囲内にしてください。`,
                  `Up to ${LOAD_STEP_LIMIT} steps and ${STEP_SHOT_LIMIT} shots per step. Keep charges within the data published by the component and firearm makers.`,
                )}
              </p>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="what-the-series-says" className="text-xl font-medium">
                {t('変化の小さい段', 'Flat stretch')}
              </h2>
              {velocityText || impactText ? (
                <ResultPanel>
                  {velocityText && (
                    <ResultFigure
                      label={velocityText.label}
                      value={velocityText.range}
                      tone={velocityText.supported ? 'good' : 'neutral'}
                      note={
                        <>
                          {velocityText.verdict && <span className="block">{velocityText.verdict}</span>}
                          <span className="block">
                            {velocity?.pooled
                              ? t(
                                  `段の中の SD ${speed(velocity.pooled.sd)}（自由度 ${velocity.pooled.degreesOfFreedom}）`,
                                  `SD within steps ${speed(velocity.pooled.sd)} (${velocity.pooled.degreesOfFreedom} degrees of freedom)`,
                                )
                              : t('2 発以上の段がありません。', 'No step has two or more shots.')}
                          </span>
                        </>
                      }
                    />
                  )}
                  {impactText && (
                    <ResultFigure
                      label={impactText.label}
                      value={impactText.range}
                      tone={impactText.supported ? 'good' : 'neutral'}
                      note={
                        <>
                          {impactText.verdict && <span className="block">{impactText.verdict}</span>}
                          <span className="block">
                            {impactMode === 'vertical'
                              ? vertical?.pooled
                                ? t(
                                    `段の中の SD ${mm(vertical.pooled.sd)}（自由度 ${vertical.pooled.degreesOfFreedom}）`,
                                    `SD within steps ${mm(vertical.pooled.sd)} (${vertical.pooled.degreesOfFreedom} degrees of freedom)`,
                                  )
                                : t('2 発以上の段がありません。', 'No step has two or more shots.')
                              : centres?.pooledX && centres.pooledY
                                ? t(
                                    `段の中の SD 横 ${mm(centres.pooledX.sd)}・高さ ${mm(centres.pooledY.sd)}`,
                                    `SD within steps: horizontal ${mm(centres.pooledX.sd)}, vertical ${mm(centres.pooledY.sd)}`,
                                  )
                                : t('2 発以上の段がありません。', 'No step has two or more shots.')}
                          </span>
                        </>
                      }
                    />
                  )}
                </ResultPanel>
              ) : (
                <p className="text-sm text-on-surface-variant">{spoken}</p>
              )}
            </Card>
          }
          secondary={
            <ConditionSection
              id="what-counts-as-small"
              title={t('小さいとみなす変化', 'Small-change thresholds')}
              summary={thresholdSummary}
              forceOpen={!velocityThresholdValid || !movementThresholdValid}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label={t('隣り合う段の平均初速の差', 'Change in average velocity')}
                  unit={speedLabel}
                  value={velocityThreshold}
                  onChange={setVelocityThreshold}
                  min={0}
                  invalid={!velocityThresholdValid}
                  errorText={thresholdError}
                />
                <NumberField
                  label={
                    impactMode === 'vertical'
                      ? t('隣り合う段の高さの中心の差', 'Change in centre height')
                      : t('隣り合う段の群の中心の移動量', 'Movement of the group centre')
                  }
                  unit="mm"
                  value={movementThreshold}
                  onChange={setMovementThreshold}
                  min={0}
                  invalid={!movementThresholdValid}
                  errorText={thresholdError}
                />
              </div>
            </ConditionSection>
          }
          extras={
            <>
              <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="velocity-by-step" className="text-xl font-medium">
                  {t('段ごとの初速', 'Velocity at each step')}
                </h2>
                {velocity === null ? (
                  <p className="text-sm text-on-surface-variant">
                    {t('2 段以上に初速を入力してください。', 'Enter velocities for two or more steps.')}
                  </p>
                ) : (
                  <>
                    <ScrollTable label={t('段ごとの初速', 'Velocity at each step')}>
                      <thead>
                        <tr>
                          <Th left>{t('段階値', 'Step')}</Th>
                          <Th>{t('発数', 'Shots')}</Th>
                          <Th>{t('平均', 'Average')}</Th>
                          <Th>{t('標準偏差 SD', 'SD')}</Th>
                          <Th>{t('SD の 95 % 区間', '95 % interval on SD')}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {velocity.steps.map((step) => {
                          const samples = read.find((entry) => entry.value === step.value)?.velocities ?? [];
                          // Unit-free: the summary is only means, deviations and their intervals.
                          const summary = summariseVelocities(samples);
                          return (
                            <tr key={step.value} className="border-t border-outline-variant">
                              <Th left row>
                                {stepLabel(step.value)}
                              </Th>
                              <Td>{step.count}</Td>
                              <Td>{speed(step.mean)}</Td>
                              <Td>{summary ? speed(summary.sdMs) : '—'}</Td>
                              <Td>
                                {summary?.sdInterval
                                  ? range({ low: summary.sdInterval.lowMs, high: summary.sdInterval.highMs }, speed)
                                  : '—'}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </ScrollTable>
                    <ScrollTable label={t('隣り合う段の初速の差', 'Change in velocity between adjacent steps')}>
                      <thead>
                        <tr>
                          <Th left>{t('区間', 'Between')}</Th>
                          <Th>{t('平均の差', 'Change')}</Th>
                          <Th>{t('95 % 区間', '95 % interval')}</Th>
                          <Th left>{t('判定', 'Verdict')}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {velocity.pairs.map((pair) => (
                          <tr key={pair.from} className="border-t border-outline-variant">
                            <Th left row>
                              {`${stepLabel(velocity.steps[pair.from]?.value ?? NaN)} → ${stepLabel(velocity.steps[pair.to]?.value ?? NaN)}`}
                            </Th>
                            <Td>{signed(pair.difference, speed)}</Td>
                            <Td>{judgedRange(pair.interval, velocityThreshold, pair.verdict, speed)}</Td>
                            <Td left>{verdictLabel[pair.verdict]}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </ScrollTable>
                  </>
                )}
              </Card>

              <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="impacts-by-step" className="text-xl font-medium">
                  {t('段ごとの着弾の中心', 'Centre of impact at each step')}
                </h2>
                {impactMode === 'vertical' && vertical !== null && (
                  <ScrollTable label={t('隣り合う段の着弾の高さの差', 'Change in height between adjacent steps')}>
                    <thead>
                      <tr>
                        <Th left>{t('区間', 'Between')}</Th>
                        <Th>{t('中心の高さ', 'Centre height')}</Th>
                        <Th>{t('高さの差', 'Change')}</Th>
                        <Th>{t('95 % 区間', '95 % interval')}</Th>
                        <Th left>{t('判定', 'Verdict')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {vertical.pairs.map((pair) => (
                        <tr key={pair.from} className="border-t border-outline-variant">
                          <Th left row>
                            {`${stepLabel(vertical.steps[pair.from]?.value ?? NaN)} → ${stepLabel(vertical.steps[pair.to]?.value ?? NaN)}`}
                          </Th>
                          <Td>{`${mm(vertical.steps[pair.from]?.mean ?? NaN)} → ${mm(vertical.steps[pair.to]?.mean ?? NaN)}`}</Td>
                          <Td>{signed(pair.difference, mm)}</Td>
                          <Td>{judgedRange(pair.interval, movementThreshold, pair.verdict, mm)}</Td>
                          <Td left>{verdictLabel[pair.verdict]}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </ScrollTable>
                )}
                {impactMode === 'both' && centres !== null && (
                  <ScrollTable
                    label={t('隣り合う段の群の中心の移動', 'Movement of the group centre between adjacent steps')}
                  >
                    <thead>
                      <tr>
                        <Th left>{t('区間', 'Between')}</Th>
                        <Th>{t('移動量', 'Movement')}</Th>
                        <Th>{t('横の差（区間）', 'Horizontal (interval)')}</Th>
                        <Th>{t('高さの差（区間）', 'Vertical (interval)')}</Th>
                        <Th left>{t('判定', 'Verdict')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {centres.pairs.map((pair) => (
                        <tr key={pair.from} className="border-t border-outline-variant">
                          <Th left row>
                            {`${stepLabel(centres.steps[pair.from]?.value ?? NaN)} → ${stepLabel(centres.steps[pair.to]?.value ?? NaN)}`}
                          </Th>
                          <Td>{mm(pair.distance)}</Td>
                          {(() => {
                            const shown =
                              pair.xInterval && pair.yInterval
                                ? displayRectangle(pair.xInterval, pair.yInterval, movementThreshold, pair.verdict)
                                : null;
                            const axis = (interval: Interval | null) =>
                              range(interval, (value) => signed(value, (amount) => mm(amount, shown?.digits ?? 1)));
                            return (
                              <>
                                <Td>{`${signed(pair.dx, mm)} (${axis(shown?.x ?? null)})`}</Td>
                                <Td>{`${signed(pair.dy, mm)} (${axis(shown?.y ?? null)})`}</Td>
                              </>
                            );
                          })()}
                          <Td left>{verdictLabel[pair.verdict]}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </ScrollTable>
                )}
                {(impactMode === 'vertical' ? vertical : centres) === null && (
                  <p className="text-sm text-on-surface-variant">
                    {t('2 段以上に着弾を入力してください。', 'Enter impacts for two or more steps.')}
                  </p>
                )}
              </Card>

              <ConditionSection
                id="method-and-source"
                title={t('計算方法', 'Method')}
                summary={t('合算 SD と t 分布による 95 % 区間', 'Pooled SD and 95 % t intervals')}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '2 発以上の段の中のばらつきを合算して 1 つの標準偏差にします（自由度は各段の「発数 − 1」の合計）。差の 95 % 区間は「差 ± t × 合算 SD × √(1/n₁ + 1/n₂)」です。2 発以上の段がほかにあれば、1 発の段も比べられます。ばらつきはどの段でも同程度と仮定します。段ごとの SD の区間はカイ二乗分布です。',
                    'The scatter within every step with two or more shots is pooled into one SD, with the sum of (shots − 1) as its degrees of freedom. The 95 % interval on a change is "change ± t × pooled SD × √(1/n₁ + 1/n₂)". A one-shot step can be compared if another step has repeated shots. The scatter is assumed to be similar at every step. The interval on each step\'s SD uses the chi-squared distribution.',
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '判定は、区間全体が「小さいとみなす変化」の内側なら「小さい」、全体が外側なら「大きい」、またがれば「この発数では判断できない」です。横と高さを記録した場合は、横・高さそれぞれ 97.5 % の区間でできる長方形を、半径が「小さいとみなす移動量」の円と比べます（ボンフェローニ法）。「小さい区間」は、測った差が設定値以内の段が最も長く続く範囲です。',
                    'A change is "small" when its whole interval is inside the threshold, "large" when all of it is outside, and "cannot tell" when it straddles the threshold. With both coordinates, the rectangle of the 97.5 % horizontal and vertical intervals is compared with a circle whose radius is the movement threshold (Bonferroni method). The flat stretch is the longest run of steps whose measured change is within the threshold.',
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '計測器の誤差、気温、銃身温度、射手のぶれは区別できず、段の中のばらつきか段の差に含まれます。',
                    'Chronograph error, air and barrel temperature and shooter error cannot be separated; they end up in the scatter or in the changes.',
                  )}
                </p>
              </ConditionSection>

              <ConditionSection
                id="the-law"
                title={t('実包を自ら製造することと法令', 'Handloading and the law')}
                summary={t(
                  `火薬類取締法と同施行規則の関係条文（${LAW_TEXT_CHECKED_ON} 確認）`,
                  `Relevant provisions of the Explosives Control Act and its Enforcement Regulation (checked ${LAW_TEXT_CHECKED_ON})`,
                )}
              >
                <section className="space-y-3 text-sm" lang="ja">
                  {language === 'en' && (
                    <p className="text-on-surface-variant" lang="en">
                      The provisions are quoted in the original Japanese.
                    </p>
                  )}
                  <blockquote className="space-y-2 border-l-4 border-outline-variant pl-4">
                    <p>火薬類取締法第二条第一項第三号　火工品　ロ　実包及び空包</p>
                    <p>
                      第四条　火薬類の製造は、前条の許可を受けた者（以下「製造業者」という。）でなければ、することができない。但し、理化学上の実験、鳥獣の捕獲若しくは駆除、射的練習又は医療の用に供するため製造する火薬類で、経済産業省令で定める数量以下のものを製造する場合は、この限りでない。
                    </p>
                    <p>
                      火薬類取締法施行規則第三条（無許可製造数量）　法第四条但書の規定により許可を受けないで製造することができる火薬類の数量は、次の各号によるものとする。
                    </p>
                    <p>
                      三　法第十七条第一項第三号に規定する者が鳥獣の捕獲又は駆除の用に供するために製造する場合には、一日につき実包又は空包百個以下
                    </p>
                    <p>四　射的練習の用に供するために当該練習者が製造する場合には、一日につき実包又は空包百個以下</p>
                    <p>
                      火薬類取締法第十七条第一項　火薬類を譲り渡し、又は譲り受けようとする者は、経済産業省令で定めるところにより、都道府県知事の許可を受けなければならない。ただし、次の各号のいずれかに該当するときは、この限りでない。（各号略）
                    </p>
                  </blockquote>
                  <p className="flex flex-wrap gap-x-4 gap-y-2">
                    <a href={EXPLOSIVES_ACT_URL} target="_blank" rel="noreferrer" lang={language}>
                      {t('火薬類取締法（e-Gov 法令検索）', 'Explosives Control Act (e-Gov)')}
                    </a>
                    <a href={EXPLOSIVES_REGULATION_URL} target="_blank" rel="noreferrer" lang={language}>
                      {t('火薬類取締法施行規則（e-Gov 法令検索）', 'Enforcement Regulation (e-Gov)')}
                    </a>
                  </p>
                </section>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}

interface StepEditorProps {
  step: LoadStep;
  index: number;
  read: ReturnType<typeof readStep> | undefined;
  language: Language;
  stepUnit: StepUnit;
  speedLabel: string;
  impactMode: ImpactMode;
  canRemove: boolean;
  onChange: (changes: Partial<Omit<LoadStep, 'id'>>) => void;
  onRemove: () => void;
}

function StepEditor({
  step,
  index,
  read,
  language,
  stepUnit,
  speedLabel,
  impactMode,
  canRemove,
  onChange,
  onRemove,
}: StepEditorProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const id = useId();
  const name = t(`段 ${index + 1}`, `Step ${index + 1}`);
  const impactCount = impactMode === 'vertical' ? (read?.heights.length ?? 0) : (read?.impacts.length ?? 0);
  return (
    <li>
      <fieldset className="space-y-3 rounded-md border border-outline-variant p-4">
        <legend className="px-1 text-sm font-medium">{name}</legend>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <NumberField
              label={t(`${name}の段階値`, `${name} value`)}
              unit={STEP_UNIT_LABEL[stepUnit] || undefined}
              value={step.value}
              onChange={(value) => onChange({ value })}
              invalid={!Number.isFinite(step.value)}
              errorText={t('数値を入力してください。', 'Enter a number.')}
            />
          </div>
          <Button variant="ghost" size="sm" className="mt-8 shrink-0" onClick={onRemove} disabled={!canRemove}>
            {t(`${name}を削除`, `Remove ${name.toLowerCase()}`)}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1">
            <label htmlFor={`${id}-velocities`} className="block text-sm font-medium">
              {t(`${name}の初速`, `${name} velocities`)}{' '}
              <span className="font-normal text-on-surface-variant">({speedLabel})</span>
            </label>
            <textarea
              id={`${id}-velocities`}
              rows={3}
              inputMode="decimal"
              maxLength={STEP_TEXT_MAX}
              value={step.velocities}
              onChange={(event) => onChange({ velocities: event.target.value })}
              className="w-full tabular-nums"
            />
            <p className="text-xs text-on-surface-variant">
              {t(`${read?.velocities.length ?? 0} 発`, `${read?.velocities.length ?? 0} shots`)}
            </p>
            {read && read.velocityInvalid.length > 0 && (
              <p className="text-sm text-destructive">
                {t(
                  `読み取れない値: ${read.velocityInvalid.join('、')}`,
                  `Could not read: ${read.velocityInvalid.join(', ')}`,
                )}
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <label htmlFor={`${id}-impacts`} className="block text-sm font-medium">
              {t(`${name}の着弾`, `${name} impacts`)} <span className="font-normal text-on-surface-variant">(mm)</span>
            </label>
            <textarea
              id={`${id}-impacts`}
              rows={3}
              inputMode={impactMode === 'vertical' ? 'decimal' : 'text'}
              maxLength={STEP_TEXT_MAX}
              value={step.impacts}
              onChange={(event) => onChange({ impacts: event.target.value })}
              className="w-full tabular-nums"
            />
            <p className="text-xs text-on-surface-variant">{t(`${impactCount} 発`, `${impactCount} shots`)}</p>
            {read && read.impactInvalid.length > 0 && (
              <p className="text-sm text-destructive">
                {impactMode === 'vertical'
                  ? t(
                      `読み取れない値: ${read.impactInvalid.join('、')}`,
                      `Could not read: ${read.impactInvalid.join(', ')}`,
                    )
                  : t(
                      `「右 上」として読み取れない行: ${read.impactInvalid.join('、')}`,
                      `Could not read as "right up": ${read.impactInvalid.join(', ')}`,
                    )}
              </p>
            )}
          </div>
        </div>
        {read?.truncated && (
          <p className="text-sm text-destructive">
            {t(`各段 ${STEP_SHOT_LIMIT} 発までを集計します。`, `Up to ${STEP_SHOT_LIMIT} shots per step are used.`)}
          </p>
        )}
      </fieldset>
    </li>
  );
}

function ScrollTable({ label, children }: { label: string; children: ReactNode }) {
  // Scrolls inside the card on a phone; focusable for keyboard scrolling.
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-auto rounded-sm border border-outline-variant"
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}

function Th({ children, left = false, row = false }: { children: ReactNode; left?: boolean; row?: boolean }) {
  return (
    <th
      scope={row ? 'row' : 'col'}
      className={`px-3 py-2 whitespace-nowrap ${left ? 'text-left' : 'text-right'} ${row ? 'font-normal tabular-nums' : 'font-medium'}`}
    >
      {children}
    </th>
  );
}

function Td({ children, left = false }: { children: ReactNode; left?: boolean }) {
  return (
    <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${left ? 'text-left' : 'text-right'}`}>{children}</td>
  );
}
