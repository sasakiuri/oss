'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import { LuUpload } from 'react-icons/lu';

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
  SectionNav,
  SegmentedControl,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { readChronographFile } from '@/lib/chrono-import';
import { PUBLISHED_GROUP_SIZE_LIMIT } from '@/lib/group-statistics';
import { twistStabilityHandoff } from '@/lib/labs-handoff';
import { labsTool } from '@/lib/labs-tools';
import { VELOCITY_READINGS_MAX, VELOCITY_SPREAD_ROW_LIMIT } from '@/lib/schemas/velocity-spread';
import { fromMeters, toMeters, type DistanceUnit } from '@/lib/sight-adjustment';
import {
  altitudeInRange,
  altitudeRange,
  temperatureInRange,
  temperatureRange,
  fromMetersPerSecond,
  fromMetersToDropUnit,
  toMetersPerSecond,
  usesAltitude,
  usesPressureReading,
  type AltitudeUnit,
  type DragModel,
  type DropUnit,
  type PressureSource,
  type PressureUnit,
  type ShotDescription,
  type SightHeightUnit,
  type SpeedUnit,
  type TemperatureUnit,
} from '@/lib/trajectory';
import {
  SD_PRECISION_SHOT_LIMIT,
  SPREAD_WIDE_SIGMAS,
  VELOCITY_SAMPLE_LIMIT,
  parseVelocities,
  shotsForSdPrecision,
  summariseVelocities,
  verticalSpread,
} from '@/lib/velocity-spread';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialVelocitySpreadSettings, storageKey, useVelocitySpreadStore } from './_store';

