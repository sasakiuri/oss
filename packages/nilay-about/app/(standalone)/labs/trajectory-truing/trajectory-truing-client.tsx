'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

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
import { labsTool } from '@/lib/labs-tools';
import {
  TRUING_MEASUREMENT_LIMIT,
  TRUING_TOLERANCE_FLOOR_METERS,
  toleranceMeters,
} from '@/lib/schemas/trajectory-truing';
import { fromMeters, type DistanceUnit } from '@/lib/sight-adjustment';
import {
  altitudeInRange,
  altitudeRange,
  temperatureInRange,
  temperatureRange,
  fromMetersPerSecond,
  fromMetersToDropUnit,
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
  BALLISTIC_COEFFICIENT_RANGE,
  MUZZLE_SPEED_SEARCH_FRACTION,
  solveTruing,
  type DropReading,
  type TruingTarget,
} from '@/lib/trajectory-truing';
import { convertAltitudeValue, convertPressureValue, convertTemperatureValue } from '@/lib/trajectory-units';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialTruingSettings, storageKey, useTruingStore } from './_store';

/** A cell in the table of groups: the label belongs to the column, so it is carried by the field. */
function CellField({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  invalid: boolean;
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step="any"
      aria-label={label}
      aria-invalid={invalid}
      value={Number.isFinite(value) ? value : ''}
      onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))}
      className="w-full text-right tabular-nums"
    />
  );
}

