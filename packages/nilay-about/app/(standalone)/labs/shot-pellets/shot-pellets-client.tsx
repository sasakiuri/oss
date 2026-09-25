'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  AppHeader,
  AppLayout,
  ConditionPair,
  ConditionSection,
  DiscardedSaveNotice,
  discardedSaveMessage,
  LanguageMenu,
  NumberField,
  ResetButton,
  StorageUnavailableNotice,
  ResultFigure,
  ResultPanel,
  SectionNav,
  SelectField,
  ToolLayout,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import type { AtmosphereSetting, LoadId, PelletLoad } from '@/lib/schemas/shot-pellets';
import type { DistanceUnit } from '@/lib/schemas/sight-adjustment';
import {
  chargeFromKilograms,
  comparePellets,
  convertCharge,
  convertDiameter,
  convertSpeed,
  diameterFromMeters,
  diameterToMeters,
  MATERIAL_DENSITIES,
  resolveConditions,
  SHOT_NUMBERS,
  shotNumberDiameterInches,
  speedFromMetersPerSecond,
  summarisePellets,
  toFootPounds,
  toGrains,
  type PelletCaution,
  type PelletCautionKey,
  type PelletMaterial,
  type PelletSummary,
} from '@/lib/shot-pellets';
import { fromMeters } from '@/lib/sight-adjustment';
import {
  MAX_TABLE_ROWS,
  altitudeInRange,
  temperatureInRange,
  usesAltitude,
  usesPressureReading,
} from '@/lib/trajectory';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { rehydrateGear } from '../shotgun-gear/_store';
import { GearPicker } from '../shotgun-gear/gear-picker';

import { initialShotPelletsSettings, storageKey, useShotPelletsStore } from './_store';
import { NonLeadConversion } from './nonlead-conversion';

/** Half of the hundredth of a millimetre a shot diameter is given to. */
const SHOT_NUMBER_MATCH_METERS = 0.005e-3;

