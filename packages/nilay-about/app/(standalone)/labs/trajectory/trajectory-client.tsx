'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { LuPrinter } from 'react-icons/lu';

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
  StorageUnavailableNotice,
  SectionNav,
  SegmentedControl,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { fromMeters } from '@/lib/sight-adjustment';
import {
  altitudeInRange,
  altitudeRange,
  temperatureInRange,
  temperatureRange,
  JOULES_PER_FOOT_POUND,
  MAX_TABLE_ROWS,
  calculateTrajectory,
  fromMetersPerSecond,
  fromMetersToDropUnit,
  usesAltitude,
  usesPressureReading,
  type AltitudeUnit,
  type DistanceUnit,
  type DragModel,
  type DropUnit,
  type MassUnit,
  type PressureSource,
  type PressureUnit,
  type SightHeightUnit,
  type SpeedUnit,
  type TemperatureUnit,
  type TrajectoryRow,
  type WindPreset,
  type WindSpeedUnit,
} from '@/lib/trajectory';
import {
  TRAJECTORY_CARD_COPIES,
  TRAJECTORY_CARD_EXTRAS,
  TRAJECTORY_CARD_NAME_MAX,
  TRAJECTORY_CARD_SIZES_MM,
  formatMillimetres,
  getTrajectoryCardLayout,
  orderCardExtras,
  type TrajectoryCardContent,
  type TrajectoryCardCopies,
  type TrajectoryCardDrift,
  type TrajectoryCardDrop,
  type TrajectoryCardExtra,
  type TrajectoryCardSize,
} from '@/lib/trajectory-card';
import {
  convertAltitudeValue,
  convertMassValue,
  convertPressureValue,
  convertSightHeightValue,
  convertSpeedValue,
  convertTemperatureValue,
  convertWindSpeedValue,
} from '@/lib/trajectory-units';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialTrajectorySettings, storageKey, useTrajectoryStore } from './_store';
import { TrajectoryCardSheet } from './trajectory-card';
import styles from './trajectory-card-print.module.css';
import { TrajectoryTable } from './trajectory-table';

/** Below this Mach number a bullet that left supersonic is crossing its own shock wave. */
const TRANSONIC_MACH = 1.2;