export function TrajectoryTruingClient() {
  const {
    muzzleSpeed,
    ballisticCoefficient,
    dragModel,
    sightHeight,
    distanceUnit,
    zeroDistance,
    dropUnit,
    reading,
    measurements,
    tolerance,
    target,
    atmosphere,
    setMuzzleSpeed,
    setSpeedUnit,
    setBallisticCoefficient,
    setDragModel,
    setSightHeight,
    setSightHeightUnit,
    setDistanceUnit,
    setZeroDistance,
    setDropUnit,
    setReading,
    setTarget,
    setTolerance,
    setAtmosphere,
    addMeasurement,
    updateMeasurement,
    removeMeasurement,
    applyFitted,
  } = useTruingStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const rowFieldId = (id: string) => `truing-row-${id}-distance`;
  const rowRemoveId = (id: string) => `truing-row-${id}-remove`;
  const addRowId = 'truing-add-row';

  /** Focuses the new row's distance field. The row is committed first so the field exists. */
  const addRow = () => {
    flushSync(() => addMeasurement());
    const rows = useTruingStore.getState().measurements;
    const added = rows[rows.length - 1];
    if (added) document.getElementById(rowFieldId(added.id))?.focus();
  };
  /** Moves focus to the row that took the removed one's place, then the row above, then the add button. */
  const removeRow = (index: number) => {
    const next = measurements[index + 1] ?? measurements[index - 1];
    const removed = measurements[index];
    if (!removed) return;
    flushSync(() => removeMeasurement(removed.id));
    document.getElementById(next ? rowRemoveId(next.id) : addRowId)?.focus();
  };

  useEffect(() => {
    void Promise.all([useTruingStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const shot: ShotDescription = useMemo(
    () => ({ muzzleSpeed, ballisticCoefficient, dragModel, sightHeight, atmosphere }),
    [muzzleSpeed, ballisticCoefficient, dragModel, sightHeight, atmosphere],
  );

  // Only rows with both numbers join the solve; a half-typed row does not blank the answer.
  const complete = useMemo(
    () =>
      measurements
        .filter((row) => Number.isFinite(row.distance) && row.distance > 0 && Number.isFinite(row.drop))
        .map((row) => ({ id: row.id, distance: row.distance, drop: row.drop })),
    [measurements],
  );

  const solveInput = useMemo(
    () => ({ shot, zeroDistance, distanceUnit, dropUnit, reading, measurements: complete, tolerance, target }),
    [shot, zeroDistance, distanceUnit, dropUnit, reading, complete, tolerance, target],
  );
  /** Deferred: the solve flies the bullet about seventy times on every keystroke. */
  const deferred = useDeferredValue(solveInput);
  const result = useMemo(() => (deferred.measurements.length === 0 ? null : solveTruing(deferred)), [deferred]);
  // Counted from the same input the answer came from.
  const solved = deferred.measurements.length;

  const number = (value: number, digits = 1) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const speedLabel = muzzleSpeed.unit === 'mps' ? 'm/s' : 'fps';
  /** A coefficient always to three decimals, so it lines up with the band ends; or a velocity. */
  const parameter = (value: number) =>
    target === 'ballistic-coefficient'
      ? new Intl.NumberFormat(language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)
      : `${number(fromMetersPerSecond(value, muzzleSpeed.unit), 0)} ${speedLabel}`;
  const offset = (meters: number | null) =>
    meters === null ? '—' : `${number(fromMetersToDropUnit(meters, dropUnit), 1)} ${dropUnit}`;
  const signedOffset = (meters: number | null) => {
    if (meters === null) return '—';
    // Signed as it is printed: a residual that rounds to nothing is 0, not +0 or -0.
    const value = Math.round(fromMetersToDropUnit(meters, dropUnit) * 10) / 10 || 0;
    // The sign is the whole reading here, so it is written even when the format would drop it.
    return `${value > 0 ? '+' : ''}${number(value, 1)} ${dropUnit}`;
  };
  const distance = (meters: number) => `${number(fromMeters(meters, distanceUnit), 0)} ${distanceUnit}`;

  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');
  const coefficientError = t(
    `${BALLISTIC_COEFFICIENT_RANGE.low} から ${BALLISTIC_COEFFICIENT_RANGE.high} の間で入力してください。`,
    `Enter a coefficient between ${BALLISTIC_COEFFICIENT_RANGE.low} and ${BALLISTIC_COEFFICIENT_RANGE.high}.`,
  );
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
  const coefficientInvalid =
    !Number.isFinite(ballisticCoefficient) ||
    ballisticCoefficient < BALLISTIC_COEFFICIENT_RANGE.low ||
    ballisticCoefficient > BALLISTIC_COEFFICIENT_RANGE.high;
  const temperatureInvalid = !temperatureInRange(atmosphere.temperature.value, atmosphere.temperature.unit);
  const showsPressure = usesPressureReading(atmosphere.source);
  const showsAltitude = usesAltitude(atmosphere.source);
  const pressureInvalid = showsPressure && !positive(atmosphere.pressure.value);
  const altitudeInvalid = showsAltitude && !altitudeInRange(atmosphere.altitude.value, atmosphere.altitude.unit);

  const readingLabel = reading === 'offset' ? dropUnit : reading === 'moa' ? 'MOA' : 'mil';
  const targetName = (value: TruingTarget) =>
    value === 'ballistic-coefficient' ? t('弾道係数', 'the ballistic coefficient') : t('初速', 'the muzzle velocity');
  const fixedName = (value: TruingTarget) =>
    value === 'ballistic-coefficient' ? t('初速', 'the muzzle velocity') : t('弾道係数', 'the ballistic coefficient');

  /** What the apply button writes: the fitted value rounded as shown. */
  const applyValue =
    result === null
      ? null
      : target === 'ballistic-coefficient'
        ? Math.round(result.fittedValue * 1000) / 1000
        : Math.round(fromMetersPerSecond(result.fittedValue, muzzleSpeed.unit));
  const applied =
    applyValue !== null &&
    (target === 'ballistic-coefficient' ? ballisticCoefficient === applyValue : muzzleSpeed.value === applyValue);

  const emptyText = t('射距離と落差を 1 行以上入力してください。', 'Enter at least one row of distance and drop.');
  /** Nothing has been measured yet, as against something measured that cannot be worked out. */
  const unsolvable = result === null && solved > 0;
  /** Every value searched fits, so the groups decide nothing (e.g. one group at the zero distance). */
  const undecided = result?.interval?.openLow === true && result.interval.openHigh === true;

  const summary =
    result === null
      ? unsolvable
        ? t(
            'この弾が入力した距離まで届かないか、計算できない値です。射距離・落差とその単位、弾の値を確認してください。',
            'The load does not reach these distances, or the values cannot be calculated. Check the distances, the drops and their units, and the load.',
          )
        : emptyText
      : result.interval === null
        ? t(
            `入力した ${solved} 件の群は、${targetName(target)}だけでは許容 ${offset(result.toleranceMeters)} に収まりません。最も近い ${parameter(result.closestValue)} でも残差は最大 ${offset(result.closestWorstMeters)} です。`,
            `The ${solved} groups cannot all be brought within ${offset(result.toleranceMeters)} by ${targetName(target)} alone. The closest value, ${parameter(result.closestValue)}, still leaves ${offset(result.closestWorstMeters)}.`,
          )
        : undecided
          ? t(
              `この群からは${targetName(target)}は決まりません。探索範囲 ${parameter(result.interval.low)}〜${parameter(result.interval.high)} のどの値でも、全群が許容 ${offset(result.toleranceMeters)} に収まります。`,
              `These groups do not decide ${targetName(target)}: every value in the search range, ${parameter(result.interval.low)} to ${parameter(result.interval.high)}, holds all groups within ${offset(result.toleranceMeters)}.`,
            )
          : t(
              `${targetName(target)}を ${parameter(result.startingValue)} から ${parameter(result.fittedValue)} にすると実測に合います。どの群も許容 ${offset(result.toleranceMeters)} に収まるのは ${parameter(result.interval.low)} から ${parameter(result.interval.high)} までです。`,
              `Changing ${targetName(target)} from ${parameter(result.startingValue)} to ${parameter(result.fittedValue)} matches the shots. Values from ${parameter(result.interval.low)} to ${parameter(result.interval.high)} hold every group within ${offset(result.toleranceMeters)}.`,
            );

  useEffect(() => {
    if (!ready) return;
    // Announce only once typing settles, so a screen reader is not read a new result on every keystroke.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  const speedInvalid = !positive(muzzleSpeed.value);
  const sightHeightInvalid = !Number.isFinite(sightHeight.value) || sightHeight.value < 0;
  const zeroInvalid = !positive(zeroDistance);
  const toleranceInvalid = !positive(tolerance) || toleranceMeters(tolerance, dropUnit) < TRUING_TOLERANCE_FLOOR_METERS;

  /** The load folds to one line, but stays open while it is still the example. */
  const loadIsExample =
    muzzleSpeed.value === initialTruingSettings.muzzleSpeed.value &&
    muzzleSpeed.unit === initialTruingSettings.muzzleSpeed.unit &&
    ballisticCoefficient === initialTruingSettings.ballisticCoefficient &&
    dragModel === initialTruingSettings.dragModel &&
    sightHeight.value === initialTruingSettings.sightHeight.value &&
    sightHeight.unit === initialTruingSettings.sightHeight.unit &&
    zeroDistance === initialTruingSettings.zeroDistance &&
    distanceUnit === initialTruingSettings.distanceUnit;
  const coefficientText = Number.isFinite(ballisticCoefficient)
    ? new Intl.NumberFormat(language, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(
        ballisticCoefficient,
      )
    : '—';
  const loadSummary = [
    `${number(muzzleSpeed.value, 1)} ${speedLabel}`,
    `BC ${coefficientText} ${dragModel.toUpperCase()}`,
    t(
      `スコープ高 ${number(sightHeight.value, 2)} ${sightHeight.unit}`,
      `sight height ${number(sightHeight.value, 2)} ${sightHeight.unit}`,
    ),
    t(`ゼロイン ${number(zeroDistance, 1)} ${distanceUnit}`, `zero ${number(zeroDistance, 1)} ${distanceUnit}`),
  ].join(t('・', ' · '));

  const pressureSourceLabel: Record<PressureSource, string> = {
    station: t('現地の気圧', 'station pressure'),
    'sea-level': t('海面更正気圧', 'sea-level pressure'),
    altitude: t('標準大気', 'standard atmosphere'),
  };
  const atmosphereSummary = [
    `${number(atmosphere.temperature.value, 1)} ${temperatureUnitLabel}`,
    showsPressure
      ? `${number(atmosphere.pressure.value, 2)} ${atmosphere.pressure.unit === 'hpa' ? 'hPa' : 'inHg'}`
      : null,
    showsAltitude
      ? t(
          `標高 ${number(atmosphere.altitude.value, 0)} ${atmosphere.altitude.unit}`,
          `altitude ${number(atmosphere.altitude.value, 0)} ${atmosphere.altitude.unit}`,
        )
      : null,
    pressureSourceLabel[atmosphere.source],
  ]
    .filter(Boolean)
    .join(t('・', ' · '));

  const worstNote = (worst: number) => t(`最大残差 ${offset(worst)}`, `Worst residual ${offset(worst)}`);

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'the-load-as-calculated', label: t('使っている弾', 'The load') },
            { id: 'the-groups-you-measured', label: t('実測した群', 'Measured') },
            { id: 'fitted-value', label: t('合わせ込んだ値', 'Fitted value') },
            { id: 'atmosphere', label: t('大気', 'Atmosphere') },
            { id: 'method', label: t('計算方法', 'Method') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('trajectory-truing').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '弾、実測した群、大気の入力を初期値に戻します。',
                  en: 'Resets the load, the measured groups and the atmosphere.',
                }}
                onReset={() =>
                  useTruingStore.setState({ ...initialTruingSettings, lastValidSettings: initialTruingSettings })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty from the first paint: a status region inserted with its text already set is not announced. */}
      {/* Separate from the result summary: a status region is atomic. */}
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
            <>
              <ConditionSection
                key={ready ? 'saved' : 'initial'}
                id="the-load-as-calculated"
                title={t('計算に使っている弾', 'Load used in the calculation')}
                summary={loadSummary}
                defaultOpen={loadIsExample}
                forceOpen={speedInvalid || coefficientInvalid || sightHeightInvalid || zeroInvalid}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label={t('初速', 'Muzzle velocity')}
                    value={muzzleSpeed.value}
                    onChange={setMuzzleSpeed}
                    units={{
                      value: muzzleSpeed.unit,
                      label: t('初速の単位', 'Velocity unit'),
                      options: [
                        { value: 'mps', label: 'm/s' },
                        { value: 'fps', label: 'fps' },
                      ],
                      onChange: (unit: SpeedUnit) => setSpeedUnit(unit),
                    }}
                    min={0}
                    invalid={speedInvalid}
                    errorText={positiveError}
                  />
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
                    min={BALLISTIC_COEFFICIENT_RANGE.low}
                    max={BALLISTIC_COEFFICIENT_RANGE.high}
                    invalid={coefficientInvalid}
                    errorText={coefficientError}
                    hint={t('メーカーの値と、その G1／G7 の別', 'The maker’s figure, with G1 or G7')}
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
                    hint={t('銃身の中心から照準の中心まで', 'Bore centre to sight centre')}
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
                    invalid={zeroInvalid}
                    errorText={positiveError}
                    hint={t(
                      '群を撃ったときのゼロイン。m と yd を切り替えても数値はそのままです。',
                      'The zero the groups were fired with. Switching between m and yd keeps the numbers as typed.',
                    )}
                  />
                </div>
              </ConditionSection>

              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <div className="space-y-2">
                  <h2 id="the-groups-you-measured" className="text-xl font-medium">
                    {t('実測した群', 'Measured groups')}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      '狙点から群の中心までの落差。狙点より下が正、上が負。',
                      'Drop from the point of aim to the group centre. Below the aim is positive, above is negative.',
                    )}
                  </p>
                </div>
                <SegmentedControl
                  legend={t('落差の単位', 'Drop in')}
                  orientation="inline"
                  value={reading === 'offset' ? dropUnit : reading}
                  onChange={(value) => {
                    if (value === 'cm' || value === 'inch') {
                      setDropUnit(value);
                      setReading('offset');
                    } else setReading(value as DropReading);
                  }}
                  options={[
                    { value: 'cm', label: 'cm' },
                    { value: 'inch', label: 'inch' },
                    { value: 'moa', label: 'MOA' },
                    { value: 'mil', label: 'mil' },
                  ]}
                />
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('距離ごとの実測値', 'Measurements by distance')}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="py-2 text-right font-medium">
                        {t('射距離', 'Distance')} ({distanceUnit})
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        {t('落差', 'Drop')} ({readingLabel})
                      </th>
                      <th scope="col" className="w-12 py-2 text-right font-medium">
                        <span className="sr-only">{t('操作', 'Actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.map((row, index) => (
                      <tr key={row.id} className="border-t border-outline-variant">
                        <td className="py-2 pr-2">
                          <CellField
                            id={rowFieldId(row.id)}
                            label={t(`${index + 1} 行目の射距離`, `Distance on row ${index + 1}`)}
                            value={row.distance}
                            onChange={(distance) => updateMeasurement(row.id, { distance })}
                            invalid={!positive(row.distance)}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <CellField
                            id={`truing-row-${row.id}-drop`}
                            label={t(`${index + 1} 行目の落差`, `Drop on row ${index + 1}`)}
                            value={row.drop}
                            onChange={(drop) => updateMeasurement(row.id, { drop })}
                            invalid={!Number.isFinite(row.drop)}
                          />
                        </td>
                        <td className="py-2 text-right">
                          <button
                            id={rowRemoveId(row.id)}
                            type="button"
                            onClick={() => removeRow(index)}
                            className="inline-flex size-12 items-center justify-center rounded-full hover:bg-surface-container"
                          >
                            <LuTrash2 className="size-5" aria-hidden="true" />
                            <span className="sr-only">{t(`${index + 1} 行目を削除`, `Remove row ${index + 1}`)}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    id={addRowId}
                    type="button"
                    onClick={addRow}
                    disabled={measurements.length >= TRUING_MEASUREMENT_LIMIT}
                    className="inline-flex min-h-12 items-center gap-2 rounded-full border border-outline px-5 text-sm hover:bg-surface-container disabled:opacity-50"
                  >
                    <LuPlus className="size-4" aria-hidden="true" />
                    {t('行を追加', 'Add row')}
                  </button>
                  {measurements.length >= TRUING_MEASUREMENT_LIMIT && (
                    <p className="text-sm text-on-surface-variant">
                      {t(`行は ${TRUING_MEASUREMENT_LIMIT} 件までです。`, `Up to ${TRUING_MEASUREMENT_LIMIT} rows.`)}
                    </p>
                  )}
                </div>
                <div id="which-one-to-move" className="space-y-2">
                  <SegmentedControl
                    legend={t('合わせ込む値', 'Value to fit')}
                    orientation="inline"
                    value={target}
                    onChange={(value) => setTarget(value as TruingTarget)}
                    options={[
                      { value: 'ballistic-coefficient', label: t('弾道係数', 'Ballistic coefficient') },
                      { value: 'muzzle-speed', label: t('初速', 'Muzzle velocity') },
                    ]}
                  />
                  <p className="text-xs text-on-surface-variant">
                    {t(
                      '初速を弾速計で測ったなら弾道係数を、測っていなければ初速を合わせます。もう一方は入力値のままです。',
                      'If you measured the velocity with a chronograph, fit the ballistic coefficient; if not, fit the velocity. The other stays as entered.',
                    )}
                  </p>
                </div>
                <NumberField
                  label={t('測定の精度', 'Measurement precision')}
                  value={tolerance}
                  onChange={setTolerance}
                  units={{
                    value: dropUnit,
                    label: t('長さの単位', 'Length unit'),
                    options: [
                      { value: 'cm', label: 'cm' },
                      { value: 'inch', label: 'inch' },
                    ],
                    onChange: (unit: DropUnit) => setDropUnit(unit),
                  }}
                  min={0}
                  invalid={toleranceInvalid}
                  errorText={
                    positive(tolerance)
                      ? t(
                          `${fromMetersToDropUnit(TRUING_TOLERANCE_FLOOR_METERS, dropUnit).toFixed(dropUnit === 'cm' ? 1 : 2)} ${dropUnit} 以上で入力してください。`,
                          `Enter ${fromMetersToDropUnit(TRUING_TOLERANCE_FLOOR_METERS, dropUnit).toFixed(dropUnit === 'cm' ? 1 : 2)} ${dropUnit} or more.`,
                        )
                      : positiveError
                  }
                  hint={t(
                    '群の中心を測るときの誤差。この幅に収まれば一致とみなします。',
                    'How far off a group centre could be. A fit within this counts as a match.',
                  )}
                />
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="fitted-value" className="text-xl font-medium">
                {t('合わせ込んだ値', 'Fitted value')}
              </h2>
              {result === null ? (
                // Filled-in rows that cannot be solved get the error, not the empty-form prompt.
                <p className={unsolvable ? 'text-sm text-destructive' : 'text-sm text-on-surface-variant'}>{summary}</p>
              ) : (
                <>
                  <ResultPanel>
                    <ResultFigure
                      size="lead"
                      label={
                        target === 'ballistic-coefficient'
                          ? t(
                              `実測に合う弾道係数 (${dragModel.toUpperCase()})`,
                              `Fitted ballistic coefficient (${dragModel.toUpperCase()})`,
                            )
                          : t('実測に合う初速', 'Fitted muzzle velocity')
                      }
                      // Every value fits equally, so no single value is shown.
                      value={undecided ? '—' : parameter(result.fittedValue)}
                      note={
                        result.interval !== null && !undecided
                          ? t(
                              `${parameter(result.interval.low)}${result.interval.openLow ? '（探索範囲の下端）' : ''} 〜 ${parameter(result.interval.high)}${result.interval.openHigh ? '（探索範囲の上端）' : ''} ならどの群も ${offset(result.toleranceMeters)} 以内。最大残差 ${offset(result.fittedWorstMeters)}`,
                              `${parameter(result.interval.low)}${result.interval.openLow ? ' (bottom of the search range)' : ''} to ${parameter(result.interval.high)}${result.interval.openHigh ? ' (top of the search range)' : ''} holds every group within ${offset(result.toleranceMeters)}. Worst residual ${offset(result.fittedWorstMeters)}`,
                            )
                          : worstNote(result.fittedWorstMeters)
                      }
                    />
                    <ResultFigure
                      label={t('入力した値', 'As entered')}
                      value={parameter(result.startingValue)}
                      note={worstNote(result.startingWorstMeters)}
                    />
                  </ResultPanel>
                  {/* The band is in the figure above; these cases need the sentence the status region settles on. */}
                  {(undecided || result.interval === null) && (
                    <p className="text-sm text-on-surface-variant">{summary}</p>
                  )}
                  {result.interval !== null ? (
                    result.fittedWorstMeters > result.toleranceMeters && (
                      // Least squares can trade one group away; the band answers to the worst group.
                      <p className="text-sm text-on-surface-variant">
                        {t(
                          `最小二乗で最も合う ${parameter(result.fittedValue)} では、1 か所が ${offset(result.fittedWorstMeters)} ずれます。どの群も収めるには範囲内の値（例: ${parameter(result.closestValue)}）を使ってください。`,
                          `At the least-squares value ${parameter(result.fittedValue)}, one group is out by ${offset(result.fittedWorstMeters)}. To hold every group, use a value in the band, such as ${parameter(result.closestValue)}.`,
                        )}
                      </p>
                    )
                  ) : (
                    <p className="text-sm text-destructive">
                      {t(
                        `${targetName(target)}だけでは、入力した精度まで合わせられません。${fixedName(target)}、ゼロイン距離、距離の測り方を確認してください。`,
                        `Fitting ${targetName(target)} alone cannot reach the precision entered. Check ${fixedName(target)}, the zero distance or how the distances were measured.`,
                      )}
                    </p>
                  )}
                  {result.atBound !== null && result.interval === null && (
                    <p className="text-sm text-destructive">
                      {target === 'ballistic-coefficient'
                        ? t(
                            `弾道係数を ${BALLISTIC_COEFFICIENT_RANGE.low}〜${BALLISTIC_COEFFICIENT_RANGE.high} の端まで動かしても合わないため、端の値で止めています。`,
                            `The coefficient reached the edge of the ${BALLISTIC_COEFFICIENT_RANGE.low} to ${BALLISTIC_COEFFICIENT_RANGE.high} range without a fit and is held there.`,
                          )
                        : t(
                            `初速を入力値の ±${number(MUZZLE_SPEED_SEARCH_FRACTION * 100, 0)} % まで動かしても合わないため、端の値で止めています。`,
                            `The velocity reached ±${number(MUZZLE_SPEED_SEARCH_FRACTION * 100, 0)} % of the entered value without a fit and is held there.`,
                          )}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => applyValue !== null && applyFitted(result.target, applyValue)}
                    // The dash above says the shots decide nothing; there is no value to hand over.
                    disabled={applied || undecided}
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 text-sm text-on-primary hover:opacity-90 disabled:opacity-50"
                  >
                    {applied ? t('この値を使っています', 'This value is in use') : t('この値を使う', 'Use this value')}
                  </button>
                  <div className="space-y-2">
                    <h3 className="text-base font-medium">{t('距離ごとの残差', 'Residuals by distance')}</h3>
                    <table className="w-full text-sm">
                      <caption className="sr-only">{t('距離ごとの残差', 'Residuals by distance')}</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="py-2 text-left align-bottom font-medium">
                            {t('射距離', 'Distance')}
                          </th>
                          <th scope="col" className="py-2 pl-3 text-right align-bottom font-medium">
                            {t('実測', 'Measured')}
                          </th>
                          <th scope="col" className="py-2 pl-3 text-right align-bottom font-medium">
                            {t('入力値', 'As entered')}
                          </th>
                          <th scope="col" className="py-2 pl-3 text-right align-bottom font-medium">
                            {t('合わせ込み後', 'Fitted')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, index) => (
                          // Keyed by measurement id: two groups at one distance are two rows.
                          <tr
                            key={deferred.measurements[index]?.id ?? index}
                            className="border-t border-outline-variant"
                          >
                            <th scope="row" className="py-2 text-left font-normal whitespace-nowrap tabular-nums">
                              {distance(row.distanceMeters)}
                            </th>
                            <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
                              {offset(row.measuredDropMeters)}
                            </td>
                            <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
                              {signedOffset(row.startingResidualMeters)}
                            </td>
                            <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
                              {signedOffset(row.fittedResidualMeters)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-xs text-on-surface-variant">
                      {t(
                        '残差 = 計算 − 実測。正は計算のほうが落ちすぎ、負は計算のほうが高い。',
                        'Residual = calculated − measured. Positive: the calculation drops too much; negative: it flies too high.',
                      )}
                    </p>
                  </div>
                </>
              )}
            </Card>
          }
          secondary={
            <ConditionSection
              id="atmosphere"
              title={t('撃った日の大気', 'Atmosphere on the day')}
              summary={atmosphereSummary}
              forceOpen={temperatureInvalid || pressureInvalid || altitudeInvalid}
            >
              <SelectField
                label={t('気圧の求め方', 'Pressure from')}
                value={atmosphere.source}
                onChange={(value) => setAtmosphere({ ...atmosphere, source: value as PressureSource })}
                options={[
                  { value: 'station', label: t('現地で測った気圧', 'Measured at the firing point') },
                  {
                    value: 'sea-level',
                    label: t('海面更正気圧（予報値）と標高', 'Sea-level pressure and altitude'),
                  },
                  {
                    value: 'altitude',
                    label: t('標高のみ（標準大気）', 'Altitude only (standard atmosphere)'),
                  },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label={t('気温', 'Temperature')}
                  value={atmosphere.temperature.value}
                  onChange={(value) =>
                    setAtmosphere({ ...atmosphere, temperature: { ...atmosphere.temperature, value } })
                  }
                  units={{
                    value: atmosphere.temperature.unit,
                    label: t('気温の単位', 'Temperature unit'),
                    options: [
                      { value: 'c', label: '°C' },
                      { value: 'f', label: '°F' },
                    ],
                    onChange: (unit: TemperatureUnit) =>
                      setAtmosphere({
                        ...atmosphere,
                        temperature: {
                          value: convertTemperatureValue(
                            atmosphere.temperature.value,
                            atmosphere.temperature.unit,
                            unit,
                          ),
                          unit,
                        },
                      }),
                  }}
                  min={temperatureBounds.min}
                  max={temperatureBounds.max}
                  invalid={temperatureInvalid}
                  errorText={temperatureError}
                />
                {showsPressure && (
                  <NumberField
                    label={t('気圧', 'Pressure')}
                    value={atmosphere.pressure.value}
                    onChange={(value) => setAtmosphere({ ...atmosphere, pressure: { ...atmosphere.pressure, value } })}
                    units={{
                      value: atmosphere.pressure.unit,
                      label: t('気圧の単位', 'Pressure unit'),
                      options: [
                        { value: 'hpa', label: 'hPa' },
                        { value: 'inhg', label: 'inHg' },
                      ],
                      onChange: (unit: PressureUnit) =>
                        setAtmosphere({
                          ...atmosphere,
                          pressure: {
                            value: convertPressureValue(atmosphere.pressure.value, atmosphere.pressure.unit, unit),
                            unit,
                          },
                        }),
                    }}
                    min={0}
                    invalid={pressureInvalid}
                    errorText={positiveError}
                    hint={
                      atmosphere.source === 'station'
                        ? t('海面更正していない現地の気圧', 'Local pressure, not corrected to sea level')
                        : t('予報や空港の海面更正気圧', 'Sea-level pressure from a forecast or airfield')
                    }
                  />
                )}
                {showsAltitude && (
                  <NumberField
                    label={t('標高', 'Altitude')}
                    value={atmosphere.altitude.value}
                    onChange={(value) => setAtmosphere({ ...atmosphere, altitude: { ...atmosphere.altitude, value } })}
                    units={{
                      value: atmosphere.altitude.unit,
                      label: t('標高の単位', 'Altitude unit'),
                      options: [
                        { value: 'm', label: 'm' },
                        { value: 'ft', label: 'ft' },
                      ],
                      onChange: (unit: AltitudeUnit) =>
                        setAtmosphere({
                          ...atmosphere,
                          altitude: {
                            value: convertAltitudeValue(atmosphere.altitude.value, atmosphere.altitude.unit, unit),
                            unit,
                          },
                        }),
                    }}
                    min={altitudeBounds.min}
                    max={altitudeBounds.max}
                    invalid={altitudeInvalid}
                    errorText={altitudeError}
                  />
                )}
              </div>
            </ConditionSection>
          }
          extras={
            <>
              <ConditionSection
                id="method"
                title={t('計算方法と注意', 'Method and cautions')}
                summary={t(
                  '弾そのものの値ではなく、この銃・装弾・その日の条件で実測を再現する値です。測った距離の範囲でだけ確かめられています。',
                  'Not a measurement of the bullet: the value that reproduces these shots with this rifle, load and day, checked only over the distances measured.',
                )}
              >
                {storageAvailable && (
                  <p className="text-sm text-on-surface-variant" role="status">
                    {t('入力はこのブラウザーに保存されます。', 'Settings are saved in this browser.')}
                  </p>
                )}
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      `弾道は「${labsTool('trajectory').title.ja}」と同じ質点モデル（G1・G7 標準抗力表）です。候補ごとに指定のゼロイン距離で照準を合わせ直し、「計算 − 実測」の二乗平均平方根が最小の値を探します。範囲の判定は最大残差で行います。`,
                      `The trajectory uses the same point-mass model as the ${labsTool('trajectory').title.en} (G1 and G7 drag tables). Each candidate is re-zeroed at the zero distance, and the value with the smallest root mean square of calculated minus measured drop is taken. The band is judged on the largest residual.`,
                    )}
                  </li>
                  <li>
                    {t(
                      '弾道係数を合わせると、初速やクロノグラフの誤差もそこに吸収されます。',
                      'When the coefficient is fitted, velocity and chronograph errors are absorbed into it.',
                    )}
                  </li>
                  <li>
                    {t(
                      '近い距離だけで合わせても値は決まりません。範囲の幅を見て、どの桁まで信用できるか判断してください。',
                      'Close-range groups do not decide the value. Check the band’s width before trusting a digit.',
                    )}
                  </li>
                  <li>
                    {t(
                      'ゼロイン距離や射距離のずれは、そのまま合わせ込んだ値に入ります。',
                      'An error in the zero or the distances goes straight into the fitted value.',
                    )}
                  </li>
                  <li>
                    {t(
                      '風は計算に入れていません。強い追い風・向かい風の日の群は、その影響が合わせ込みに入ります。',
                      'Wind is not included. Groups shot in a strong head or tail wind carry that effect into the fit.',
                    )}
                  </li>
                  <li>
                    {t(
                      '測った範囲より遠くで使う場合は、その距離でも実測してください。',
                      'To use it further out, measure further out.',
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
