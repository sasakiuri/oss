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
import { INCLINE_LIMIT_DEGREES, type PowderTemperatureSetting } from '@/lib/schemas/trajectory';
import { fromMeters, withClickPreset } from '@/lib/sight-adjustment';
import type { ClickPreset } from '@/lib/sight-adjustment';
import {
  altitudeInRange,
  altitudeRange,
  temperatureInRange,
  temperatureRange,
  JOULES_PER_FOOT_POUND,
  MAX_TABLE_ROWS,
  calculateTrajectory,
  offsetInClicks,
  fromMetersPerSecond,
  fromMetersToDropUnit,
  usesAltitude,
  usesPressureReading,
  type AltitudeUnit,
  type ClickSetting,
  type DistanceUnit,
  type DragModel,
  type DropUnit,
  type MassUnit,
  type PowderSensitivityUnit,
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
  convertPowderSensitivityValue,
  convertPressureValue,
  convertSightHeightValue,
  convertSpeedValue,
  convertTemperatureValue,
  convertWindSpeedValue,
} from '@/lib/trajectory-units';
import type { TurretTapeLayout } from '@/lib/turret-tape';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialTrajectorySettings, storageKey, useTrajectoryStore } from './_store';
import { HitProbabilitySection } from './hit-probability-section';
import { LazySection } from './lazy-section';
import { LoadComparisonSection } from './load-comparison-section';
import { ReticleHoldSection } from './reticle-hold-section';
import { TrajectoryCardSheet } from './trajectory-card';
import styles from './trajectory-card-print.module.css';
import { TrajectoryTable } from './trajectory-table';
import { TurretTapeSection, TurretTapeSheet } from './turret-tape-section';

/** Below this Mach number a bullet that left supersonic is crossing its own shock wave. */
const TRANSONIC_MACH = 1.2;

/** The powder setting before any of it is typed: the units shown, the numbers blank. */
const BLANK_POWDER: PowderTemperatureSetting = {
  sensitivity: { value: NaN, unit: 'mps-per-c' },
  unit: 'c',
  reference: NaN,
  temperature: NaN,
};

const CLICK_OPTIONS: readonly ClickPreset[] = [
  '1/8-moa',
  '1/4-moa',
  '1/2-moa',
  '1-moa',
  '0.05-mil',
  '0.1-mil',
  'custom',
];