export function ShotPelletsClient() {
  const {
    diameterUnit,
    shotChargeUnit,
    speedUnit,
    distanceUnit,
    step,
    maxRange,
    referenceDistance,
    atmosphere,
    a,
    b,
    setDiameterUnit,
    setShotChargeUnit,
    setSpeedUnit,
    setDistanceUnit,
    setStep,
    setMaxRange,
    setReferenceDistance,
    setAtmosphere,
    setLoad,
    applyShotNumber,
    applyMaterial,
    copyLoad,
  } = useShotPelletsStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useShotPelletsStore.persist.rehydrate(), rehydrateGear(), rehydrateLanguage()]).then(() =>
      setReady(true),
    );
  }, []);

  const units = { diameterUnit, shotChargeUnit, speedUnit, distanceUnit };
  const table = { step, maxRange, referenceDistance };
  const conditions = resolveConditions(atmosphere);
  const summaryA = conditions === null ? null : summarisePellets(a, units, conditions, table);
  const summaryB = conditions === null ? null : summarisePellets(b, units, conditions, table);
  const comparison = comparePellets(summaryA, summaryB);

  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const signedPercent = (value: number) =>
    Number.isFinite(value)
      ? `${new Intl.NumberFormat(language, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(value)}%`
      : '—';

  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const distanceLabel = distanceUnit === 'm' ? 'm' : 'yd';
  const speedPair = (metersPerSecond: number) =>
    `${number(metersPerSecond, 0)} m/s / ${number(speedFromMetersPerSecond(metersPerSecond, 'fps'), 0)} fps`;
  const energyPair = (joules: number) => `${number(joules, 2)} J / ${number(toFootPounds(joules), 2)} ft-lb`;

  const cautionName = (key: PelletCautionKey) =>
    ({
      diameter: t('粒の直径', 'the pellet diameter'),
      density: t('材質の密度', 'the material density'),
      shotCharge: t('装弾量', 'the shot charge'),
      muzzleSpeed: t('初速', 'the muzzle velocity'),
    })[key];
  const cautionLimit = (caution: PelletCaution) => {
    if (caution.key === 'diameter')
      return `${number(diameterFromMeters(caution.limit, diameterUnit), 3)} ${diameterUnit}`;
    if (caution.key === 'density') return `${number(caution.limit / 1000, 2)} g/cm³`;
    if (caution.key === 'muzzleSpeed')
      return `${number(speedFromMetersPerSecond(caution.limit, speedUnit), 0)} ${speedUnit === 'mps' ? 'm/s' : 'fps'}`;
    return `${number(chargeFromKilograms(caution.limit, shotChargeUnit), 3)} ${shotChargeUnit}`;
  };
  const cautionText = (caution: PelletCaution) =>
    t(
      `${cautionName(caution.key)}が ${cautionLimit(caution)} を${caution.bound === 'below' ? '下回っています' : '超えています'}`,
      `${cautionName(caution.key)} is ${caution.bound === 'below' ? 'below' : 'above'} ${cautionLimit(caution)}`,
    );

  const referenceText = `${number(referenceDistance, 1)} ${distanceLabel}`;
  const difference =
    comparison === null
      ? t('両方の条件を入力すると比べられます。', 'Fill in both conditions to compare them.')
      : comparison.referenceEnergyPercent === null
        ? t(
            `条件 A は ${number(summaryA?.count ?? NaN, 0)} 粒、条件 B は ${number(summaryB?.count ?? NaN, 0)} 粒。${referenceText} まで届かない条件があり、エネルギーは比べられません。`,
            `Condition A: ${number(summaryA?.count ?? NaN, 0)} pellets; condition B: ${number(summaryB?.count ?? NaN, 0)}. One condition does not reach ${referenceText}, so energy cannot be compared there.`,
          )
        : t(
            `条件 A は ${number(summaryA?.count ?? NaN, 0)} 粒、条件 B は ${number(summaryB?.count ?? NaN, 0)} 粒。${referenceText} での 1 粒のエネルギーは、条件 B が条件 A より ${number(Math.abs(comparison.referenceEnergyPercent), 1)}% ${comparison.referenceEnergyPercent > 0 ? '大きく' : '小さく'}なります。`,
            `Condition A: ${number(summaryA?.count ?? NaN, 0)} pellets; condition B: ${number(summaryB?.count ?? NaN, 0)}. At ${referenceText}, one pellet of B has ${number(Math.abs(comparison.referenceEnergyPercent), 1)}% ${comparison.referenceEnergyPercent > 0 ? 'more' : 'less'} energy than one of A.`,
          );

  useEffect(() => {
    if (!ready) return;
    // Announce only once typing settles.
    const timer = window.setTimeout(() => setAnnouncement(difference), 700);
    return () => window.clearTimeout(timer);
  }, [ready, difference]);

  const materialOptions: { value: PelletMaterial; label: string }[] = [
    { value: 'lead', label: t('鉛', 'Lead') },
    { value: 'bismuth', label: t('ビスマス', 'Bismuth') },
    { value: 'iron', label: t('鉄（スチール）', 'Iron (steel)') },
    { value: 'tss', label: t('TSS（Federal 公称）', 'TSS (Federal figure)') },
  ];

  // One unit setting for both loads, offered in every field that uses it.
  const diameterUnits = {
    value: diameterUnit,
    label: t('粒の直径の単位', 'Pellet diameter unit'),
    options: [
      { value: 'mm', label: 'mm' },
      { value: 'inch', label: 'inch' },
    ],
    onChange: setDiameterUnit,
  } as const;
  const shotChargeUnits = {
    value: shotChargeUnit,
    label: t('装弾量の単位', 'Shot charge unit'),
    options: [
      { value: 'g', label: 'g' },
      { value: 'oz', label: 'oz' },
    ],
    onChange: setShotChargeUnit,
  } as const;
  const speedUnits = {
    value: speedUnit,
    label: t('初速の単位', 'Velocity unit'),
    options: [
      { value: 'mps', label: 'm/s' },
      { value: 'fps', label: 'fps' },
    ],
    onChange: setSpeedUnit,
  } as const;

  const temperatureInvalid = !temperatureInRange(atmosphere.temperature.value, atmosphere.temperature.unit);
  const showsPressure = usesPressureReading(atmosphere.source);
  const showsAltitude = usesAltitude(atmosphere.source);
  const pressureInvalid =
    showsPressure && (!Number.isFinite(atmosphere.pressure.value) || atmosphere.pressure.value <= 0);
  const altitudeInvalid = showsAltitude && !altitudeInRange(atmosphere.altitude.value, atmosphere.altitude.unit);
  const stepInvalid = !Number.isFinite(step) || step <= 0;
  const maxRangeInvalid = !Number.isFinite(maxRange) || maxRange <= 0;
  const pressureSourceLabel: Record<AtmosphereSetting['source'], string> = {
    station: t('現地の気圧', 'station pressure'),
    'sea-level': t('海面更正気圧', 'sea level pressure'),
    altitude: t('標準大気', 'standard atmosphere'),
  };
  const atmosphereSummary = [
    `${number(atmosphere.temperature.value, 1)} °C`,
    showsPressure ? `${number(atmosphere.pressure.value, 2)} hPa` : null,
    showsAltitude
      ? t(`標高 ${number(atmosphere.altitude.value, 0)} m`, `${number(atmosphere.altitude.value, 0)} m up`)
      : null,
    pressureSourceLabel[atmosphere.source],
  ]
    .filter(Boolean)
    .join(t('・', ' · '));

  // Flags a load card that needs attention while the other one is shown.
  const needsAttention = (load: PelletLoad, summary: PelletSummary | null) =>
    !(load.diameter > 0) ||
    !(load.density > 0) ||
    !(load.shotCharge > 0) ||
    !(load.muzzleSpeed > 0) ||
    (summary?.cautions.length ?? 0) > 0;

  const loadCard = (id: LoadId, load: PelletLoad, summary: PelletSummary | null) => {
    const isBaseline = id === 'a';
    const change = (changes: Partial<PelletLoad>) => setLoad(id, changes);
    // Hints are shown on A only.
    const hint = (text: string) => (isBaseline ? text : undefined);
    const material = (Object.keys(MATERIAL_DENSITIES) as PelletMaterial[]).find(
      (key) => MATERIAL_DENSITIES[key] === load.density,
    );
    // The shot number the diameter matches, within half of 0.01 mm (sizes are 0.254 mm apart).
    const shotNumber = SHOT_NUMBERS.find(
      (candidate) =>
        Math.abs(
          diameterToMeters(load.diameter, diameterUnit) - diameterToMeters(shotNumberDiameterInches(candidate), 'inch'),
        ) < SHOT_NUMBER_MATCH_METERS,
    );
    return (
      <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
        <h2 id={isBaseline ? 'condition-a' : 'condition-b'} className="text-xl font-medium">
          {isBaseline ? t('条件 A', 'Condition A') : t('条件 B', 'Condition B')}
        </h2>
        <fieldset className="min-w-0">
          <legend className="sr-only">
            {isBaseline ? t('条件 A の入力', 'Condition A inputs') : t('条件 B の入力', 'Condition B inputs')}
          </legend>
          <GearPicker
            className="mb-4"
            language={language}
            kind="cartridge"
            onPickCartridge={(cartridge) =>
              change({
                diameter: convertDiameter(cartridge.diameterMm, 'mm', diameterUnit),
                density: cartridge.densityGcm3,
                shotCharge: convertCharge(cartridge.chargeG, 'g', shotChargeUnit),
                ...(cartridge.muzzleSpeedMps === null
                  ? {}
                  : { muzzleSpeed: convertSpeed(cartridge.muzzleSpeedMps, 'mps', speedUnit) }),
              })
            }
          />
          {/* The shot number and the material come first: they are what the box says. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('号数', 'Shot number')}
              value={shotNumber === undefined ? '' : String(shotNumber)}
              onChange={(value) => value !== '' && applyShotNumber(id, Number(value))}
              hint={hint(t('SAAMI の式による平均直径', "Average diameter by SAAMI's rule"))}
              options={[
                { value: '', label: t('直径を直接入力', 'Custom diameter') },
                ...SHOT_NUMBERS.map((shotNumber) => ({
                  value: String(shotNumber),
                  label: t(`${shotNumber} 号`, `No. ${shotNumber}`),
                })),
              ]}
            />
            <NumberField
              label={t('粒の直径', 'Pellet diameter')}
              units={diameterUnits}
              value={load.diameter}
              onChange={(diameter) => change({ diameter })}
              min={0}
              invalid={!Number.isFinite(load.diameter) || load.diameter <= 0}
              errorText={positiveError}
            />
            <SelectField
              label={t('材質', 'Material')}
              value={material ?? ''}
              onChange={(value) => value !== '' && applyMaterial(id, value as PelletMaterial)}
              options={[
                { value: '', label: t('密度を直接入力', 'Custom density') },
                ...materialOptions.map((option) => ({
                  value: option.value,
                  label: `${option.label} ${MATERIAL_DENSITIES[option.value]} g/cm³`,
                })),
              ]}
            />
            <NumberField
              label={t('材質の密度', 'Material density')}
              unit="g/cm³"
              hint={hint(
                t('硬質鉛や合金は純金属より軽くなります。', 'Hardened or alloyed shot is lighter than the pure metal.'),
              )}
              value={load.density}
              onChange={(density) => change({ density })}
              min={0}
              invalid={!Number.isFinite(load.density) || load.density <= 0}
              errorText={positiveError}
            />
            <NumberField
              label={t('装弾量', 'Shot charge')}
              units={shotChargeUnits}
              value={load.shotCharge}
              onChange={(shotCharge) => change({ shotCharge })}
              min={0}
              invalid={!Number.isFinite(load.shotCharge) || load.shotCharge <= 0}
              errorText={positiveError}
            />
            <NumberField
              label={t('初速', 'Muzzle velocity')}
              units={speedUnits}
              value={load.muzzleSpeed}
              onChange={(muzzleSpeed) => change({ muzzleSpeed })}
              min={0}
              invalid={!Number.isFinite(load.muzzleSpeed) || load.muzzleSpeed <= 0}
              errorText={positiveError}
            />
          </div>
          {isBaseline && (
            <p className="mt-4 text-xs text-on-surface-variant">
              {t(
                '単位は A・B 共通で、切り替えると換算します。',
                'Units are shared by A and B; switching converts the values.',
              )}
            </p>
          )}
        </fieldset>
        {summary && summary.cautions.length > 0 && (
          // Editorial bounds, so a caution rather than a refusal.
          <p role="status" className="text-sm text-on-surface-variant">
            {t(
              `実在の装弾の範囲外の入力があります（${summary.cautions.map(cautionText).join('、')}）。単位を確認してください。`,
              `Some input is outside the range of real loads (${summary.cautions.map(cautionText).join(', ')}). Check the units.`,
            )}
          </p>
        )}
        {!summary && conditions !== null && (
          <p className="text-sm text-destructive">
            {t(
              '粒の直径・材質の密度・装弾量・初速を入力してください。',
              'Enter the pellet diameter, material density, shot charge and muzzle velocity.',
            )}
          </p>
        )}
        <Button type="button" variant="outline" onClick={() => copyLoad(id)}>
          {isBaseline ? t('条件 A を条件 B にコピー', 'Copy A into B') : t('条件 B を条件 A にコピー', 'Copy B into A')}
        </Button>
      </Card>
    );
  };

  // Break only between the two units (never inside "ft-lb").
  const pair = (text: string) =>
    text.split(' / ').map((part, index) => (
      <span key={index}>
        {index > 0 && ' / '}
        <span className="whitespace-nowrap">{part}</span>
      </span>
    ));
  const both = (first: string, second: string) => `${first} / ${second}`;
  const speedAt = (metersPerSecond: number) =>
    both(`${number(metersPerSecond, 0)} m/s`, `${number(speedFromMetersPerSecond(metersPerSecond, 'fps'), 0)} fps`);
  const energyAt = (joules: number) => both(`${number(joules, 2)} J`, `${number(toFootPounds(joules), 2)} ft-lb`);
  // The pellet count and the energy at the distance lead in the panel; the table holds the rest.
  const answerRows: { key: string; label: string; value: (summary: PelletSummary) => string }[] = [
    {
      key: 'reference-speed',
      label: t(`${referenceText} での速度`, `Velocity at ${referenceText}`),
      value: (summary) => (summary.reference ? speedAt(summary.reference.speedMs) : '—'),
    },
    {
      key: 'muzzle-energy',
      label: t('銃口での 1 粒のエネルギー', 'One pellet at the muzzle'),
      value: (summary) => energyAt(summary.muzzleEnergyJoules),
    },
    {
      key: 'mass',
      label: t('1 粒の重量', 'One pellet'),
      value: (summary) =>
        both(
          `${number(chargeFromKilograms(summary.massKg, 'g'), 4)} g`,
          `${number(toGrains(summary.massKg), 2)} grain`,
        ),
    },
  ];
  const loadFigure = (label: string, summary: PelletSummary | null) => (
    <ResultFigure
      label={label}
      value={summary ? number(summary.count, 0) : '—'}
      unit={summary && t('粒', 'pellets')}
      note={
        summary &&
        (summary.reference
          ? t(
              `${referenceText} で 1 粒 ${energyAt(summary.reference.energyJoules)}（銃口の ${number((summary.reference.energyJoules / summary.muzzleEnergyJoules) * 100, 0)}%）`,
              `${energyAt(summary.reference.energyJoules)} per pellet at ${referenceText} (${number((summary.reference.energyJoules / summary.muzzleEnergyJoules) * 100, 0)}% of muzzle)`,
            )
          : t(`${referenceText} まで届きません`, `Does not reach ${referenceText}`))
      }
    />
  );
  const comparisonText =
    comparison === null
      ? t('両方の条件を入力すると比べられます。', 'Fill in both conditions to compare them.')
      : t(
          `条件 A 比で、条件 B は粒数 ${signedPercent(comparison.countPercent)}、1 粒の重量 ${signedPercent(comparison.massPercent)}${comparison.referenceEnergyPercent === null ? '' : `、${referenceText} での 1 粒のエネルギー ${signedPercent(comparison.referenceEnergyPercent)}`}。`,
          `B against A: pellet count ${signedPercent(comparison.countPercent)}, pellet weight ${signedPercent(comparison.massPercent)}${comparison.referenceEnergyPercent === null ? '' : `, energy per pellet at ${referenceText} ${signedPercent(comparison.referenceEnergyPercent)}`}.`,
        );

  const rows = summaryA?.rows ?? summaryB?.rows ?? [];
  // floor(longest ÷ step) rows are asked for, so the table is cut once that passes the limit.
  const tableCut = step > 0 && maxRange / step >= MAX_TABLE_ROWS + 1;

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'condition-a', label: t('条件 A', 'Condition A') },
            { id: 'condition-b', label: t('条件 B', 'Condition B') },
            { id: 'results', label: t('粒数とエネルギー', 'Count and energy') },
            { id: 'atmosphere', label: t('大気', 'Air') },
            { id: 'one-pellet-distance-by-distance', label: t('距離ごとの表', 'By distance') },
            { id: 'method-and-source', label: t('計算方法', 'Method') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('shot-pellets').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '条件 A・B、距離、大気、単位を初期値に戻します。',
                  en: 'Resets both loads, the distances, the air and the units.',
                }}
                onReset={() =>
                  useShotPelletsStore.setState({
                    ...initialShotPelletsSettings,
                    lastValidSettings: initialShotPelletsSettings,
                  })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty from the first paint so changes are announced; separate, because status regions are atomic. */}
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
            <ConditionPair
              legend={t('表示する条件', 'Condition shown')}
              attentionLabel={t('確認が必要な入力があります', 'has input to check')}
              first={{
                id: 'condition-a',
                label: t('条件 A', 'Condition A'),
                content: loadCard('a', a, summaryA),
                needsAttention: needsAttention(a, summaryA),
              }}
              second={{
                id: 'condition-b',
                label: t('条件 B', 'Condition B'),
                content: loadCard('b', b, summaryB),
                needsAttention: needsAttention(b, summaryB),
              }}
            />
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="results" className="text-xl font-medium">
                {t('粒数とエネルギー', 'Pellet count and energy')}
              </h2>
              {/* Beside the answer it sets, rather than above the loads. */}
              <NumberField
                label={t('エネルギーを見る距離', 'Distance for the energy')}
                units={{
                  value: distanceUnit,
                  label: t('距離の単位', 'Distance unit'),
                  options: [
                    { value: 'm', label: 'm' },
                    { value: 'yd', label: 'yd' },
                  ],
                  onChange: (unit: DistanceUnit) => setDistanceUnit(unit),
                }}
                hint={t('単位を変えても数値は換算しません。', 'Changing the unit does not convert the number.')}
                value={referenceDistance}
                onChange={setReferenceDistance}
                min={0}
                invalid={!Number.isFinite(referenceDistance) || referenceDistance <= 0}
                errorText={positiveError}
              />
              {conditions === null ? (
                <p className="text-sm text-destructive">
                  {t('気温と気圧を入力してください。', 'Enter the temperature and pressure.')}
                </p>
              ) : (
                <>
                  <ResultPanel className="grid-cols-2">
                    {loadFigure(t('条件 A', 'Condition A'), summaryA)}
                    {loadFigure(t('条件 B', 'Condition B'), summaryB)}
                  </ResultPanel>
                  <p className="text-sm text-on-surface-variant">{comparisonText}</p>
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      {t(
                        `${referenceText} での条件 A と条件 B の 1 粒`,
                        `One pellet of condition A and condition B at ${referenceText}`,
                      )}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="py-2 pr-2 text-left font-medium">
                          <span className="sr-only">{t('項目', 'Quantity')}</span>
                        </th>
                        <th scope="col" className="py-2 pl-2 text-right font-medium">
                          {t('条件 A', 'Condition A')}
                        </th>
                        <th scope="col" className="py-2 pl-2 text-right font-medium">
                          {t('条件 B', 'Condition B')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {answerRows.map((row) => (
                        <tr key={row.key} className="border-t border-outline-variant align-top">
                          <th scope="row" className="w-2/5 py-2 pr-2 text-left font-normal">
                            {row.label}
                          </th>
                          <td className="py-2 pl-2 text-right tabular-nums">
                            {summaryA ? pair(row.value(summaryA)) : '—'}
                          </td>
                          <td className="py-2 pl-2 text-right tabular-nums">
                            {summaryB ? pair(row.value(summaryB)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </Card>
          }
          secondary={
            <ConditionSection
              id="atmosphere"
              title={t('大気', 'Air')}
              summary={atmosphereSummary}
              forceOpen={temperatureInvalid || pressureInvalid || altitudeInvalid}
            >
              <SelectField
                label={t('気圧の指定', 'Pressure reading')}
                value={atmosphere.source}
                onChange={(source: AtmosphereSetting['source']) => setAtmosphere({ ...atmosphere, source })}
                options={[
                  { value: 'station', label: t('現地で測った気圧', 'Measured at the firing point') },
                  { value: 'sea-level', label: t('海面更正気圧と標高', 'Sea level pressure and altitude') },
                  { value: 'altitude', label: t('標高だけ', 'Altitude only') },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label={t('気温', 'Temperature')}
                  unit="°C"
                  value={atmosphere.temperature.value}
                  onChange={(value) =>
                    setAtmosphere({ ...atmosphere, temperature: { ...atmosphere.temperature, value } })
                  }
                  // The same range the saved settings accept.
                  invalid={temperatureInvalid}
                  errorText={t(
                    '-60 から 60 °C の範囲で入力してください。',
                    'Enter a temperature between -60 and 60 °C.',
                  )}
                />
                {showsPressure && (
                  <NumberField
                    label={t('気圧', 'Pressure')}
                    unit="hPa"
                    value={atmosphere.pressure.value}
                    onChange={(value) => setAtmosphere({ ...atmosphere, pressure: { ...atmosphere.pressure, value } })}
                    min={0}
                    invalid={pressureInvalid}
                    errorText={positiveError}
                  />
                )}
                {showsAltitude && (
                  <NumberField
                    label={t('標高', 'Altitude')}
                    unit="m"
                    value={atmosphere.altitude.value}
                    onChange={(value) => setAtmosphere({ ...atmosphere, altitude: { ...atmosphere.altitude, value } })}
                    invalid={altitudeInvalid}
                    errorText={t(
                      '-500 から 9000 m の範囲で入力してください。',
                      'Enter an altitude between -500 and 9000 m.',
                    )}
                  />
                )}
              </div>
            </ConditionSection>
          }
          extras={
            <>
              {/* The step and longest distance only shape this table. */}
              <ConditionSection
                id="one-pellet-distance-by-distance"
                title={t('距離ごとの 1 粒', 'One pellet by distance')}
                summary={t(
                  `${number(step, 1)} ${distanceLabel} 刻みで ${number(maxRange, 1)} ${distanceLabel} まで、A と B の速度・エネルギー・飛行時間・落差`,
                  `Every ${number(step, 1)} ${distanceLabel} to ${number(maxRange, 1)} ${distanceLabel}: velocity, energy, time and drop for A and B`,
                )}
                forceOpen={stepInvalid || maxRangeInvalid}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label={t('距離の刻み', 'Step')}
                    unit={distanceLabel}
                    value={step}
                    onChange={setStep}
                    min={0}
                    invalid={stepInvalid}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('表の最大距離', 'Longest distance')}
                    unit={distanceLabel}
                    value={maxRange}
                    onChange={setMaxRange}
                    min={0}
                    invalid={maxRangeInvalid}
                    errorText={positiveError}
                  />
                </div>
                {tableCut && (
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      `表は ${MAX_TABLE_ROWS} 行までで、${number(step * MAX_TABLE_ROWS, 1)} ${distanceLabel} で終わります。${number(maxRange, 1)} ${distanceLabel} まで表示するには刻みを大きくしてください。`,
                      `The table stops at ${MAX_TABLE_ROWS} rows (${number(step * MAX_TABLE_ROWS, 1)} ${distanceLabel}). Increase the step to reach ${number(maxRange, 1)} ${distanceLabel}.`,
                    )}
                  </p>
                )}
                {rows.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">
                    {t('距離の刻みと最大距離を入力してください。', 'Enter a step and a longest distance.')}
                  </p>
                ) : (
                  // Focusable so the scrolling table is reachable from the keyboard.
                  <div
                    role="region"
                    aria-label={t('距離ごとの 1 粒の表', 'One pellet by distance')}
                    tabIndex={0}
                    className="overflow-auto rounded-sm border border-outline-variant"
                  >
                    <table className="w-full min-w-[42rem] border-collapse text-sm">
                      <caption className="sr-only">
                        {t(
                          '距離ごとの残存速度と 1 粒のエネルギー',
                          'Retained velocity and energy of one pellet by distance',
                        )}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className="px-3 py-2 text-left font-medium">
                            {t('距離', 'Distance')}
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            {t('A の速度', 'A velocity')}
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            {t('A のエネルギー', 'A energy')}
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            {t('B の速度', 'B velocity')}
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            {t('B のエネルギー', 'B energy')}
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            {t('飛行時間', 'Time')}
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">
                            {t('落差', 'Drop')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => {
                          const rowA = summaryA?.rows[index];
                          const rowB = summaryB?.rows[index];
                          const time = rowA ?? rowB;
                          return (
                            // Rows are rebuilt in order and never reordered, so the index is the key.
                            <tr key={index} className="border-t border-outline-variant">
                              <th
                                scope="row"
                                className="px-3 py-2 text-left font-normal whitespace-nowrap tabular-nums"
                              >
                                {number(fromMeters(row.distanceMeters, distanceUnit), 0)} {distanceLabel}
                              </th>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                {rowA ? speedPair(rowA.speedMs) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                {rowA ? energyPair(rowA.energyJoules) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                {rowB ? speedPair(rowB.speedMs) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                {rowB ? energyPair(rowB.energyJoules) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                {time ? `${number(time.timeSeconds, 3)} s` : '—'}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                {time ? `${number(time.dropMeters * 100, 1)} cm` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-on-surface-variant">
                  {t('飛行時間と落差は水平に撃ったときの値です。', 'Time and drop are for a horizontal shot.')}
                </p>
              </ConditionSection>

              <ConditionSection
                id="non-lead"
                title={t('非鉛弾への換算', 'Non-lead equivalent')}
                summary={t(
                  '条件 A と同じ距離で同じエネルギーになる、鉄・ビスマス・TSS の粒の大きさ',
                  'The steel, bismuth and TSS pellet with the same energy as condition A at the comparison distance',
                )}
              >
                <NonLeadConversion
                  load={a}
                  units={units}
                  conditions={conditions}
                  referenceDistance={referenceDistance}
                  language={language}
                />
              </ConditionSection>

              <ConditionSection
                id="method-and-source"
                title={t('計算方法と出典', 'Method and sources')}
                summary={t(
                  '球の抗力表、SAAMI の号数の式、材質の密度',
                  'Sphere drag table, SAAMI shot size rule, material densities',
                )}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '粒を球とし、抗力と重力だけを受けるものとして数値積分します。弾道係数は使いません。',
                    'Each pellet is a sphere under drag and gravity only, integrated numerically. No ballistic coefficient is used.',
                  )}
                </p>
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>{t('1 粒の重量 = π × 直径³ ÷ 6 × 密度', 'Pellet weight = π × diameter³ ÷ 6 × density')}</li>
                  <li>{t('粒数 = 装弾量 ÷ 1 粒の重量', 'Pellet count = shot charge ÷ pellet weight')}</li>
                  <li>
                    {t(
                      '減速 = ½ × 空気密度 × 速度² × 抗力係数 × 前面投影面積 ÷ 1 粒の重量',
                      'Deceleration = ½ × air density × velocity² × drag coefficient × frontal area ÷ pellet weight',
                    )}
                  </li>
                  <li>
                    {t('1 粒のエネルギー = ½ × 1 粒の重量 × 速度²', 'Pellet energy = ½ × pellet weight × velocity²')}
                  </li>
                </ul>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '球の抗力係数は、JBM Ballistics が配布する米陸軍弾道研究所（BRL）由来の表（mcgs.txt、2026-09-22 取得）を使います。号数からの直径は、SAAMI 用語集「SHOT SIZE」（https://saami.org/glossary/shot-size/、2026-09-22 取得）の式「直径（1/100 インチ）= 17 − 号数」によります。この式は平均直径です。材質の密度は英国王立化学会の周期表（https://periodic-table.rsc.org/、2026-09-22 取得）の値で、鉛 11.3、ビスマス 9.79、鉄 7.87 g/cm³ です。TSS の 18 g/cm³ は Federal が HEAVYWEIGHT TSS について公表している値（https://www.federalpremium.com/shotshell/heavyweight-tss/、2026-09-24 確認）で、その製品だけの値です。',
                    "Sphere drag coefficients: the US Army Ballistic Research Laboratory table distributed by JBM Ballistics (mcgs.txt, retrieved 2026-09-22). Diameters from shot numbers: the rule in SAAMI's glossary entry SHOT SIZE (https://saami.org/glossary/shot-size/, retrieved 2026-09-22), diameter in hundredths of an inch = 17 − number. It gives an average diameter. Material densities: the Royal Society of Chemistry periodic table (https://periodic-table.rsc.org/, retrieved 2026-09-22), lead 11.3, bismuth 9.79, iron 7.87 g/cm³. TSS at 18 g/cm³ is Federal's published figure for HEAVYWEIGHT TSS (https://www.federalpremium.com/shotshell/heavyweight-tss/, checked 2026-09-24) and applies to that product only.",
                  )}
                </p>
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '国内の装弾の粒径は、装弾の表示か実測で確かめてください。',
                      'Check the pellet size of Japanese shells against the box or a measurement.',
                    )}
                  </li>
                  <li>
                    {t(
                      '抗力の表は直径 9/16 インチ（約 14.3 mm）の球の測定値で、数 mm の粒への適用は近似です。',
                      'The drag table was measured on a 9/16-inch (about 14.3 mm) sphere, so applying it to pellets a few millimetres across is an approximation.',
                    )}
                  </li>
                  <li>
                    {t(
                      '粒の変形・粒同士の干渉・弾列の長さ・真球でない粒・チョークとワッズは含まないため、実際の装弾はこの値より不利です。粒数も装弾ごとに異なります。',
                      'Pellet deformation, pellet interference, shot string length, out-of-round pellets, choke and wad are not included; real shells do worse, and real pellet counts vary.',
                    )}
                  </li>
                  <li>
                    {t('当たる粒の数はパターンで決まります。', 'How many pellets hit depends on the pattern.')}{' '}
                    <Link href="/labs/shot-pattern" className="underline">
                      {labsTool('shot-pattern').title[language]}
                    </Link>
                    {t('で、実際の銃と装弾のパターンを測れます。', ' measures it for your gun and load.')}
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