/** A name for the rifle or the load. It is printed on the card and saved like any other setting. */
function TextField({
  label,
  value,
  onChange,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-on-surface-variant">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TrajectoryClient() {
  const {
    muzzleSpeed,
    mass,
    ballisticCoefficient,
    dragModel,
    sightHeight,
    distanceUnit,
    zeroDistance,
    step,
    maxRange,
    dropUnit,
    vitalRadius,
    wind,
    atmosphere,
    card,
    setMuzzleSpeed,
    setMass,
    setBallisticCoefficient,
    setDragModel,
    setSightHeight,
    setDistanceUnit,
    setZeroDistance,
    setStep,
    setMaxRange,
    setDropUnit,
    setVitalRadius,
    setWind,
    setAtmosphere,
    setCard,
  } = useTrajectoryStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Set by the print button only; the browser's own print command still prints the page.
  const [printingCards, setPrintingCards] = useState(false);
  // How the screen table states drop and drift. A view of the same rows, so it is not saved.
  const [tableAngle, setTableAngle] = useState<TrajectoryCardDrop>('offset');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useTrajectoryStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const input = useMemo(
    () => ({
      muzzleSpeed,
      mass,
      ballisticCoefficient,
      dragModel,
      sightHeight,
      distanceUnit,
      zeroDistance,
      step,
      maxRange,
      dropUnit,
      vitalRadius,
      wind,
      atmosphere,
    }),
    [
      muzzleSpeed,
      mass,
      ballisticCoefficient,
      dragModel,
      sightHeight,
      distanceUnit,
      zeroDistance,
      step,
      maxRange,
      dropUnit,
      vitalRadius,
      wind,
      atmosphere,
    ],
  );
  const computed = useMemo(() => calculateTrajectory(input), [input]);
  // The card is a second run at its own step and range. Drift per unit of wind needs a third,
  // in a one-unit full-value wind from nine o'clock. Memoised: each run solves the zero and the
  // point blank range.
  const computedCard = useMemo(
    () => calculateTrajectory({ ...input, step: card.step, maxRange: card.maxRange }),
    [input, card.step, card.maxRange],
  );
  const computedCardDrift = useMemo(
    () =>
      card.drift === 'per-speed'
        ? calculateTrajectory({
            ...input,
            step: card.step,
            maxRange: card.maxRange,
            wind: { speed: 1, unit: wind.unit, preset: '9', customFromDegrees: 270 },
          })
        : null,
    [input, card.step, card.maxRange, card.drift, wind.unit],
  );

  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const speedInvalid = !positive(muzzleSpeed.value);
  const massInvalid = !positive(mass.value);
  const bcInvalid = !Number.isFinite(ballisticCoefficient) || ballisticCoefficient < 0.01 || ballisticCoefficient > 2;
  const sightHeightInvalid = !Number.isFinite(sightHeight.value) || sightHeight.value < 0;
  const zeroInvalid = !positive(zeroDistance);
  const stepInvalid = !positive(step);
  const maxRangeInvalid = !positive(maxRange);
  const vitalInvalid = !positive(vitalRadius);
  const windSpeedInvalid = !Number.isFinite(wind.speed) || wind.speed < 0;
  const windAngleInvalid =
    wind.preset === 'custom' &&
    (!Number.isFinite(wind.customFromDegrees) || wind.customFromDegrees < 0 || wind.customFromDegrees > 360);
  const temperatureInvalid = !temperatureInRange(atmosphere.temperature.value, atmosphere.temperature.unit);
  // A field the chosen pressure source never reads is not held against the shooter.
  const showsPressure = usesPressureReading(atmosphere.source);
  const showsAltitude = usesAltitude(atmosphere.source);
  const pressureInvalid = showsPressure && !positive(atmosphere.pressure.value);
  const altitudeInvalid = showsAltitude && !altitudeInRange(atmosphere.altitude.value, atmosphere.altitude.unit);

  // Marked fields are not calculated from, so no figure contradicts an error message.
  const inputInvalid =
    speedInvalid ||
    massInvalid ||
    bcInvalid ||
    sightHeightInvalid ||
    zeroInvalid ||
    stepInvalid ||
    maxRangeInvalid ||
    vitalInvalid ||
    windSpeedInvalid ||
    windAngleInvalid ||
    temperatureInvalid ||
    pressureInvalid ||
    altitudeInvalid;
  const result = inputInvalid ? null : computed;
  const cardResult = inputInvalid ? null : computedCard;
  const cardDriftResult = inputInvalid ? null : computedCardDrift;
  // Every field reads as valid and there is still no trajectory: the zero cannot be reached.
  const zeroUnreachable = !inputInvalid && computed === null;

  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');
  const bcError = t('0.01 から 2 の範囲で入力してください。', 'Enter a coefficient between 0.01 and 2.');
  const angleError = t('0 から 360 の範囲で入力してください。', 'Enter an angle between 0 and 360.');
  const temperatureBounds = temperatureRange(atmosphere.temperature.unit);
  const altitudeBounds = altitudeRange(atmosphere.altitude.unit);
  const temperatureUnitLabel = atmosphere.temperature.unit === 'c' ? '°C' : '°F';
  const altitudeUnitLabel = atmosphere.altitude.unit === 'm' ? 'm' : 'ft';
  const temperatureError = t(
    `${temperatureBounds.min} から ${temperatureBounds.max} ${temperatureUnitLabel} の範囲で入力してください。`,
    `Enter a temperature between ${temperatureBounds.min} and ${temperatureBounds.max} ${temperatureUnitLabel}.`,
  );
  const altitudeError = t(
    `${altitudeBounds.min} から ${altitudeBounds.max} ${altitudeUnitLabel} の範囲で入力してください。`,
    `Enter an altitude between ${altitudeBounds.min} and ${altitudeBounds.max} ${altitudeUnitLabel}.`,
  );

  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const inDistanceUnit = (meters: number, digits = 0) =>
    `${number(fromMeters(meters, distanceUnit), digits)} ${distanceUnit}`;
  const inDropUnit = (meters: number, digits = 1) =>
    `${number(fromMetersToDropUnit(meters, dropUnit), digits)} ${dropUnit}`;

  const muzzleMach = result ? result.muzzleSpeedMs / result.conditions.speedOfSoundMs : 0;
  // Only a load that left the muzzle supersonic is marked as transonic.
  const transonicBelowMach = muzzleMach > TRANSONIC_MACH ? TRANSONIC_MACH : null;
  const hasTransonicRow =
    result !== null && transonicBelowMach !== null && result.rows.some((row) => row.mach < TRANSONIC_MACH);
  const lastRow = result?.rows[result.rows.length - 1] ?? null;
  // Shown only when the wind shortens the point blank range by more than half a metre.
  const windLimited =
    result?.pointBlank?.windLimitedRangeMeters != null &&
    result.pointBlank.windLimitedRangeMeters < result.pointBlank.rangeMeters - 0.5
      ? result.pointBlank.windLimitedRangeMeters
      : null;

  const emptyMessage = zeroUnreachable
    ? t(
        `この弾は ${number(zeroDistance, 1)} ${distanceUnit} まで届かないか、その距離でゼロインできません。ゼロイン距離を短くするか、初速と弾道係数を確認してください。`,
        `The load does not reach ${number(zeroDistance, 1)} ${distanceUnit}, or cannot be zeroed there. Shorten the zero distance or check the muzzle velocity and ballistic coefficient.`,
      )
    : t('エラーのある欄を直してください。', 'Correct the fields with errors.');
  const pointBlankText = result?.pointBlank ? inDistanceUnit(result.pointBlank.rangeMeters, 1) : '—';
  const summary =
    result && lastRow
      ? t(
          `${inDistanceUnit(result.zeroDistanceMeters)} ゼロインで、${inDistanceUnit(lastRow.distanceMeters)} の落差は ${inDropUnit(lastRow.dropMeters)}。無風での最大直接照準距離は ${pointBlankText} です。`,
          `Zeroed at ${inDistanceUnit(result.zeroDistanceMeters)}, drop at ${inDistanceUnit(lastRow.distanceMeters)} is ${inDropUnit(lastRow.dropMeters)}. Maximum point blank range in still air: ${pointBlankText}.`,
        )
      : emptyMessage;

  useEffect(() => {
    if (!ready) return;
    // Announce only once typing settles, so a screen reader is not read a new table on every keystroke.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  const cardExtras = orderCardExtras(card.extras);
  const cardStepInvalid = !positive(card.step);
  const cardRangeInvalid = !positive(card.maxRange);
  const cardOffsetLabel = card.drop === 'offset' ? dropUnit : card.drop === 'moa' ? 'MOA' : 'mil';
  const windUnitLabel = wind.unit === 'mps' ? 'm/s' : 'mph';
  const speedUnitLabel = muzzleSpeed.unit === 'mps' ? 'm/s' : 'fps';

  // Drop and drift share one reading. Angles keep one more decimal than lengths: a tenth of a mil
  // is a click on most turrets.
  const offsetCell = (offsetMeters: number, moa: number, mil: number) =>
    card.drop === 'offset'
      ? number(fromMetersToDropUnit(offsetMeters, dropUnit), 1)
      : card.drop === 'moa'
        ? number(moa, 1)
        : number(mil, 2);
  const extraCell = (row: TrajectoryRow, extra: TrajectoryCardExtra) =>
    extra === 'time'
      ? number(row.timeSeconds, 2)
      : extra === 'speed'
        ? number(fromMetersPerSecond(row.speedMs, muzzleSpeed.unit), 0)
        : number(row.energyJoules, 0);
  const extraHeader = (extra: TrajectoryCardExtra) =>
    extra === 'time'
      ? `${t('時間', 'Time')} s`
      : extra === 'speed'
        ? `${t('速度', 'Vel')} ${speedUnitLabel}`
        : `${t('エネルギー', 'Energy')} J`;

  const cardHeaders = [
    `${t('距離', 'Range')} ${distanceUnit}`,
    `${t('落差', 'Drop')} ${cardOffsetLabel}`,
    ...(card.drift === 'none'
      ? []
      : [
          card.drift === 'wind'
            ? `${t('風偏', 'Drift')} ${cardOffsetLabel}`
            : `${t('風偏', 'Drift')} ${cardOffsetLabel}/${windUnitLabel}`,
        ]),
    ...cardExtras.map(extraHeader),
  ];
  const cardRows = (cardResult?.rows ?? []).map((row, index) => {
    // Both runs sample the same distances, so the crosswind row at this index is this distance.
    const driftRow = card.drift === 'per-speed' ? cardDriftResult?.rows[index] : row;
    return [
      number(fromMeters(row.distanceMeters, distanceUnit), 0),
      offsetCell(row.dropMeters, row.dropMoa, row.dropMil),
      ...(card.drift === 'none'
        ? []
        : [driftRow ? offsetCell(driftRow.driftMeters, driftRow.driftMoa, driftRow.driftMil) : '—']),
      ...cardExtras.map((extra) => extraCell(row, extra)),
    ];
  });

  // Short forms of the wind direction, for a line that has a card's width rather than a form's.
  const windClockLabel: Record<WindPreset, string> = {
    '12': t('12 時', '12 o’clock'),
    '1:30': t('1 時半', '1:30'),
    '3': t('3 時', '3 o’clock'),
    '4:30': t('4 時半', '4:30'),
    '6': t('6 時', '6 o’clock'),
    '7:30': t('7 時半', '7:30'),
    '9': t('9 時', '9 o’clock'),
    '10:30': t('10 時半', '10:30'),
    custom: `${number(wind.customFromDegrees, 0)}°`,
  };
  const cardTitle = [card.gun.trim(), card.load.trim()].filter(Boolean).join(' / ');
  /** Always printed, so a card cannot be mistaken for another load, zero or day. */
  const cardConditions = cardResult
    ? [
        t(
          `初速 ${number(muzzleSpeed.value, 1)} ${speedUnitLabel}・弾頭 ${number(mass.value, 2)} ${mass.unit === 'g' ? 'g' : 'grain'}・BC ${number(ballisticCoefficient, 3)} ${dragModel.toUpperCase()}・ゼロイン ${inDistanceUnit(cardResult.zeroDistanceMeters)}・スコープ高 ${number(sightHeight.value, 1)} ${sightHeight.unit}`,
          `${number(muzzleSpeed.value, 1)} ${speedUnitLabel}・${number(mass.value, 2)} ${mass.unit === 'g' ? 'g' : 'grain'}・BC ${number(ballisticCoefficient, 3)} ${dragModel.toUpperCase()}・zero ${inDistanceUnit(cardResult.zeroDistanceMeters)}・sight ${number(sightHeight.value, 1)} ${sightHeight.unit}`,
        ),
        card.drift === 'per-speed'
          ? t(
              `${number(atmosphere.temperature.value, 0)} ${atmosphere.temperature.unit === 'c' ? '°C' : '°F'}・${number(cardResult.conditions.pressurePa / 100, 0)} hPa・風偏は真横（9 時）の風 1 ${windUnitLabel} あたり`,
              `${number(atmosphere.temperature.value, 0)} ${atmosphere.temperature.unit === 'c' ? '°C' : '°F'}・${number(cardResult.conditions.pressurePa / 100, 0)} hPa・drift per 1 ${windUnitLabel} full value wind (9 o’clock)`,
            )
          : t(
              `${number(atmosphere.temperature.value, 0)} ${atmosphere.temperature.unit === 'c' ? '°C' : '°F'}・${number(cardResult.conditions.pressurePa / 100, 0)} hPa・風 ${number(wind.speed, 1)} ${windUnitLabel} ${windClockLabel[wind.preset]}`,
              `${number(atmosphere.temperature.value, 0)} ${atmosphere.temperature.unit === 'c' ? '°C' : '°F'}・${number(cardResult.conditions.pressurePa / 100, 0)} hPa・wind ${number(wind.speed, 1)} ${windUnitLabel} ${windClockLabel[wind.preset]}`,
            ),
      ]
    : [];
  const cardContent: TrajectoryCardContent = {
    title: cardTitle,
    conditions: cardConditions,
    headers: cardHeaders,
    rows: cardRows,
  };
  const cardLayout = getTrajectoryCardLayout({ content: cardContent, size: card.size, copies: card.copies });
  const screenOnly = printingCards ? 'print:hidden' : undefined;
  // Only the card's own limits; no trajectory at all is reported once, in the results.
  const cardOverflowMessage =
    cardResult === null
      ? null
      : cardLayout.overflow === 'empty'
        ? t(
            '刻みが最大距離より大きく、カードに載せる行がありません。',
            'The step is larger than the furthest distance, so the card has no rows.',
          )
        : cardLayout.overflow === 'copies'
          ? t(
              `この大きさのカードは、A4 1 枚に ${cardLayout.capacity} 枚までです。枚数を減らすか、小さいカードを選んでください。`,
              `At this size an A4 sheet holds ${cardLayout.capacity} cards. Choose fewer copies or a smaller card.`,
            )
          : cardLayout.overflow === 'width'
            ? t(
                '列が多すぎて、この幅のカードには収まりません。列を減らすか、大きいカードを選んでください。',
                'Too many columns for this card. Remove a column or choose a larger card.',
              )
            : cardLayout.overflow === 'height'
              ? t(
                  `この大きさのカードは ${cardLayout.maxRows} 行までです。刻みを大きくするか、最大距離を短くするか、大きいカードを選んでください。`,
                  `This card fits ${cardLayout.maxRows} rows. Use a larger step, a shorter furthest distance or a larger card.`,
                )
              : null;

  const cardSizeText = `${formatMillimetres(cardLayout.card.widthMm)} × ${formatMillimetres(cardLayout.card.heightMm)} mm`;
  const cardPrintNote = t(
    '50 mm の基準線／実際のサイズ（100%）で印刷',
    '50 mm reference line / print at actual size (100%)',
  );

  const printCard = () => {
    if (cardResult === null) {
      // The field that stops the card, wherever it is on the page: the zero when every field reads
      // as valid and the zero is what cannot be reached, and otherwise the card's own step.
      const invalidField = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      const blocking =
        invalidField ?? document.getElementById(zeroUnreachable ? 'trajectory-zero-distance' : 'trajectory-card-step');
      blocking?.focus();
      return;
    }
    if (!cardLayout.fits) {
      document.getElementById('trajectory-card-size')?.focus();
      return;
    }
    setPrintingCards(true);
  };

  useEffect(() => {
    if (!printingCards) return;
    // Prints after the render that puts the sheet on the page.
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setPrintingCards(false);
    };
    // print() returning or afterprint, whichever comes first, puts the page back. React commits
    // the removal after this task, so the sheet stays while the dialog reads it.
    window.addEventListener('afterprint', finish);
    window.print();
    finish();
    return () => window.removeEventListener('afterprint', finish);
  }, [printingCards]);

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
    `${pressureSourceLabel[atmosphere.source]}`,
  ]
    .filter(Boolean)
    .join(t('・', ' · '));

  const figure = (label: string, value: string, note?: string) => (
    <div>
      <dt className="text-sm text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 text-lg font-medium tabular-nums">{value}</dd>
      {note && <dd className="mt-1 text-sm text-on-surface-variant tabular-nums">{note}</dd>}
    </div>
  );

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'load-and-rifle', label: t('弾と銃', 'Load and rifle') },
            { id: 'zero-and-wind', label: t('ゼロインと風', 'Zero and wind') },
            { id: 'summary', label: t('弾道', 'Trajectory') },
            { id: 'atmosphere', label: t('大気', 'Atmosphere') },
            { id: 'table-range', label: t('表の距離', 'Table range') },
            { id: 'ballistics-card', label: t('弾道カード', 'Card') },
            { id: 'notes', label: t('計算方法', 'Method') },
          ]}
        />
      }
      header={
        <AppHeader
          className={screenOnly}
          title={labsTool('trajectory').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: 'すべての入力を初期値に戻します。銃と装弾の名前も消えます。',
                  en: 'Resets every setting, including the rifle and load names.',
                }}
                onReset={() =>
                  useTrajectoryStore.setState({
                    ...initialTrajectorySettings,
                    lastValidSettings: initialTrajectorySettings,
                  })
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
      <div lang={language} className={cn('space-y-6', screenOnly)} inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('計算結果', 'Results')}
          primary={
            <>
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="load-and-rifle" className="text-xl font-medium">
                  {t('弾と銃', 'Load and rifle')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label={t('初速', 'Muzzle velocity')}
                    value={muzzleSpeed.value}
                    onChange={(value) => setMuzzleSpeed({ ...muzzleSpeed, value })}
                    units={{
                      value: muzzleSpeed.unit,
                      label: t('初速の単位', 'Velocity unit'),
                      options: [
                        { value: 'mps', label: 'm/s' },
                        { value: 'fps', label: 'fps' },
                      ],
                      onChange: (unit: SpeedUnit) =>
                        setMuzzleSpeed({
                          value: convertSpeedValue(muzzleSpeed.value, muzzleSpeed.unit, unit),
                          unit,
                        }),
                    }}
                    min={0}
                    invalid={speedInvalid}
                    errorText={positiveError}
                    hint={t('できれば実測値', 'Measured, if you can')}
                  />
                  <NumberField
                    label={t('弾頭重量', 'Bullet weight')}
                    value={mass.value}
                    onChange={(value) => setMass({ ...mass, value })}
                    units={{
                      value: mass.unit,
                      label: t('重量の単位', 'Weight unit'),
                      options: [
                        { value: 'g', label: 'g' },
                        { value: 'grain', label: 'grain' },
                      ],
                      onChange: (unit: MassUnit) =>
                        setMass({ value: convertMassValue(mass.value, mass.unit, unit), unit }),
                    }}
                    min={0}
                    invalid={massInvalid}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('弾道係数 BC', 'Ballistic coefficient')}
                    value={ballisticCoefficient}
                    onChange={setBallisticCoefficient}
                    units={{
                      value: dragModel,
                      label: t('抗力モデル', 'Drag function'),
                      options: [
                        { value: 'g1', label: 'G1' },
                        { value: 'g7', label: 'G7' },
                      ],
                      onChange: (model: DragModel) => setDragModel(model),
                    }}
                    min={0.01}
                    max={2}
                    invalid={bcInvalid}
                    errorText={bcError}
                    hint={t(
                      'メーカーの値と G1／G7 の別を合わせます。両方あればボートテール弾は G7。',
                      'Match the maker’s figure to G1 or G7. If both are given, use G7 for boat tails.',
                    )}
                  />
                  <NumberField
                    label={t('スコープ高', 'Sight height')}
                    value={sightHeight.value}
                    onChange={(value) => setSightHeight({ ...sightHeight, value })}
                    units={{
                      value: sightHeight.unit,
                      label: t('スコープ高の単位', 'Sight height unit'),
                      options: [
                        { value: 'mm', label: 'mm' },
                        { value: 'inch', label: 'inch' },
                      ],
                      onChange: (unit: SightHeightUnit) =>
                        setSightHeight({
                          value: convertSightHeightValue(sightHeight.value, sightHeight.unit, unit),
                          unit,
                        }),
                    }}
                    min={0}
                    invalid={sightHeightInvalid}
                    errorText={nonNegativeError}
                    hint={t('照準線と銃身軸の間隔', 'Line of sight to bore axis')}
                  />
                </div>
              </Card>

              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="zero-and-wind" className="text-xl font-medium">
                  {t('ゼロインと風', 'Zero and wind')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    fieldId="trajectory-zero-distance"
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
                      'm と yd を切り替えても数値はそのままです。',
                      'Switching between m and yd keeps the numbers as typed.',
                    )}
                  />
                  <NumberField
                    label={t('風速', 'Wind speed')}
                    value={wind.speed}
                    onChange={(speed) => setWind({ ...wind, speed })}
                    units={{
                      value: wind.unit,
                      label: t('風速の単位', 'Wind speed unit'),
                      options: [
                        { value: 'mps', label: 'm/s' },
                        { value: 'mph', label: 'mph' },
                      ],
                      onChange: (unit: WindSpeedUnit) =>
                        setWind({ ...wind, speed: convertWindSpeedValue(wind.speed, wind.unit, unit), unit }),
                    }}
                    min={0}
                    invalid={windSpeedInvalid}
                    errorText={nonNegativeError}
                  />
                  <SelectField
                    label={t('風向', 'Wind direction')}
                    value={wind.preset}
                    onChange={(value) => setWind({ ...wind, preset: value as WindPreset })}
                    options={[
                      { value: '12', label: t('12 時（向かい風）', '12 o’clock (head wind)') },
                      { value: '1:30', label: t('1 時半（右前）', '1:30 (front right)') },
                      { value: '3', label: t('3 時（右真横）', '3 o’clock (full value, right)') },
                      { value: '4:30', label: t('4 時半（右後ろ）', '4:30 (rear right)') },
                      { value: '6', label: t('6 時（追い風）', '6 o’clock (tail wind)') },
                      { value: '7:30', label: t('7 時半（左後ろ）', '7:30 (rear left)') },
                      { value: '9', label: t('9 時（左真横）', '9 o’clock (full value, left)') },
                      { value: '10:30', label: t('10 時半（左前）', '10:30 (front left)') },
                      { value: 'custom', label: t('カスタム（角度）', 'Custom (angle)') },
                    ]}
                    hint={t(
                      '風が吹いてくる方向。射手から見た時計の文字盤で。',
                      'Where the wind comes from, on the shooter’s clock.',
                    )}
                  />
                  {wind.preset === 'custom' && (
                    <NumberField
                      label={t('風向の角度', 'Wind angle')}
                      unit={t('度', 'degrees')}
                      value={wind.customFromDegrees}
                      onChange={(customFromDegrees) => setWind({ ...wind, customFromDegrees })}
                      min={0}
                      max={360}
                      invalid={windAngleInvalid}
                      errorText={angleError}
                      hint={t('12 時を 0 度として時計回り', 'Clockwise from 12 o’clock')}
                    />
                  )}
                </div>
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="summary" className="text-xl font-medium">
                {t('弾道', 'Trajectory')}
              </h2>
              {result ? (
                <>
                  <ResultPanel>
                    <ResultFigure
                      size="lead"
                      label={t('最大直接照準距離（無風）', 'Point blank range, still air')}
                      value={pointBlankText}
                      note={
                        result.pointBlank
                          ? t(
                              `${inDistanceUnit(result.pointBlank.zeroMeters, 1)} でゼロインすると、銃口からここまで半径 ${number(vitalRadius, 2)} ${dropUnit} の円に狙点のまま当たります。`,
                              `Zero at ${inDistanceUnit(result.pointBlank.zeroMeters, 1)} and hold dead on from the muzzle to here, within a ${number(vitalRadius, 2)} ${dropUnit} radius.`,
                            )
                          : result.pointBlankUnavailable === 'sight-above-radius'
                            ? t(
                                `スコープ高 ${number(sightHeight.value, 2)} ${sightHeight.unit} が許容半径 ${number(vitalRadius, 2)} ${dropUnit} より大きいため、最大直接照準距離はありません。`,
                                `No point blank range: the ${number(sightHeight.value, 2)} ${sightHeight.unit} sight height is more than the ${number(vitalRadius, 2)} ${dropUnit} radius.`,
                              )
                            : undefined
                      }
                    />
                    {windLimited !== null && (
                      <p className="text-sm text-on-surface-variant">
                        {t(
                          `入力した風では、${inDistanceUnit(windLimited, 1)} で的の円から外れます（落差と風偏の合計）。`,
                          `In the entered wind, the bullet leaves the circle at ${inDistanceUnit(windLimited, 1)} (drop and drift combined).`,
                        )}
                      </p>
                    )}
                    <dl className="grid grid-cols-2 gap-4 border-t border-outline-variant pt-4 sm:grid-cols-3">
                      {figure(
                        t('照準線との交点', 'Line of sight crossings'),
                        `${result.nearZeroMeters != null ? inDistanceUnit(result.nearZeroMeters, 1) : '—'} / ${result.farZeroMeters != null ? inDistanceUnit(result.farZeroMeters, 1) : '—'}`,
                        result.zeroSide === 'rising'
                          ? t(
                              `近 / 遠。${inDistanceUnit(result.zeroDistanceMeters)} は近い方。`,
                              `Near / far. ${inDistanceUnit(result.zeroDistanceMeters)} is the near one.`,
                            )
                          : t(
                              `近 / 遠。${inDistanceUnit(result.zeroDistanceMeters)} は遠い方。`,
                              `Near / far. ${inDistanceUnit(result.zeroDistanceMeters)} is the far one.`,
                            ),
                      )}
                      {figure(
                        t('最大弾道高', 'Highest point'),
                        inDropUnit(result.apex.heightMeters),
                        t(
                          `${inDistanceUnit(result.apex.distanceMeters, 1)} 付近`,
                          `At about ${inDistanceUnit(result.apex.distanceMeters, 1)}`,
                        ),
                      )}
                      {figure(
                        t('銃口エネルギー', 'Muzzle energy'),
                        `${number(result.muzzleEnergyJoules, 0)} J`,
                        `${number(result.muzzleEnergyJoules / JOULES_PER_FOOT_POUND, 0)} ft-lb`,
                      )}
                    </dl>
                  </ResultPanel>
                  <div className="space-y-3">
                    <h3 id="trajectory-by-distance" className="text-base font-medium">
                      {t('距離ごとの落差と風偏', 'Drop and drift by distance')}
                    </h3>
                    <SegmentedControl
                      legend={t('落差と風偏の単位', 'Drop and drift in')}
                      orientation="inline"
                      value={tableAngle}
                      onChange={(value) => setTableAngle(value as TrajectoryCardDrop)}
                      options={[
                        { value: 'offset', label: dropUnit },
                        { value: 'moa', label: 'MOA' },
                        { value: 'mil', label: 'mil' },
                      ]}
                    />
                    {result.rows.length > 0 ? (
                      <TrajectoryTable
                        rows={result.rows}
                        language={language}
                        distanceUnit={distanceUnit}
                        dropUnit={dropUnit}
                        angle={tableAngle}
                        speedUnit={muzzleSpeed.unit}
                        transonicBelowMach={transonicBelowMach}
                        format={number}
                        t={t}
                      />
                    ) : (
                      <p className="text-sm text-destructive">
                        {t(
                          '表に出せる行がありません。距離の刻みが最大距離より大きくないか確認してください。',
                          'No rows to show. Check that the step is not larger than the furthest distance.',
                        )}
                      </p>
                    )}
                    <p className="text-xs text-on-surface-variant">
                      {t(
                        '落差は照準線より下が正（その分だけ上へ修正）、風偏は右が正。',
                        'Drop is positive below the line of sight (correct up by that much). Drift is positive to the right.',
                      )}
                    </p>
                    {result.truncated && (
                      <p className="text-sm text-on-surface-variant">
                        {t(
                          `表は ${MAX_TABLE_ROWS} 行までです。刻みを大きくすると最大距離まで出せます。`,
                          `The table stops at ${MAX_TABLE_ROWS} rows. Use a larger step to reach the furthest distance.`,
                        )}
                      </p>
                    )}
                    {hasTransonicRow && (
                      <p className="text-sm text-on-surface-variant">
                        {t(
                          '* マッハ 1.2 未満。ここから先は計算と実際の差が大きくなります。',
                          '* Below Mach 1.2. From here on, real bullets depart most from the calculation.',
                        )}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-destructive">{emptyMessage}</p>
              )}
            </Card>
          }
          secondary={
            <>
              <ConditionSection
                id="atmosphere"
                title={t('大気', 'Atmosphere')}
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
                      onChange={(value) =>
                        setAtmosphere({ ...atmosphere, pressure: { ...atmosphere.pressure, value } })
                      }
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
                      onChange={(value) =>
                        setAtmosphere({ ...atmosphere, altitude: { ...atmosphere.altitude, value } })
                      }
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
                <dl className="grid gap-4 rounded-sm bg-surface-container p-4 sm:grid-cols-2">
                  {figure(
                    t('空気密度', 'Air density'),
                    result ? `${number(result.conditions.densityKgPerM3, 3)} kg/m³` : '—',
                    result
                      ? t(
                          `標準大気の ${number(result.conditions.densityRatio * 100, 1)} %`,
                          `${number(result.conditions.densityRatio * 100, 1)} % of standard`,
                        )
                      : undefined,
                  )}
                  {figure(
                    t('音速', 'Speed of sound'),
                    result ? `${number(result.conditions.speedOfSoundMs, 1)} m/s` : '—',
                    result
                      ? t(`銃口でマッハ ${number(muzzleMach, 2)}`, `Mach ${number(muzzleMach, 2)} at the muzzle`)
                      : undefined,
                  )}
                </dl>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '予報や空港の気圧は海面更正値です。現地の気圧として入れず、「海面更正気圧と標高」を選んでください。標高のみは海面気圧を 1013.25 hPa とし、その日の高気圧・低気圧は反映されません。',
                    'Forecast and airfield pressures are corrected to sea level: choose “Sea-level pressure and altitude” for them, not the measured option. Altitude only assumes 1013.25 hPa at sea level and ignores the day’s weather.',
                  )}
                </p>
              </ConditionSection>

              <ConditionSection
                id="table-range"
                title={t('表の距離と的の半径', 'Table range and target radius')}
                summary={t(
                  `${number(step)} ${distanceUnit} 刻みで ${number(maxRange)} ${distanceUnit} まで・許容半径 ${number(vitalRadius, 2)} ${dropUnit}`,
                  `Every ${number(step)} ${distanceUnit} to ${number(maxRange)} ${distanceUnit}, target radius ${number(vitalRadius, 2)} ${dropUnit}`,
                )}
                forceOpen={stepInvalid || maxRangeInvalid || vitalInvalid}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label={t('距離の刻み', 'Distance step')}
                    unit={distanceUnit}
                    value={step}
                    onChange={setStep}
                    min={0}
                    invalid={stepInvalid}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('最大距離', 'Furthest distance')}
                    unit={distanceUnit}
                    value={maxRange}
                    onChange={setMaxRange}
                    min={0}
                    invalid={maxRangeInvalid}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('許容半径', 'Target radius')}
                    value={vitalRadius}
                    onChange={setVitalRadius}
                    units={{
                      value: dropUnit,
                      label: t('落差・風偏の長さの単位', 'Drop and drift length unit'),
                      options: [
                        { value: 'cm', label: 'cm' },
                        { value: 'inch', label: 'inch' },
                      ],
                      onChange: (unit: DropUnit) => setDropUnit(unit),
                    }}
                    min={0}
                    invalid={vitalInvalid}
                    errorText={positiveError}
                    hint={t(
                      '最大直接照準距離に使う急所の半径。単位は表の落差・風偏にも使います。',
                      'Vital zone radius for the point blank range. The unit also sets drop and drift in the table.',
                    )}
                  />
                </div>
              </ConditionSection>
            </>
          }
          extras={
            <>
              <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6 lg:col-span-2">
                <h2 id="ballistics-card" className="text-xl font-medium">
                  {t('弾道カードの印刷', 'Print a ballistics card')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label={t('銃の名前（任意）', 'Rifle (optional)')}
                    value={card.gun}
                    onChange={(gun) => setCard({ gun })}
                    maxLength={TRAJECTORY_CARD_NAME_MAX}
                  />
                  <TextField
                    label={t('装弾の名前（任意）', 'Load (optional)')}
                    value={card.load}
                    onChange={(load) => setCard({ load })}
                    maxLength={TRAJECTORY_CARD_NAME_MAX}
                  />
                  <SelectField
                    fieldId="trajectory-card-size"
                    label={t('カードの大きさ', 'Card size')}
                    value={card.size}
                    onChange={(value) => setCard({ size: value as TrajectoryCardSize })}
                    options={[
                      {
                        value: 'stock',
                        label: t(
                          `銃床に貼る帯 (${TRAJECTORY_CARD_SIZES_MM.stock.widthMm} × ${TRAJECTORY_CARD_SIZES_MM.stock.heightMm} mm)`,
                          `Stock strip (${TRAJECTORY_CARD_SIZES_MM.stock.widthMm} × ${TRAJECTORY_CARD_SIZES_MM.stock.heightMm} mm)`,
                        ),
                      },
                      {
                        value: 'business',
                        label: t(
                          `名刺 (${TRAJECTORY_CARD_SIZES_MM.business.widthMm} × ${TRAJECTORY_CARD_SIZES_MM.business.heightMm} mm)`,
                          `Business card (${TRAJECTORY_CARD_SIZES_MM.business.widthMm} × ${TRAJECTORY_CARD_SIZES_MM.business.heightMm} mm)`,
                        ),
                      },
                      {
                        value: 'a7',
                        label: t(
                          `A7 (${TRAJECTORY_CARD_SIZES_MM.a7.widthMm} × ${TRAJECTORY_CARD_SIZES_MM.a7.heightMm} mm)`,
                          `A7 (${TRAJECTORY_CARD_SIZES_MM.a7.widthMm} × ${TRAJECTORY_CARD_SIZES_MM.a7.heightMm} mm)`,
                        ),
                      },
                    ]}
                  />
                  <SelectField
                    label={t('A4 1 枚に並べる数', 'Cards per A4 sheet')}
                    value={String(card.copies)}
                    onChange={(value) => setCard({ copies: Number(value) as TrajectoryCardCopies })}
                    options={TRAJECTORY_CARD_COPIES.map((count) => ({ value: String(count), label: String(count) }))}
                  />
                  <NumberField
                    fieldId="trajectory-card-step"
                    label={t('カードの距離の刻み', 'Card step')}
                    unit={distanceUnit}
                    value={card.step}
                    onChange={(value) => setCard({ step: value })}
                    min={0}
                    invalid={cardStepInvalid}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('カードの最大距離', 'Card furthest distance')}
                    unit={distanceUnit}
                    value={card.maxRange}
                    onChange={(value) => setCard({ maxRange: value })}
                    min={0}
                    invalid={cardRangeInvalid}
                    errorText={positiveError}
                  />
                  <SelectField
                    label={t('カードの落差と風偏の単位', 'Card drop and drift in')}
                    value={card.drop}
                    onChange={(value) => setCard({ drop: value as TrajectoryCardDrop })}
                    options={[
                      {
                        value: 'offset',
                        label: t(`的の上の長さ（${dropUnit}）`, `Length on target (${dropUnit})`),
                      },
                      { value: 'moa', label: 'MOA' },
                      { value: 'mil', label: 'mil' },
                    ]}
                    hint={t(
                      'スコープの調整単位に合わせると、そのまま回せます。',
                      'Match your scope’s turrets to dial the figure as printed.',
                    )}
                  />
                  <SelectField
                    label={t('風偏の列', 'Drift column')}
                    value={card.drift}
                    onChange={(value) => setCard({ drift: value as TrajectoryCardDrift })}
                    options={[
                      {
                        value: 'wind',
                        label: t(
                          `入力した風 (${number(wind.speed, 1)} ${windUnitLabel} ${windClockLabel[wind.preset]})`,
                          `Entered wind (${number(wind.speed, 1)} ${windUnitLabel} ${windClockLabel[wind.preset]})`,
                        ),
                      },
                      {
                        value: 'per-speed',
                        label: t(`真横の風 1 ${windUnitLabel} あたり`, `Per 1 ${windUnitLabel} full-value wind`),
                      },
                      { value: 'none', label: t('印字しない', 'None') },
                    ]}
                    hint={t(
                      '「1 あたり」は、読んだ風速を掛けて使います。',
                      'Multiply per-unit drift by the wind speed you read.',
                    )}
                  />
                </div>
                <fieldset className="min-w-0">
                  <legend className="text-sm font-medium">{t('追加する列', 'Extra columns')}</legend>
                  <div className="flex flex-wrap gap-x-8">
                    {TRAJECTORY_CARD_EXTRAS.map((extra) => (
                      <label key={extra} className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={card.extras.includes(extra)}
                          onChange={(event) =>
                            setCard({
                              extras: event.target.checked
                                ? orderCardExtras([...card.extras, extra])
                                : card.extras.filter((chosen) => chosen !== extra),
                            })
                          }
                        />
                        {extra === 'time'
                          ? t('飛行時間', 'Time of flight')
                          : extra === 'speed'
                            ? t('残存速度', 'Remaining velocity')
                            : t('残存エネルギー', 'Remaining energy')}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {cardResult === null ? (
                  <p className="text-sm text-destructive">
                    {result === null
                      ? emptyMessage
                      : t(
                          'カードの距離の刻みと最大距離を入力してください。',
                          'Enter the card’s step and furthest distance.',
                        )}
                  </p>
                ) : (
                  cardLayout.fits && (
                    <figure className="space-y-2 rounded-sm bg-surface-container p-4">
                      <TrajectoryCardSheet
                        layout={cardLayout}
                        content={cardContent}
                        note={cardPrintNote}
                        label={t('印刷するカードのプレビュー', 'Card print preview')}
                        className="mx-auto max-h-[32rem] w-full drop-shadow-sm"
                      />
                      <figcaption className="text-center text-xs text-on-surface-variant">
                        {t(
                          `A4 への配置（画面上は実寸ではありません）。1 枚 ${cardSizeText}、${cardRows.length} / ${cardLayout.maxRows} 行。`,
                          `Layout on A4, not actual size on screen. Each card ${cardSizeText}, ${cardRows.length} of ${cardLayout.maxRows} rows.`,
                        )}
                      </figcaption>
                    </figure>
                  )
                )}
                {cardOverflowMessage && (
                  <p role="alert" className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                    {cardOverflowMessage}
                  </p>
                )}
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '「実際のサイズ（100%）」、余白なし、ヘッダーとフッターなしで印刷し、基準線が 50 mm あるか定規で確かめてください。',
                    'Print at actual size (100%) with no margins, headers or footers, then check that the reference line measures 50 mm.',
                  )}
                </p>
                <Button className="w-full" onClick={printCard}>
                  <LuPrinter aria-hidden="true" />
                  {t('カードを印刷する', 'Print cards')}
                </Button>
              </Card>

              <ConditionSection
                id="notes"
                title={t('計算方法と注意', 'Method and cautions')}
                summary={t('ゼロインは実射で確認してください。', 'Confirm the zero by shooting.')}
              >
                {storageAvailable && (
                  <p className="text-sm text-on-surface-variant" role="status">
                    {t(
                      '入力はこのブラウザーに保存されます。共用の端末では銃と装弾の名前を空欄にしてください。',
                      'Settings are saved in this browser. On a shared device, leave the rifle and load names empty.',
                    )}
                  </p>
                )}
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '平射の質点モデルで G1・G7 の標準抗力表を数値積分します。スピンドリフト、コリオリの効果、上下の風、湿度は含みません。',
                      'Flat-fire point-mass model, integrating the G1 and G7 drag functions. Spin drift, Coriolis, vertical wind and humidity are not included.',
                    )}
                  </li>
                  <li>
                    {t(
                      `上り・下りの射撃では、「${labsTool('sight-adjustment').title.ja}」で斜距離を水平距離に直してから入力してください。`,
                      `For uphill or downhill shots, convert the slant distance to horizontal with the ${labsTool('sight-adjustment').title.en} first.`,
                    )}
                  </li>
                  <li>
                    {t(
                      'MOA は 1/60 度、mil はミリラジアン（1/1000 ラジアン）。円を 6400 分割する NATO mil ではありません。',
                      'MOA is 1/60 degree; mil is a milliradian (1/1000 radian), not the 6400-per-circle NATO mil.',
                    )}
                  </li>
                  <li>
                    {t(
                      '射撃は法令と射撃場の規則に従い、安全な方向・射座で行ってください。',
                      'Follow the law and the range rules, and shoot from a safe position in a safe direction.',
                    )}
                  </li>
                </ul>
              </ConditionSection>
            </>
          }
        />
      </div>
      {printingCards && (
        <div className={styles.sheet}>
          <TrajectoryCardSheet
            layout={cardLayout}
            content={cardContent}
            note={cardPrintNote}
            actualSize
            className="block"
          />
        </div>
      )}
    </AppLayout>
  );
}