/** The click value as it is printed on a turret, or as the travel a custom one is quoted by. */
function clickSettingLabel(click: ClickSetting | undefined, t: (ja: string, en: string) => string): string {
  if (click === undefined) return t('未設定', 'not set');
  if (click.preset === 'custom') return t(`${click.customMmPer100m} mm/100 m`, `${click.customMmPer100m} mm/100 m`);
  return click.preset.replace('-moa', ' MOA').replace('-mil', ' mil');
}

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
    humidityPercent,
    inclineDegrees,
    powder,
    clickValue,
    comparison,
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
    setHumidityPercent,
    setInclineDegrees,
    setPowder,
    setClickValue,
  } = useTrajectoryStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Set by the print button only; the browser's own print command still prints the page.
  const [printing, setPrinting] = useState<
    { kind: 'cards' } | { kind: 'tape'; layout: TurretTapeLayout; caption: string } | null
  >(null);
  const printingCards = printing?.kind === 'cards';
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
      humidityPercent,
      inclineDegrees,
      powder,
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
      humidityPercent,
      inclineDegrees,
      powder,
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
  // The humidity, the slope and the powder are not entered until typed. A blank one is not an error:
  // the calculation leaves it out and the screen says so. Only a value that was typed is checked.
  const humidityInvalid =
    humidityPercent !== undefined &&
    (!Number.isFinite(humidityPercent) || humidityPercent < 0 || humidityPercent > 100);
  const inclineInvalid =
    inclineDegrees !== undefined &&
    (!Number.isFinite(inclineDegrees) || Math.abs(inclineDegrees) > INCLINE_LIMIT_DEGREES);
  // A powder setting is all or nothing: once one of its numbers is typed, the rest are asked for.
  const powderDraft = powder ?? BLANK_POWDER;
  const sensitivityInvalid = powder !== undefined && !Number.isFinite(powder.sensitivity.value);
  const powderReferenceInvalid = powder !== undefined && !temperatureInRange(powder.reference, powder.unit);
  const powderTemperatureInvalid = powder !== undefined && !temperatureInRange(powder.temperature, powder.unit);
  const editPowder = (next: PowderTemperatureSetting) =>
    setPowder(
      [next.sensitivity.value, next.reference, next.temperature].every((value) => Number.isNaN(value))
        ? undefined
        : next,
    );
  // A custom click value only feeds the clicks readings, so it blanks them and leaves the rest standing.
  const clickInvalid =
    clickValue?.preset === 'custom' &&
    (!Number.isFinite(clickValue.customMmPer100m) || clickValue.customMmPer100m <= 0);
  const clicksUnavailable = clickValue === undefined || clickInvalid;
  const clicksOf = (offsetMeters: number, distanceMeters: number) =>
    clickValue === undefined ? NaN : Math.round(offsetInClicks(offsetMeters, distanceMeters, clickValue));
  /** A blank field clears the setting back to not entered. */
  const enteredOrCleared = (value: number) => (Number.isNaN(value) ? undefined : value);

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
    altitudeInvalid ||
    humidityInvalid ||
    inclineInvalid ||
    sensitivityInvalid ||
    powderReferenceInvalid ||
    powderTemperatureInvalid;
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
  const temperatureRangeError = (unit: TemperatureUnit) => {
    const bounds = temperatureRange(unit);
    const label = unit === 'c' ? '°C' : '°F';
    return t(
      `${bounds.min} から ${bounds.max} ${label} の範囲で入力してください。`,
      `Enter a temperature between ${bounds.min} and ${bounds.max} ${label}.`,
    );
  };
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
  const clickLabel = clickSettingLabel(clickValue, t);
  const cardOffsetLabel =
    card.drop === 'offset'
      ? dropUnit
      : card.drop === 'moa'
        ? 'MOA'
        : card.drop === 'mil'
          ? 'mil'
          : t('クリック', 'clicks');
  const windUnitLabel = wind.unit === 'mps' ? 'm/s' : 'mph';
  const speedUnitLabel = muzzleSpeed.unit === 'mps' ? 'm/s' : 'fps';

  // Drop and drift share one reading. Angles keep one more decimal than lengths: a tenth of a mil
  // is a click on most turrets.
  // Clicks are whole: a turret stops on nothing else. A blank custom click value prints a dash.
  const offsetCell = (offsetMeters: number, moa: number, mil: number, distanceMeters: number) =>
    card.drop === 'offset'
      ? number(fromMetersToDropUnit(offsetMeters, dropUnit), 1)
      : card.drop === 'moa'
        ? number(moa, 1)
        : card.drop === 'mil'
          ? number(mil, 2)
          : number(clicksOf(offsetMeters, distanceMeters), 0);
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
      offsetCell(row.dropMeters, row.dropMoa, row.dropMil, row.distanceMeters),
      ...(card.drift === 'none'
        ? []
        : [
            driftRow
              ? offsetCell(driftRow.driftMeters, driftRow.driftMoa, driftRow.driftMil, driftRow.distanceMeters)
              : '—',
          ]),
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
  // Printed only when they differ from the published tables' own assumptions, so a plain card stays short.
  const cardExtraConditions = [
    card.drop === 'clicks' ? t(`1 クリック ${clickLabel}`, `1 click ${clickLabel}`) : null,
    humidityPercent !== undefined
      ? t(`湿度 ${number(humidityPercent, 0)} %`, `RH ${number(humidityPercent, 0)} %`)
      : null,
    inclineDegrees !== undefined && inclineDegrees !== 0
      ? t(`傾斜 ${number(inclineDegrees, 1)}°`, `slope ${number(inclineDegrees, 1)}°`)
      : null,
    powder !== undefined && cardResult && Math.abs(cardResult.muzzleSpeedMs - cardResult.zeroMuzzleSpeedMs) > 0.05
      ? t(
          `火薬温度 ${number(powder.temperature, 0)} ${powder.unit === 'c' ? '°C' : '°F'}（初速 ${number(fromMetersPerSecond(cardResult.muzzleSpeedMs, muzzleSpeed.unit), 1)} ${speedUnitLabel}）`,
          `powder ${number(powder.temperature, 0)} ${powder.unit === 'c' ? '°C' : '°F'} (MV ${number(fromMetersPerSecond(cardResult.muzzleSpeedMs, muzzleSpeed.unit), 1)} ${speedUnitLabel})`,
        )
      : null,
  ].filter((entry): entry is string => entry !== null);
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
        ...(cardExtraConditions.length > 0 ? [cardExtraConditions.join(t('・', ' · '))] : []),
      ]
    : [];
  const cardContent: TrajectoryCardContent = {
    title: cardTitle,
    conditions: cardConditions,
    headers: cardHeaders,
    rows: cardRows,
  };
  const cardLayout = getTrajectoryCardLayout({ content: cardContent, size: card.size, copies: card.copies });
  const screenOnly = printing ? 'print:hidden' : undefined;
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
    // A card of clicks with no click value would print a column of dashes.
    if (card.drop === 'clicks' && clicksUnavailable) {
      document.getElementById(clickValue === undefined ? 'trajectory-click-value' : 'trajectory-click-custom')?.focus();
      return;
    }
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
    setPrinting({ kind: 'cards' });
  };

  useEffect(() => {
    if (!printing) return;
    // Prints after the render that puts the sheet on the page.
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setPrinting(null);
    };
    // print() returning or afterprint, whichever comes first, puts the page back. React commits
    // the removal after this task, so the sheet stays while the dialog reads it.
    window.addEventListener('afterprint', finish);
    window.print();
    finish();
    return () => window.removeEventListener('afterprint', finish);
  }, [printing]);

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
    humidityPercent === undefined
      ? t('湿度 未入力（乾燥空気）', 'RH not entered (dry air)')
      : t(`湿度 ${number(humidityPercent, 0)} %`, `RH ${number(humidityPercent, 0)} %`),
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
            { id: 'slope-and-powder', label: t('傾斜と火薬温度', 'Slope and powder') },
            { id: 'table-range', label: t('表の距離', 'Table range') },
            { id: 'ballistics-card', label: t('弾道カード', 'Card') },
            { id: 'reticle-hold', label: t('レティクル', 'Reticle') },
            { id: 'turret-tape', label: t('ターレットテープ', 'Turret tape') },
            { id: 'hit-probability', label: t('命中確率', 'Hit probability') },
            { id: 'load-comparison', label: t('ロード比較', 'Compare loads') },
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
                      'G1 と G7 の両方があれば、ボートテール弾は G7',
                      'If both G1 and G7 are given, use G7 for boat tails',
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
                  <SelectField
                    label={t('スコープの調整単位', 'Turret click value')}
                    value={clickValue?.preset ?? ''}
                    onChange={(value) =>
                      setClickValue(value === '' ? undefined : withClickPreset(clickValue, value as ClickPreset))
                    }
                    options={[
                      { value: '', label: t('未設定', 'Not set') },
                      ...CLICK_OPTIONS.map((preset) => ({
                        value: preset,
                        label:
                          preset === 'custom'
                            ? t('カスタム', 'Custom')
                            : clickSettingLabel({ preset, customMmPer100m: 0 }, t),
                      })),
                    ]}
                    fieldId="trajectory-click-value"
                  />
                  {clickValue?.preset === 'custom' && (
                    <NumberField
                      label={t('100 m あたりの移動量', 'Travel per 100 m')}
                      unit="mm"
                      value={clickValue.customMmPer100m}
                      onChange={(customMmPer100m) => setClickValue({ ...clickValue, customMmPer100m })}
                      fieldId="trajectory-click-custom"
                      min={0}
                      invalid={clickInvalid}
                      errorText={positiveError}
                    />
                  )}
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
                      '風が吹いてくる方向（射手から見た時計）',
                      'Where the wind comes from, on the shooter’s clock',
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
                    {Math.abs(result.muzzleSpeedMs - result.zeroMuzzleSpeedMs) > 0.05 && (
                      <p className="text-sm text-on-surface-variant">
                        {t(
                          `火薬温度の補正で、今日の初速は ${number(fromMetersPerSecond(result.muzzleSpeedMs, muzzleSpeed.unit), 1)} ${speedUnitLabel} です。ゼロインは基準温度の初速のままです。`,
                          `Corrected for powder temperature, today’s muzzle velocity is ${number(fromMetersPerSecond(result.muzzleSpeedMs, muzzleSpeed.unit), 1)} ${speedUnitLabel}. The zero stays as set at the reference temperature.`,
                        )}
                      </p>
                    )}
                    {inclineDegrees !== undefined && inclineDegrees !== 0 && (
                      <p className="text-sm text-on-surface-variant">
                        {t(
                          `${number(Math.abs(inclineDegrees), 1)}° の${inclineDegrees > 0 ? '撃ち上げ' : '撃ち下ろし'}。表の距離は照準線に沿った距離（斜距離）です。最大直接照準距離は水平で求めた値です。`,
                          `${number(Math.abs(inclineDegrees), 1)}° ${inclineDegrees > 0 ? 'uphill' : 'downhill'}. Table distances are along the line of sight (slant range). The point blank range is for level ground.`,
                        )}
                      </p>
                    )}
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
                        { value: 'clicks', label: t('クリック', 'Clicks') },
                      ]}
                    />
                    {tableAngle === 'clicks' && clicksUnavailable && (
                      <p className="text-sm text-destructive">
                        {t(
                          '「弾と銃」でスコープの調整単位を選ぶと、クリック数を表示します。',
                          'Choose the turret click value under “Load and rifle” to see clicks.',
                        )}
                      </p>
                    )}
                    {tableAngle === 'clicks' && !clicksUnavailable && (
                      <p className="text-xs text-on-surface-variant">
                        {t(
                          `1 クリック ${clickLabel}。整数に丸めています。`,
                          `1 click = ${clickLabel}, rounded to whole clicks.`,
                        )}
                      </p>
                    )}
                    {result.rows.length > 0 ? (
                      <TrajectoryTable
                        rows={result.rows}
                        language={language}
                        distanceUnit={distanceUnit}
                        dropUnit={dropUnit}
                        angle={tableAngle}
                        click={clickValue}
                        speedUnit={muzzleSpeed.unit}
                        transonicBelowMach={transonicBelowMach}
                        format={number}
                        t={t}
                      />
                    ) : (
                      <p className="text-sm text-destructive">
                        {t(
                          '距離の刻みが最大距離より大きく、表に出せる行がありません。',
                          'The step is larger than the furthest distance, so there are no rows.',
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
                forceOpen={temperatureInvalid || pressureInvalid || altitudeInvalid || humidityInvalid}
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
                  <NumberField
                    label={t('湿度', 'Relative humidity')}
                    unit="%"
                    value={humidityPercent ?? NaN}
                    onChange={(value) => setHumidityPercent(enteredOrCleared(value))}
                    min={0}
                    max={100}
                    invalid={humidityInvalid}
                    errorText={t('0 から 100 の範囲で入力してください。', 'Enter a value from 0 to 100.')}
                    hint={t('空欄なら乾燥空気で計算します。', 'Left blank, the air is taken as dry.')}
                  />
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
                    '予報や空港の気圧は海面更正値なので、「海面更正気圧と標高」を選びます。標高のみは海面気圧を 1013.25 hPa とし、その日の高気圧・低気圧は反映しません。',
                    'Forecast and airfield pressures are corrected to sea level: use “Sea-level pressure and altitude” for them. Altitude only assumes 1013.25 hPa at sea level, whatever the day’s weather.',
                  )}
                </p>
              </ConditionSection>

              <ConditionSection
                id="slope-and-powder"
                title={t('傾斜と火薬温度', 'Slope and powder temperature')}
                summary={t(
                  `${inclineDegrees === undefined ? '傾斜 未入力（水平）' : `傾斜 ${number(inclineDegrees, 1)}°`}・${powder === undefined ? '火薬温度 未入力（補正なし）' : `火薬 ${number(powder.temperature, 1)} ${powder.unit === 'c' ? '°C' : '°F'}（基準 ${number(powder.reference, 1)}）`}`,
                  `${inclineDegrees === undefined ? 'Slope not entered (level)' : `Slope ${number(inclineDegrees, 1)}°`} · ${powder === undefined ? 'powder not entered (no correction)' : `powder ${number(powder.temperature, 1)} ${powder.unit === 'c' ? '°C' : '°F'} (reference ${number(powder.reference, 1)})`}`,
                )}
                forceOpen={inclineInvalid || sensitivityInvalid || powderReferenceInvalid || powderTemperatureInvalid}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label={t('撃ち上げ・撃ち下ろしの角度', 'Uphill or downhill angle')}
                    unit={t('度', 'degrees')}
                    value={inclineDegrees ?? NaN}
                    onChange={(value) => setInclineDegrees(enteredOrCleared(value))}
                    min={-INCLINE_LIMIT_DEGREES}
                    max={INCLINE_LIMIT_DEGREES}
                    invalid={inclineInvalid}
                    errorText={t(
                      `-${INCLINE_LIMIT_DEGREES} から ${INCLINE_LIMIT_DEGREES} の範囲で入力してください。`,
                      `Enter an angle between -${INCLINE_LIMIT_DEGREES} and ${INCLINE_LIMIT_DEGREES}.`,
                    )}
                    hint={t(
                      '上りが正、下りが負。距離は照準線に沿った距離。空欄なら水平',
                      'Positive uphill, negative downhill. Distances are along the line of sight. Blank is level',
                    )}
                  />
                  <NumberField
                    label={t('初速の温度係数', 'Velocity change per degree')}
                    value={powderDraft.sensitivity.value}
                    onChange={(value) =>
                      editPowder({ ...powderDraft, sensitivity: { ...powderDraft.sensitivity, value } })
                    }
                    units={{
                      value: powderDraft.sensitivity.unit,
                      label: t('温度係数の単位', 'Sensitivity unit'),
                      options: [
                        { value: 'mps-per-c', label: 'm/s/°C' },
                        { value: 'fps-per-f', label: 'fps/°F' },
                      ],
                      onChange: (unit: PowderSensitivityUnit) =>
                        editPowder({
                          ...powderDraft,
                          sensitivity: {
                            value: convertPowderSensitivityValue(
                              powderDraft.sensitivity.value,
                              powderDraft.sensitivity.unit,
                              unit,
                            ),
                            unit,
                          },
                        }),
                    }}
                    invalid={sensitivityInvalid}
                    errorText={t('数値を入力してください。', 'Enter a number.')}
                    hint={t('3 つとも空欄なら補正しません', 'With all three blank, no correction is made')}
                  />
                  <NumberField
                    label={t('初速を測ったときの火薬温度', 'Powder temperature when measured')}
                    value={powderDraft.reference}
                    onChange={(reference) => editPowder({ ...powderDraft, reference })}
                    units={{
                      value: powderDraft.unit,
                      label: t('火薬温度の単位', 'Powder temperature unit'),
                      options: [
                        { value: 'c', label: '°C' },
                        { value: 'f', label: '°F' },
                      ],
                      onChange: (unit: TemperatureUnit) =>
                        editPowder({
                          ...powderDraft,
                          unit,
                          reference: convertTemperatureValue(powderDraft.reference, powderDraft.unit, unit),
                          temperature: convertTemperatureValue(powderDraft.temperature, powderDraft.unit, unit),
                        }),
                    }}
                    invalid={powderReferenceInvalid}
                    errorText={temperatureRangeError(powderDraft.unit)}
                  />
                  <NumberField
                    label={t('今日の火薬温度', 'Powder temperature today')}
                    unit={powderDraft.unit === 'c' ? '°C' : '°F'}
                    value={powderDraft.temperature}
                    onChange={(temperature) => editPowder({ ...powderDraft, temperature })}
                    invalid={powderTemperatureInvalid}
                    errorText={temperatureRangeError(powderDraft.unit)}
                    hint={t('日なたの弾は気温より高くなります', 'Rounds in the sun run warmer than the air')}
                  />
                </div>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '初速は温度差に比例して変わるとし、ゼロインは基準温度の初速で合わせたままとします。',
                    'The velocity changes in proportion to the temperature difference; the zero stays as set with the reference velocity.',
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
                      '最大直接照準距離に使う急所の半径。表の落差・風偏もこの単位',
                      'Vital zone radius for the point blank range. Also the unit for drop and drift in the table',
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
                      { value: 'clicks', label: t(`クリック数（${clickLabel}）`, `Clicks (${clickLabel})`) },
                    ]}
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
                      '「1 あたり」は読んだ風速を掛けて使う',
                      'Multiply per-unit drift by the wind speed you read',
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
                          `1 枚 ${cardSizeText}、${cardRows.length} / ${cardLayout.maxRows} 行`,
                          `Each card ${cardSizeText}, ${cardRows.length} of ${cardLayout.maxRows} rows`,
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
                    '「実際のサイズ（100%）」、余白なし、ヘッダーとフッターなしで印刷し、基準線が 50 mm あるか定規で確かめます。',
                    'Print at actual size (100%) with no margins, headers or footers, then check that the reference line measures 50 mm.',
                  )}
                </p>
                <Button className="w-full" onClick={printCard}>
                  <LuPrinter aria-hidden="true" />
                  {t('カードを印刷する', 'Print cards')}
                </Button>
              </Card>

              <LazySection
                id="reticle-hold"
                className="lg:col-span-2"
                title={t('レティクル上の狙い位置', 'Hold on the reticle')}
              >
                <ReticleHoldSection input={input} inputInvalid={inputInvalid} t={t} format={number} />
              </LazySection>
              <LazySection
                id="turret-tape"
                className="lg:col-span-2"
                title={t('ターレットテープの印刷', 'Print a turret tape')}
              >
                <TurretTapeSection
                  input={input}
                  inputInvalid={inputInvalid}
                  click={clickValue}
                  clickLabel={clickLabel}
                  onPrint={(tape) => setPrinting({ kind: 'tape', ...tape })}
                  t={t}
                  format={number}
                />
              </LazySection>
              <LazySection
                id="hit-probability"
                className="lg:col-span-2"
                title={t('命中確率と射程', 'Hit probability and range')}
              >
                <HitProbabilitySection
                  input={input}
                  inputInvalid={inputInvalid}
                  distancesMeters={result?.rows.map((row) => row.distanceMeters) ?? []}
                  t={t}
                  format={number}
                />
              </LazySection>
              <LazySection
                id="load-comparison"
                className="lg:col-span-2"
                title={t('ロードの比較', 'Compare loads')}
                summary={t(
                  `${(comparison?.length ?? 0) + 1} ロード`,
                  `${(comparison?.length ?? 0) + 1} ${comparison === undefined ? 'load' : 'loads'}`,
                )}
              >
                <LoadComparisonSection
                  input={input}
                  inputInvalid={inputInvalid}
                  mainName={card.load.trim()}
                  t={t}
                  format={number}
                />
              </LazySection>

              <ConditionSection
                id="notes"
                title={t('計算方法', 'Method')}
                summary={t(
                  '平射の質点モデル（G1・G7 標準抗力表）',
                  'Flat-fire point-mass model (G1 and G7 drag tables)',
                )}
              >
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      'スピンドリフト、コリオリの効果、上下の風は含みません。',
                      'Spin drift, Coriolis and vertical wind are not included.',
                    )}
                  </li>
                  <li>
                    {t(
                      '湿度は乾燥空気と水蒸気の分圧から空気密度に入れます（飽和水蒸気圧は Buck 1981、空気中の増加係数を含む）。音速は乾燥空気の値のままです。',
                      'Humidity enters the air density through the partial pressures of dry air and water vapour (saturation pressure from Buck 1981, with his enhancement factor for air). The speed of sound stays at the dry air value.',
                    )}
                  </li>
                  <li>
                    {t(
                      '傾斜は重力を照準線に対して傾けて計算します。ゼロインは水平で合わせた銃身の角度のままです。',
                      'A slope tilts gravity against the line of sight. The bore keeps the angle it was zeroed at on level ground.',
                    )}
                  </li>
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
      {printing?.kind === 'tape' && (
        <div className={styles.sheet}>
          <TurretTapeSheet
            layout={printing.layout}
            caption={printing.caption}
            note={t('50 mm の基準線／実際のサイズ（100%）で印刷', '50 mm reference line / print at actual size (100%)')}
            turnLabel={(turn) => t(`${turn + 1} 周目`, `turn ${turn + 1}`)}
            actualSize
            className="block"
          />
        </div>
      )}
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