export function VelocitySpreadClient() {
  const {
    readings,
    speedUnit,
    ballisticCoefficient,
    dragModel,
    sightHeight,
    distanceUnit,
    zeroDistance,
    step,
    maxRange,
    dropUnit,
    sdPrecisionPercent,
    atmosphere,
    setReadings,
    setSpeedUnit,
    setBallisticCoefficient,
    setDragModel,
    setSightHeight,
    setSightHeightUnit,
    setDistanceUnit,
    setZeroDistance,
    setStep,
    setMaxRange,
    setDropUnit,
    setSdPrecisionPercent,
    setAtmosphere,
  } = useVelocitySpreadStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useVelocitySpreadStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const parsed = useMemo(() => parseVelocities(readings), [readings]);
  const summary = useMemo(
    () => summariseVelocities(parsed.values.map((value) => toMetersPerSecond(value, speedUnit))),
    [parsed.values, speedUnit],
  );

  const distances = useMemo(() => {
    if (!(step > 0) || !(maxRange > 0)) return [];
    const count = Math.min(Math.floor(maxRange / step + 1e-9), VELOCITY_SPREAD_ROW_LIMIT);
    return Array.from({ length: count }, (_, index) => toMeters(step * (index + 1), distanceUnit));
  }, [step, maxRange, distanceUnit]);

  const shot: ShotDescription | null = useMemo(
    () =>
      summary === null
        ? null
        : {
            // The muzzle velocity is the average of the readings.
            muzzleSpeed: { value: summary.meanMs, unit: 'mps' },
            ballisticCoefficient,
            dragModel,
            sightHeight,
            atmosphere,
          },
    [summary, ballisticCoefficient, dragModel, sightHeight, atmosphere],
  );

  // Deferred: the spread runs five trajectories per distance.
  const spreadInput = useMemo(
    () => ({ shot, zeroDistance: toMeters(zeroDistance, distanceUnit), distances, sdMs: summary?.sdMs ?? NaN }),
    [shot, zeroDistance, distanceUnit, distances, summary?.sdMs],
  );
  const deferred = useDeferredValue(spreadInput);
  const rows = useMemo(
    () =>
      deferred.shot === null || deferred.distances.length === 0
        ? null
        : verticalSpread(deferred.shot, deferred.zeroDistance, deferred.distances, deferred.sdMs),
    [deferred],
  );

  const number = (value: number, digits = 1) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const speedLabel = speedUnit === 'mps' ? 'm/s' : 'fps';
  const speed = (metersPerSecond: number, digits = 1) =>
    `${number(fromMetersPerSecond(metersPerSecond, speedUnit), digits)} ${speedLabel}`;
  const offset = (meters: number) => `${number(fromMetersToDropUnit(meters, dropUnit), 1)} ${dropUnit}`;
  const distance = (meters: number) => `${number(fromMeters(meters, distanceUnit), 0)} ${distanceUnit}`;

  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');
  const coefficientError = t('0.01 から 2 の間で入力してください。', 'Enter a coefficient between 0.01 and 2.');
  const percentError = t('1 から 100 の間で入力してください。', 'Enter a percentage between 1 and 100.');
  const temperatureBounds = temperatureRange(atmosphere.temperature.unit);
  const altitudeBounds = altitudeRange(atmosphere.altitude.unit);
  const temperatureUnitLabel = atmosphere.temperature.unit === 'c' ? '°C' : '°F';
  const altitudeUnitLabel = atmosphere.altitude.unit === 'm' ? 'm' : 'ft';
  const temperatureError = t(
    `${temperatureBounds.min} から ${temperatureBounds.max} ${temperatureUnitLabel} の間で入力してください。`,
    `Enter a temperature between ${temperatureBounds.min} and ${temperatureBounds.max} ${temperatureUnitLabel}.`,
  );
  const altitudeError = t(
    `${altitudeBounds.min} から ${altitudeBounds.max} ${altitudeUnitLabel} の間で入力してください。`,
    `Enter an altitude between ${altitudeBounds.min} and ${altitudeBounds.max} ${altitudeUnitLabel}.`,
  );

  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const showsPressure = usesPressureReading(atmosphere.source);
  const showsAltitude = usesAltitude(atmosphere.source);

  const shots = shotsForSdPrecision(sdPrecisionPercent / 100);
  const farthest = rows?.at(-1);

  const spoken =
    summary === null
      ? parsed.values.length === 1
        ? t('2 発以上の初速を入力してください。', 'Enter two or more velocities.')
        : t('初速を 1 行に 1 つずつ入力してください。', 'Enter the velocities, one per line.')
      : t(
          `${summary.count} 発の平均 ${speed(summary.meanMs)}、標準偏差 ${speed(summary.sdMs)}（95 % 区間 ${speed(summary.sdInterval?.lowMs ?? NaN)} 〜 ${speed(summary.sdInterval?.highMs ?? NaN)}）。${farthest ? `${distance(farthest.distanceMeters)} での縦の広がり（±1 偏差）は ${offset(farthest.spreadMeters)}。` : ''}`,
          `${summary.count} shots: average ${speed(summary.meanMs)}, SD ${speed(summary.sdMs)} (95 % interval ${speed(summary.sdInterval?.lowMs ?? NaN)} to ${speed(summary.sdInterval?.highMs ?? NaN)}).${farthest ? ` Vertical spread (±1 SD) at ${distance(farthest.distanceMeters)}: ${offset(farthest.spreadMeters)}.` : ''}`,
        );

  useEffect(() => {
    // Announce once typing settles, not on every keystroke.
    if (!ready) return;
    const timer = window.setTimeout(() => setAnnouncement(spoken), 700);
    return () => window.clearTimeout(timer);
  }, [ready, spoken]);

  const readingsId = useId();
  const [importMessage, setImportMessage] = useState<[string, string] | null>(null);
  const importFile = async (file: File) => {
    const result = readChronographFile(await file.text());
    if (result.kind === 'error') {
      setImportMessage(
        {
          'unknown-format': [
            'このファイルの形式は読み取れません。ShotView と LabRadar（初代）の CSV に対応しています。',
            'This file’s layout is not recognised. ShotView and original LabRadar CSV files are supported.',
          ] as [string, string],
          'no-shots': ['ファイルに初速の行がありませんでした。', 'The file has no velocity rows.'] as [string, string],
          unit: [
            'ファイルの速度の単位を確かめられないため、読み込みませんでした。',
            'The file’s speed unit could not be confirmed, so it was not loaded.',
          ] as [string, string],
        }[result.problem],
      );
      return;
    }
    const text = result.velocities.join('\n');
    if (text.length > VELOCITY_READINGS_MAX) {
      setImportMessage([
        `${result.velocities.length} 発は多すぎて入りません。`,
        `${result.velocities.length} readings are too many to hold.`,
      ]);
      return;
    }
    if (
      readings.trim() !== '' &&
      !window.confirm(
        t('入力済みの初速をファイルの値で置き換えますか？', 'Replace the readings with the ones in the file?'),
      )
    )
      return;
    // The file says which unit the chronograph recorded in, so the readings keep it rather than being converted.
    setSpeedUnit(result.unit);
    setReadings(text);
    const source = result.format === 'shotview' ? 'Garmin ShotView' : 'LabRadar';
    const unitLabel = result.unit === 'mps' ? 'm/s' : 'fps';
    setImportMessage([
      `${source} のファイル${result.session ? `「${result.session}」` : ''}から ${result.velocities.length} 発（${unitLabel}）を読み込みました。`,
      `Loaded ${result.velocities.length} readings (${unitLabel}) from the ${source} file${result.session ? ` “${result.session}”` : ''}.`,
    ]);
  };

  const pressureSourceLabel: Record<PressureSource, string> = {
    station: t('現地で測った気圧', 'Measured station pressure'),
    'sea-level': t('海面更正気圧（予報値）と標高', 'Sea-level pressure and altitude'),
    altitude: t('標高だけ（標準大気）', 'Altitude only (standard atmosphere)'),
  };

  const coefficientInvalid =
    !Number.isFinite(ballisticCoefficient) || ballisticCoefficient < 0.01 || ballisticCoefficient > 2;
  const sightHeightInvalid = !Number.isFinite(sightHeight.value) || sightHeight.value < 0;
  const loadInvalid =
    coefficientInvalid || sightHeightInvalid || !positive(zeroDistance) || !positive(step) || !positive(maxRange);
  const temperatureInvalid = !temperatureInRange(atmosphere.temperature.value, atmosphere.temperature.unit);
  const pressureInvalid = showsPressure && !positive(atmosphere.pressure.value);
  const altitudeInvalid = showsAltitude && !altitudeInRange(atmosphere.altitude.value, atmosphere.altitude.unit);
  const precisionInvalid = !Number.isFinite(sdPrecisionPercent) || sdPrecisionPercent < 1 || sdPrecisionPercent > 100;

  const separator = t('・', ' · ');
  const loadSummary = [
    `BC ${number(ballisticCoefficient, 3)} (${dragModel.toUpperCase()})`,
    t(
      `スコープ高 ${number(sightHeight.value, 2)} ${sightHeight.unit}`,
      `sight height ${number(sightHeight.value, 2)} ${sightHeight.unit}`,
    ),
    t(`ゼロイン ${number(zeroDistance, 0)} ${distanceUnit}`, `zero ${number(zeroDistance, 0)} ${distanceUnit}`),
    t(
      `${number(step, 0)} ${distanceUnit} 刻みで ${number(maxRange, 0)} ${distanceUnit} まで`,
      `every ${number(step, 0)} ${distanceUnit} to ${number(maxRange, 0)} ${distanceUnit}`,
    ),
  ].join(separator);

  const atmosphereSummary = [
    `${number(atmosphere.temperature.value, 1)} ${temperatureUnitLabel}`,
    showsPressure
      ? `${number(atmosphere.pressure.value, 2)} ${atmosphere.pressure.unit === 'hpa' ? 'hPa' : 'inHg'}`
      : null,
    showsAltitude
      ? t(
          `標高 ${number(atmosphere.altitude.value, 0)} ${altitudeUnitLabel}`,
          `altitude ${number(atmosphere.altitude.value, 0)} ${altitudeUnitLabel}`,
        )
      : null,
    pressureSourceLabel[atmosphere.source],
  ]
    .filter(Boolean)
    .join(separator);

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'the-velocities-you-measured', label: t('測定した初速', 'Velocities') },
            { id: 'what-the-string-says', label: t('ばらつき', 'Spread') },
            { id: 'the-load-and-the-sight', label: t('弾と照準', 'Load and sight') },
            { id: 'atmosphere', label: t('大気', 'Atmosphere') },
            { id: 'vertical-spread-at-each-distance', label: t('距離ごとの広がり', 'By distance') },
            { id: 'method-and-source', label: t('計算方法', 'Method') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('velocity-spread').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '初速の記録と、弾・照準・大気の条件を初期値に戻します。',
                  en: 'Resets the readings, load, sight and atmosphere to the defaults.',
                }}
                onReset={() =>
                  useVelocitySpreadStore.setState({
                    ...initialVelocitySpreadSettings,
                    lastValidSettings: initialVelocitySpreadSettings,
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
          resultLabel={t('SD と ES', 'SD and ES')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="the-velocities-you-measured" className="text-xl font-medium">
                {t('測定した初速', 'Measured velocities')}
              </h2>
              {/* Changing the unit rereads the readings; it does not convert them. */}
              <div className="space-y-3">
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
                <div className="min-w-0 space-y-2">
                  <label htmlFor={readingsId} className="block text-sm font-medium">
                    {t('初速の記録', 'Readings')}{' '}
                    <span className="font-normal text-on-surface-variant">({speedLabel})</span>
                  </label>
                  <textarea
                    id={readingsId}
                    rows={8}
                    inputMode="decimal"
                    maxLength={VELOCITY_READINGS_MAX}
                    value={readings}
                    onChange={(event) => setReadings(event.target.value)}
                    aria-describedby={`${readingsId}-count`}
                    className="w-full tabular-nums"
                  />
                  <p id={`${readingsId}-count`} className="text-xs text-on-surface-variant">
                    {t(
                      `1 行に 1 つかカンマ区切り。${parsed.values.length} 件を読み取りました（${VELOCITY_SAMPLE_LIMIT} 件まで）。`,
                      `One per line or comma-separated. ${parsed.values.length} readings (up to ${VELOCITY_SAMPLE_LIMIT}).`,
                    )}
                  </p>
                  {parsed.invalid.length > 0 && (
                    <p className="text-sm text-destructive">
                      {t(
                        `読み取れない値: ${parsed.invalid.join('、')}`,
                        `Could not read: ${parsed.invalid.join(', ')}`,
                      )}
                    </p>
                  )}
                  {parsed.values.length > VELOCITY_SAMPLE_LIMIT && (
                    <p className="text-sm text-destructive">
                      {t(
                        `${VELOCITY_SAMPLE_LIMIT} 件までを集計します。`,
                        `Up to ${VELOCITY_SAMPLE_LIMIT} readings are used.`,
                      )}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    id={`${readingsId}-file`}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="peer sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void importFile(file);
                    }}
                  />
                  <label
                    htmlFor={`${readingsId}-file`}
                    className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-6 text-sm font-medium text-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                  >
                    <LuUpload aria-hidden="true" className="size-[18px]" />
                    {t('弾速計の CSV を読み込む', 'Load a chronograph CSV')}
                  </label>
                  <p className="text-xs text-on-surface-variant">
                    {t(
                      'Garmin ShotView（Xero C1）、LabRadar（初代）の CSV。',
                      'Garmin ShotView (Xero C1) or original LabRadar CSV.',
                    )}
                  </p>
                  <p role="status" className="text-sm">
                    {importMessage ? t(...importMessage) : ''}
                  </p>
                </div>
              </div>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="what-the-string-says" className="text-xl font-medium">
                {t('SD と ES', 'SD and ES')}
              </h2>
              {summary === null && <p className="text-sm text-on-surface-variant">{spoken}</p>}
              {summary !== null && (
                <>
                  <ResultPanel className="grid-cols-2">
                    <ResultFigure
                      size="lead"
                      label={t('標準偏差 SD', 'Standard deviation (SD)')}
                      value={speed(summary.sdMs)}
                      note={
                        summary.sdInterval
                          ? t(
                              `95 % 区間 ${speed(summary.sdInterval.lowMs)} 〜 ${speed(summary.sdInterval.highMs)}`,
                              `95 % interval ${speed(summary.sdInterval.lowMs)} to ${speed(summary.sdInterval.highMs)}`,
                            )
                          : '—'
                      }
                    />
                    <ResultFigure
                      label={t(`最大最小差 ES（${summary.count} 発）`, `Extreme spread (ES), ${summary.count} shots`)}
                      value={speed(summary.extremeSpreadMs)}
                      note={
                        summary.expectedSpread
                          ? t(
                              `この SD なら ${summary.count} 発で平均 ${speed(summary.expectedSpread.meanMs)}、95 % が ${speed(summary.expectedSpread.p025Ms)} 〜 ${speed(summary.expectedSpread.p975Ms)}`,
                              `Expected for this SD over ${summary.count} shots: ${speed(summary.expectedSpread.meanMs)} on average, 95 % between ${speed(summary.expectedSpread.p025Ms)} and ${speed(summary.expectedSpread.p975Ms)}`,
                            )
                          : t(
                              `期待値は ${PUBLISHED_GROUP_SIZE_LIMIT} 発まで`,
                              `Expected ES available up to ${PUBLISHED_GROUP_SIZE_LIMIT} shots`,
                            )
                      }
                    />
                    <ResultFigure
                      label={t('平均', 'Average')}
                      value={speed(summary.meanMs)}
                      note={t(
                        `95 % 区間 ${speed(summary.meanInterval.lowMs)} 〜 ${speed(summary.meanInterval.highMs)}`,
                        `95 % interval ${speed(summary.meanInterval.lowMs)} to ${speed(summary.meanInterval.highMs)}`,
                      )}
                    />
                    <ResultFigure
                      label={t('変動係数', 'Coefficient of variation')}
                      value={`${number(summary.coefficientOfVariation * 100, 2)} %`}
                      note={t(
                        `補正済み SD ${speed(summary.sdUnbiasedMs)}`,
                        `Bias-corrected SD ${speed(summary.sdUnbiasedMs)}`,
                      )}
                    />
                  </ResultPanel>
                  {/* The mean, as shown, carried into the next tool that asks for a muzzle velocity. */}
                  <Link
                    href={twistStabilityHandoff.href({
                      muzzleSpeed: Number(fromMetersPerSecond(summary.meanMs, speedUnit).toFixed(1)),
                      speedUnit,
                    })}
                    className="inline-block text-sm font-medium text-primary hover:underline"
                  >
                    {t('この平均初速でライフリングの安定を計算', 'Check twist and stability at this average velocity')}
                  </Link>
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      '発数の違う ES どうしは比べられません。装弾の比較は SD で、SD の差が 95 % 区間に収まるなら差があるとは言えません。',
                      'Only compare ES over the same number of shots. Compare loads by SD; a difference inside the 95 % interval is not significant.',
                    )}
                  </p>
                  <div className="space-y-2">
                    <NumberField
                      label={t('標準偏差の目標精度', 'Target SD precision')}
                      unit="%"
                      hint={t('SD に対する ± の幅', '± as a percentage of the SD')}
                      value={sdPrecisionPercent}
                      onChange={setSdPrecisionPercent}
                      min={1}
                      max={100}
                      invalid={precisionInvalid}
                      errorText={percentError}
                    />
                    <p className="text-sm text-on-surface-variant">
                      {shots === null
                        ? t(
                            `${SD_PRECISION_SHOT_LIMIT} 発を超えるため、実射では決まりません。精度を緩めてください。`,
                            `Needs more than ${SD_PRECISION_SHOT_LIMIT} shots. Use a wider precision.`,
                          )
                        : t(
                            `±${number(sdPrecisionPercent, 0)} % には ${shots} 発必要です（現在 ${summary.count} 発）。`,
                            `±${number(sdPrecisionPercent, 0)} % takes ${shots} shots (you have ${summary.count}).`,
                          )}
                    </p>
                  </div>
                </>
              )}
            </Card>
          }
          secondary={
            <>
              <ConditionSection
                id="the-load-and-the-sight"
                title={t('弾と照準', 'Load and sight')}
                summary={loadSummary}
                forceOpen={loadInvalid}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label={t('弾道係数', 'Ballistic coefficient')}
                    value={ballisticCoefficient}
                    onChange={setBallisticCoefficient}
                    units={{
                      value: dragModel,
                      label: t('抗力モデル', 'Drag model'),
                      options: [
                        { value: 'g1', label: 'G1' },
                        { value: 'g7', label: 'G7' },
                      ],
                      onChange: (model: DragModel) => setDragModel(model),
                    }}
                    min={0.01}
                    max={2}
                    invalid={coefficientInvalid}
                    errorText={coefficientError}
                  />
                  <NumberField
                    label={t('スコープ高', 'Sight height')}
                    value={sightHeight.value}
                    onChange={setSightHeight}
                    units={{
                      value: sightHeight.unit,
                      label: t('スコープ高の単位', 'Sight height unit'),
                      options: [
                        { value: 'mm', label: 'mm' },
                        { value: 'inch', label: 'inch' },
                      ],
                      onChange: (unit: SightHeightUnit) => setSightHeightUnit(unit),
                    }}
                    min={0}
                    invalid={sightHeightInvalid}
                    errorText={nonNegativeError}
                  />
                  <NumberField
                    label={t('ゼロイン距離', 'Zero distance')}
                    value={zeroDistance}
                    onChange={setZeroDistance}
                    units={{
                      value: distanceUnit,
                      label: t('距離の単位', 'Distance unit'),
                      options: [
                        { value: 'm', label: 'm' },
                        { value: 'yd', label: 'yd' },
                      ],
                      onChange: (unit: DistanceUnit) => setDistanceUnit(unit),
                    }}
                    min={0}
                    invalid={!positive(zeroDistance)}
                    errorText={positiveError}
                    hint={t('単位を切り替えても数値は換算しません。', 'Switching units does not convert the numbers.')}
                  />
                  <NumberField
                    label={t('距離の刻み', 'Distance step')}
                    unit={distanceUnit}
                    value={step}
                    onChange={setStep}
                    min={0}
                    invalid={!positive(step)}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('最大距離', 'Longest distance')}
                    unit={distanceUnit}
                    value={maxRange}
                    onChange={setMaxRange}
                    min={0}
                    invalid={!positive(maxRange)}
                    errorText={positiveError}
                  />
                </div>
              </ConditionSection>

              <ConditionSection
                id="atmosphere"
                title={t('大気条件', 'Atmosphere')}
                summary={atmosphereSummary}
                forceOpen={temperatureInvalid || pressureInvalid || altitudeInvalid}
              >
                <SelectField
                  label={t('気圧の求め方', 'Pressure from')}
                  value={atmosphere.source}
                  onChange={(value) => setAtmosphere({ ...atmosphere, source: value as PressureSource })}
                  options={(['station', 'sea-level', 'altitude'] as const).map((value) => ({
                    value,
                    label: pressureSourceLabel[value],
                  }))}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Changing a unit here rereads the number; it does not convert it. */}
                  <NumberField
                    label={t('気温', 'Temperature')}
                    units={{
                      value: atmosphere.temperature.unit,
                      label: t('気温の単位', 'Temperature unit'),
                      options: [
                        { value: 'c', label: '°C' },
                        { value: 'f', label: '°F' },
                      ],
                      onChange: (unit: TemperatureUnit) =>
                        setAtmosphere({ ...atmosphere, temperature: { ...atmosphere.temperature, unit } }),
                    }}
                    value={atmosphere.temperature.value}
                    onChange={(value) =>
                      setAtmosphere({ ...atmosphere, temperature: { ...atmosphere.temperature, value } })
                    }
                    min={temperatureBounds.min}
                    max={temperatureBounds.max}
                    invalid={temperatureInvalid}
                    errorText={temperatureError}
                  />
                  {showsPressure && (
                    <NumberField
                      label={t('気圧', 'Pressure')}
                      units={{
                        value: atmosphere.pressure.unit,
                        label: t('気圧の単位', 'Pressure unit'),
                        options: [
                          { value: 'hpa', label: 'hPa' },
                          { value: 'inhg', label: 'inHg' },
                        ],
                        onChange: (unit: PressureUnit) =>
                          setAtmosphere({ ...atmosphere, pressure: { ...atmosphere.pressure, unit } }),
                      }}
                      value={atmosphere.pressure.value}
                      onChange={(value) =>
                        setAtmosphere({ ...atmosphere, pressure: { ...atmosphere.pressure, value } })
                      }
                      min={0}
                      invalid={pressureInvalid}
                      errorText={positiveError}
                    />
                  )}
                  {showsAltitude && (
                    <NumberField
                      label={t('標高', 'Altitude')}
                      units={{
                        value: atmosphere.altitude.unit,
                        label: t('標高の単位', 'Altitude unit'),
                        options: [
                          { value: 'm', label: 'm' },
                          { value: 'ft', label: 'ft' },
                        ],
                        onChange: (unit: AltitudeUnit) =>
                          setAtmosphere({ ...atmosphere, altitude: { ...atmosphere.altitude, unit } }),
                      }}
                      value={atmosphere.altitude.value}
                      onChange={(value) =>
                        setAtmosphere({ ...atmosphere, altitude: { ...atmosphere.altitude, value } })
                      }
                      min={altitudeBounds.min}
                      max={altitudeBounds.max}
                      invalid={altitudeInvalid}
                      errorText={altitudeError}
                    />
                  )}
                </div>
              </ConditionSection>
            </>
          }
          extras={
            <>
              {/* min-w-0 lets the table scroll inside the card on a phone. */}
              <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
                <div className="space-y-2">
                  <h2 id="vertical-spread-at-each-distance" className="text-xl font-medium">
                    {t('距離ごとの縦の広がり', 'Vertical spread at each distance')}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      `初速の差だけによる上下の差で、実際の群はこれより大きくなります。95 % 幅は ±${number(SPREAD_WIDE_SIGMAS, 2)} SD。`,
                      `From velocity alone; a real group is larger. The 95 % band is ±${number(SPREAD_WIDE_SIGMAS, 2)} SD.`,
                    )}
                  </p>
                </div>
                <div className="sm:max-w-xs">
                  <SegmentedControl
                    legend={t('広がりの単位', 'Spread unit')}
                    orientation="inline"
                    value={dropUnit}
                    onChange={(value) => setDropUnit(value as DropUnit)}
                    options={[
                      { value: 'cm', label: 'cm' },
                      { value: 'inch', label: 'inch' },
                    ]}
                  />
                </div>
                {rows === null || rows.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      '2 発以上の初速と、弾と照準の条件を入力してください。',
                      'Enter two or more velocities and the load and sight.',
                    )}
                  </p>
                ) : (
                  <>
                    {/* Cells stay on one line and the table scrolls; the region is focusable for keyboard scrolling. */}
                    <div
                      role="region"
                      aria-label={t('距離ごとの縦の広がりの表', 'Vertical spread at each distance')}
                      tabIndex={0}
                      className="overflow-auto rounded-sm border border-outline-variant"
                    >
                      <table className="w-full text-sm">
                        <caption className="sr-only">
                          {t('距離ごとの縦の広がり', 'Vertical spread at each distance')}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col" className="px-2 py-2 sm:px-3 text-left font-medium whitespace-nowrap">
                              {t('射距離', 'Distance')}
                            </th>
                            <th scope="col" className="px-2 py-2 sm:px-3 text-right font-medium">
                              {t('落差', 'Drop')}
                            </th>
                            <th scope="col" className="px-2 py-2 sm:px-3 text-right font-medium">
                              ±1 SD
                            </th>
                            <th scope="col" className="px-2 py-2 sm:px-3 text-right font-medium">
                              ±1 SD (MOA)
                            </th>
                            <th scope="col" className="px-2 py-2 sm:px-3 text-right font-medium">
                              {t('95 % 幅', '95 % band')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.distanceMeters} className="border-t border-outline-variant">
                              <th
                                scope="row"
                                className="px-2 py-2 sm:px-3 text-left font-normal whitespace-nowrap tabular-nums"
                              >
                                {distance(row.distanceMeters)}
                              </th>
                              <td className="px-2 py-2 sm:px-3 text-right whitespace-nowrap tabular-nums">
                                {offset(row.dropMeters)}
                              </td>
                              <td className="px-2 py-2 sm:px-3 text-right whitespace-nowrap tabular-nums">
                                {offset(row.spreadMeters)}
                              </td>
                              <td className="px-2 py-2 sm:px-3 text-right whitespace-nowrap tabular-nums">
                                {number(row.spreadMoa, 2)}
                              </td>
                              <td className="px-2 py-2 sm:px-3 text-right whitespace-nowrap tabular-nums">
                                {offset(row.spreadWideMeters)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Card>
              <ConditionSection
                id="method-and-source"
                title={t('計算方法と出典', 'Method and source')}
                summary={t('t 分布、カイ二乗分布、Ballistipedia', 't and chi-squared distributions, Ballistipedia')}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '平均の区間は t 分布、標準偏差の区間はカイ二乗分布から求めます。標準偏差の区間は上下で非対称で、少ない発数では標準偏差が小さく出やすくなります。補正済み SD は、Ballistipedia「Closed Form Precision」のガウス補正係数によります。',
                    'The interval on the average uses the t distribution and the interval on the SD the chi-squared distribution. The SD interval is asymmetric, and a short string tends to understate the SD. The bias-corrected SD uses the Gaussian correction factor from Ballistipedia, "Closed Form Precision".',
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    `ES の期待値は、Ballistipedia が配布する範囲統計の表（標準偏差の倍数、${PUBLISHED_GROUP_SIZE_LIMIT} 発まで）によります。`,
                    `The expected ES comes from the range statistics table distributed by Ballistipedia (in multiples of the SD, up to ${PUBLISHED_GROUP_SIZE_LIMIT} shots).`,
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '距離ごとの広がりは、平均初速で一度だけゼロインし、同じ銃口角で初速だけを変えて求めます。そのため、ゼロイン距離でも差は 0 になりません。弾道は「弾道計算とゼロイン」と同じ質点モデルで、G1・G7 の標準抗力表を数値積分します。',
                    'The spread by distance zeroes once at the average velocity, then changes only the velocity at the same departure angle, so it is not zero at the zero distance. The trajectory uses the same point-mass model as the Ballistic Calculator, integrating the G1 and G7 standard drag tables.',
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '計測器の誤差は含みません。機種によっては装弾のばらつきと同程度です。',
                    'Chronograph error is not included. On some units it is as large as the spread being measured.',
                  )}
                </p>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
