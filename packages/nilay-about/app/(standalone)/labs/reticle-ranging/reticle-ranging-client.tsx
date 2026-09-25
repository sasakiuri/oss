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
  StorageUnavailableNotice,
  ResultFigure,
  ResultPanel,
  SegmentedControl,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import {
  MAX_ANGLE_RADIANS,
  READING_STEP,
  calculateReticleRanging,
  fromSizeMm,
  readingToRadians,
  reticleScale,
  type DistanceUnit,
  type FocalPlane,
  type ReticleUnit,
  type SolveFor,
  type TargetSizeUnit,
} from '@/lib/reticle-ranging';
import { fromMeters } from '@/lib/sight-adjustment';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialReticleRangingSettings, storageKey, useReticleRangingStore } from './_store';

export function ReticleRangingClient() {
  const {
    solveFor,
    targetSize,
    apparent,
    distance,
    focalPlane,
    magnification,
    setSolveFor,
    setTargetSize,
    setApparent,
    setDistance,
    setFocalPlane,
    setMagnification,
  } = useReticleRangingStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useReticleRangingStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const result = calculateReticleRanging({ solveFor, targetSize, apparent, distance, focalPlane, magnification });

  // A quantity is an input in the two directions that do not solve for it.
  const usesSize = solveFor !== 'size';
  const usesApparent = solveFor !== 'apparent';
  const usesDistance = solveFor !== 'distance';
  const sizeInvalid = usesSize && (!Number.isFinite(targetSize.value) || targetSize.value <= 0);
  const apparentInvalid = usesApparent && (!Number.isFinite(apparent.value) || apparent.value <= 0);
  const distanceInvalid = usesDistance && (!Number.isFinite(distance.value) || distance.value <= 0);
  const calibrationInvalid =
    focalPlane === 'sfp' && (!Number.isFinite(magnification.calibration) || magnification.calibration <= 0);
  const usedInvalid = focalPlane === 'sfp' && (!Number.isFinite(magnification.used) || magnification.used <= 0);
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  // A reading of half a turn or more has no triangle; the error is shown at the field.
  const scale = reticleScale(focalPlane, magnification);
  const readingTooLarge =
    usesApparent &&
    !apparentInvalid &&
    Number.isFinite(scale) &&
    readingToRadians(apparent.value, apparent.unit, scale) >= MAX_ANGLE_RADIANS;

  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const reticleLabel = (unit: ReticleUnit) => (unit === 'mil' ? 'mil' : 'MOA');
  const otherReticleUnit: ReticleUnit = apparent.unit === 'mil' ? 'moa' : 'mil';
  const otherDistanceUnit: DistanceUnit = distance.unit === 'm' ? 'yd' : 'm';
  // Each size unit is paired with one from the other system.
  const otherSizeUnit: TargetSizeUnit = targetSize.unit === 'inch' ? 'cm' : 'inch';
  // Three significant figures, rounded down, so the stated limit is always reachable.
  const readingLimit = `${new Intl.NumberFormat(language, {
    maximumSignificantDigits: 3,
    roundingMode: 'floor',
  }).format(MAX_ANGLE_RADIANS / readingToRadians(1, apparent.unit, scale))} ${reticleLabel(apparent.unit)}`;
  const readingTooLargeError =
    focalPlane === 'sfp'
      ? t(
          `読み値が大きすぎます。この倍率では ${readingLimit} 未満で入力してください。`,
          `Reading too large. At this magnification, enter less than ${readingLimit}.`,
        )
      : t(
          `読み値が大きすぎます。${readingLimit} 未満で入力してください。`,
          `Reading too large. Enter less than ${readingLimit}.`,
        );

  const distanceText = (meters: number, unit: DistanceUnit) => `${number(fromMeters(meters, unit), 1)} ${unit}`;
  const sizeText = (millimeters: number, unit: TargetSizeUnit) =>
    `${number(fromSizeMm(millimeters, unit), unit === 'm' ? 2 : 1)} ${unit}`;
  const readingText = (unit: ReticleUnit) =>
    result ? `${number(unit === 'mil' ? result.readingMil : result.readingMoa)} ${reticleLabel(unit)}` : '—';

  const answer = result
    ? {
        distance: {
          primary: distanceText(result.distanceMeters, distance.unit),
          secondary: distanceText(result.distanceMeters, otherDistanceUnit),
        },
        size: {
          primary: sizeText(result.sizeMm, targetSize.unit),
          secondary: sizeText(result.sizeMm, otherSizeUnit),
        },
        apparent: { primary: readingText(apparent.unit), secondary: readingText(otherReticleUnit) },
      }[solveFor]
    : null;

  const summary = answer
    ? {
        distance: t(
          `推定距離は ${answer.primary}（${answer.secondary}）。`,
          `Estimated distance ${answer.primary} (${answer.secondary}).`,
        ),
        size: t(
          `対象の実寸は ${answer.primary}（${answer.secondary}）。`,
          `Target size ${answer.primary} (${answer.secondary}).`,
        ),
        apparent: t(
          `レティクル上では ${answer.primary}（${answer.secondary}）。`,
          `Reticle reading ${answer.primary} (${answer.secondary}).`,
        ),
      }[solveFor]
    : readingTooLarge
      ? readingTooLargeError
      : t('必要な 2 つの値を入力してください。', 'Enter the two known values.');

  useEffect(() => {
    if (!ready) return;
    // Announce once typing settles, not on every keystroke.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  // Either side of the misread can fall outside the angles that can be calculated.
  const spreadText = !result
    ? readingTooLarge
      ? t('読み値を直してください。', 'Correct the reading.')
      : t('必要な 2 つの値を入力してください。', 'Enter the two known values.')
    : result.sensitivity.worstShare !== null
      ? t(
          `最大 ${number(result.sensitivity.worstShare * 100, 1)} %。読み値が小さいほど影響が大きくなります。`,
          `Up to ${number(result.sensitivity.worstShare * 100, 1)} %. The smaller the reading, the larger the effect.`,
        )
      : result.sensitivity.farMeters === null
        ? t(
            '読み値が小さすぎて、少なく読んだ側の距離が出ません。もっと大きく見える部分で読み直してください。',
            'Reading too small: one step less gives no distance. Read against a larger feature.',
          )
        : t(
            '読み値が大きすぎて、多く読んだ側は計算できません。',
            'Reading too large: one step more cannot be calculated.',
          );

  // Short labels so the three fit one row on a phone.
  const modes: { value: SolveFor; label: string }[] = [
    { value: 'distance', label: t('距離', 'Distance') },
    { value: 'size', label: t('実寸', 'Size') },
    { value: 'apparent', label: t('読み値', 'Reading') },
  ];
  const answerLabel = {
    distance: t('推定距離', 'Estimated distance'),
    size: t('対象の実寸', 'Target size'),
    apparent: t('レティクルの読み値', 'Reticle reading'),
  }[solveFor];
  // The two known values the answer came from, shown above it.
  const givenText = result
    ? [
        usesSize && `${t('実寸', 'size')} ${sizeText(result.sizeMm, targetSize.unit)}`,
        usesApparent && `${t('読み値', 'reading')} ${readingText(apparent.unit)}`,
        usesDistance && `${t('距離', 'distance')} ${distanceText(result.distanceMeters, distance.unit)}`,
      ]
        .filter(Boolean)
        .join(t('・', ', '))
    : '';

  const sizeUnits: { value: TargetSizeUnit; label: string }[] = [
    { value: 'cm', label: 'cm' },
    { value: 'inch', label: 'inch' },
    { value: 'm', label: 'm' },
  ];
  const reticleUnits: { value: ReticleUnit; label: string }[] = [
    { value: 'mil', label: 'mil' },
    { value: 'moa', label: 'MOA' },
  ];
  const distanceUnits: { value: DistanceUnit; label: string }[] = [
    { value: 'm', label: 'm' },
    { value: 'yd', label: 'yd' },
  ];

  // A unit change rereads the number; it does not convert it.
  const inputFields = [
    usesSize && (
      <NumberField
        key="size"
        label={t('対象の実寸', 'Target size')}
        value={targetSize.value}
        onChange={(value) => setTargetSize({ ...targetSize, value })}
        units={{
          value: targetSize.unit,
          label: t('実寸の単位', 'Size unit'),
          options: sizeUnits,
          onChange: (unit: TargetSizeUnit) => setTargetSize({ ...targetSize, unit }),
        }}
        min={0}
        invalid={sizeInvalid}
        errorText={positiveError}
        hint={t('高さ（幅で読むときは幅）', 'Height, or width if you read the width')}
      />
    ),
    usesApparent && (
      <NumberField
        key="apparent"
        label={t('レティクルの読み値', 'Reticle reading')}
        value={apparent.value}
        onChange={(value) => setApparent({ ...apparent, value })}
        units={{
          value: apparent.unit,
          label: t('目盛りの単位', 'Reticle unit'),
          options: reticleUnits,
          onChange: (unit: ReticleUnit) => setApparent({ ...apparent, unit }),
        }}
        min={0}
        invalid={apparentInvalid || readingTooLarge}
        errorText={readingTooLarge ? readingTooLargeError : positiveError}
        hint={t(
          '対象を視野の中心に置き、端から端までを読む',
          'Put the target at the centre of the view and read it edge to edge',
        )}
      />
    ),
    usesDistance && (
      <NumberField
        key="distance"
        label={t('距離', 'Distance')}
        value={distance.value}
        onChange={(value) => setDistance({ ...distance, value })}
        units={{
          value: distance.unit,
          label: t('距離の単位', 'Distance unit'),
          options: distanceUnits,
          onChange: (unit: DistanceUnit) => setDistance({ ...distance, unit }),
        }}
        min={0}
        invalid={distanceInvalid}
        errorText={positiveError}
      />
    ),
  ].filter(Boolean);

  // The solved quantity's unit sets the answer's unit, so its picker sits with the answer.
  const answerUnit = {
    distance: {
      value: distance.unit as string,
      options: distanceUnits,
      onChange: (unit: string) => setDistance({ ...distance, unit: unit as DistanceUnit }),
    },
    size: {
      value: targetSize.unit as string,
      options: sizeUnits,
      onChange: (unit: string) => setTargetSize({ ...targetSize, unit: unit as TargetSizeUnit }),
    },
    apparent: {
      value: apparent.unit as string,
      options: reticleUnits,
      onChange: (unit: string) => setApparent({ ...apparent, unit: unit as ReticleUnit }),
    },
  }[solveFor];

  const misreadSummary =
    result && result.sensitivity.nearMeters !== null && result.sensitivity.farMeters !== null
      ? t(
          `±${number(READING_STEP, 1)} ${reticleLabel(apparent.unit)} の読み違いで ${distanceText(result.sensitivity.nearMeters, distance.unit)} – ${distanceText(result.sensitivity.farMeters, distance.unit)}${result.sensitivity.worstShare !== null ? `（最大 ${number(result.sensitivity.worstShare * 100, 1)} %）` : ''}`,
          `±${number(READING_STEP, 1)} ${reticleLabel(apparent.unit)} misread: ${distanceText(result.sensitivity.nearMeters, distance.unit)} – ${distanceText(result.sensitivity.farMeters, distance.unit)}${result.sensitivity.worstShare !== null ? ` (up to ${number(result.sensitivity.worstShare * 100, 1)} %)` : ''}`,
        )
      : spreadText;

  const reticleSummary =
    focalPlane === 'ffp'
      ? t('FFP・倍率による補正なし', 'FFP, no correction')
      : t(
          `SFP・${number(magnification.calibration)} × で正しい目盛りを ${number(magnification.used)} × で使用`,
          `SFP, calibrated at ${number(magnification.calibration)}×, used at ${number(magnification.used)}×`,
        );

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('reticle-ranging').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: 'すべての入力を初期値に戻します。',
                  en: 'All inputs return to their defaults.',
                }}
                onReset={() =>
                  useReticleRangingStore.setState({
                    ...initialReticleRangingSettings,
                    lastValidSettings: initialReticleRangingSettings,
                  })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty so the text is announced when it arrives; separate from the result summary. */}
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
              <h2 id="ranging" className="text-xl font-medium">
                {t('レティクルで測る', 'Range with the reticle')}
              </h2>
              <SegmentedControl
                legend={t('求める値', 'Solve for')}
                orientation="inline"
                value={solveFor}
                options={modes}
                onChange={(value) => setSolveFor(value as SolveFor)}
              />
              {/* Stacked on a phone so the number has room beside the unit picker. */}
              <div className="grid items-start gap-4 sm:grid-cols-2">{inputFields}</div>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {answerLabel}
              </h2>
              <ResultPanel>
                <ResultFigure
                  size="lead"
                  label={givenText}
                  value={answer ? answer.primary : '—'}
                  note={answer?.secondary}
                />
              </ResultPanel>
              {result && result.scale !== 1 && (
                <p className="text-sm text-on-surface-variant tabular-nums">
                  {t(
                    `SFP の補正：読み値 ${readingText(apparent.unit)} は、実際には ${number(apparent.unit === 'mil' ? result.trueMil : result.trueMoa)} ${reticleLabel(apparent.unit)} に相当します。`,
                    `SFP correction: a reading of ${readingText(apparent.unit)} is actually ${number(apparent.unit === 'mil' ? result.trueMil : result.trueMoa)} ${reticleLabel(apparent.unit)}.`,
                  )}
                </p>
              )}
              {!result && (
                <p className="text-sm text-destructive">
                  {readingTooLarge
                    ? readingTooLargeError
                    : t('必要な 2 つの値を入力してください。', 'Enter the two known values.')}
                </p>
              )}
              <SegmentedControl
                legend={t('答えの単位', 'Answer unit')}
                orientation="inline"
                value={answerUnit.value}
                options={answerUnit.options}
                onChange={answerUnit.onChange}
              />
            </Card>
          }
          secondary={
            // Open at SFP, where the magnification changes in use. Remounted once the saved focal plane
            // is read, since the section takes its opening state only when it mounts.
            <ConditionSection
              key={ready ? 'saved' : 'initial'}
              id="reticle"
              title={t('レティクル', 'Reticle')}
              summary={reticleSummary}
              defaultOpen={focalPlane === 'sfp'}
              // At SFP the reading limit depends on the magnification, so that error opens it too.
              forceOpen={calibrationInvalid || usedInvalid || (focalPlane === 'sfp' && readingTooLarge)}
            >
              <SegmentedControl
                legend={t('レティクルの面', 'Focal plane')}
                orientation="inline"
                value={focalPlane}
                options={[
                  { value: 'ffp', label: t('FFP（第一焦点面）', 'FFP (first focal plane)') },
                  { value: 'sfp', label: t('SFP（第二焦点面）', 'SFP (second focal plane)') },
                ]}
                onChange={(value) => setFocalPlane(value as FocalPlane)}
              />
              {focalPlane === 'sfp' && (
                <div className="grid grid-cols-2 items-start gap-4">
                  <NumberField
                    label={t('目盛りが正しい倍率', 'Calibrated magnification')}
                    unit="×"
                    value={magnification.calibration}
                    onChange={(calibration) => setMagnification({ ...magnification, calibration })}
                    min={0}
                    invalid={calibrationInvalid}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('実際に使った倍率', 'Magnification in use')}
                    unit="×"
                    value={magnification.used}
                    onChange={(used) => setMagnification({ ...magnification, used })}
                    min={0}
                    invalid={usedInvalid}
                    errorText={positiveError}
                  />
                </div>
              )}
              <p className="text-xs text-on-surface-variant">
                {t(
                  'FFP はどの倍率でも読み値をそのまま使えます。SFP は目盛りが正しい倍率でだけ使えます。',
                  'FFP reads true at any magnification. SFP reads true only at the calibrated magnification.',
                )}
              </p>
            </ConditionSection>
          }
          extras={
            <>
              <ConditionSection
                id="misread"
                title={t('読み違えたときの距離', 'If the reading is off')}
                summary={misreadSummary}
              >
                <dl className="grid gap-4 rounded-sm bg-surface-container p-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm">{t('目盛りを多く読んだ場合', 'Reading too high')}</dt>
                    <dd className="mt-1 text-lg font-medium tabular-nums">
                      {result && result.sensitivity.nearMeters !== null
                        ? distanceText(result.sensitivity.nearMeters, distance.unit)
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm">{t('目盛りを少なく読んだ場合', 'Reading too low')}</dt>
                    <dd className="mt-1 text-lg font-medium tabular-nums">
                      {result && result.sensitivity.farMeters !== null
                        ? distanceText(result.sensitivity.farMeters, distance.unit)
                        : '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm">{t('推定距離のブレ', 'Error in the estimate')}</dt>
                    <dd className="mt-1 text-sm text-on-surface-variant tabular-nums">{spreadText}</dd>
                  </div>
                </dl>
                <dl className="rounded-sm bg-surface-container p-4">
                  <dt className="text-sm">
                    {t('対象の実寸が 10 % ずれていた場合', 'If the target size is off by 10 %')}
                  </dt>
                  <dd className="mt-1 text-lg font-medium tabular-nums">
                    {result
                      ? `${distanceText(result.sizeUncertainty.lowMeters, distance.unit)} – ${distanceText(result.sizeUncertainty.highMeters, distance.unit)}`
                      : '—'}
                  </dd>
                </dl>
              </ConditionSection>

              <ConditionSection
                id="notes"
                title={t('計算方法', 'Method')}
                summary={t(
                  '距離 = 実寸 ÷ (2 × tan(読み値の角度 ÷ 2))',
                  'Distance = size ÷ (2 × tan(reading angle ÷ 2))',
                )}
              >
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      'MOA は 1/60 度、mil はミリラジアン（1/1000 rad）で、円を 6400 分割する NATO mil とは別の単位です。',
                      'MOA is 1/60 of a degree and mil is the milliradian (1/1000 rad), a different unit from the NATO mil of 1/6400 of a circle.',
                    )}
                  </li>
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
