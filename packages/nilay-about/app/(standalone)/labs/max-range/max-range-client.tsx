'use client';

import { useEffect, useMemo, useState } from 'react';

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
  calculateMaxRange,
  fromDiameterMeters,
  fromHeightMeters,
  fromKilograms,
  toFootPounds,
  type DiameterUnit,
  type DragModel,
  type Flight,
  type HeightUnit,
  type MassUnit,
  type MaxRangeCaution,
  type MaxRangeCautionKey,
  type ProjectileKind,
  type SpeedUnit,
} from '@/lib/max-range';
import {
  altitudeInRange,
  altitudeRange,
  temperatureInRange,
  temperatureRange,
  usesAltitude,
  usesPressureReading,
  type PressureSource,
} from '@/lib/schemas/trajectory';
import { fromMeters, type DistanceUnit } from '@/lib/sight-adjustment';
import { fromMetersPerSecond } from '@/lib/trajectory';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialMaxRangeSettings, storageKey, useMaxRangeStore } from './_store';

/** Densities in kg/m³ for the materials most shot is made of. */
const MATERIAL_DENSITIES = [
  { value: 'lead', density: 11340 },
  { value: 'steel', density: 7850 },
] as const;

export function MaxRangeClient() {
  const {
    kind,
    bullet,
    sphere,
    muzzleSpeed,
    launchHeight,
    elevationDegrees,
    distanceUnit,
    atmosphere,
    setKind,
    setBullet,
    setSphere,
    setMassUnit,
    setDiameterUnit,
    setMuzzleSpeed,
    setSpeedUnit,
    setLaunchHeight,
    setHeightUnit,
    setElevation,
    setDistanceUnit,
    setAtmosphere,
  } = useMaxRangeStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Chosen "other" while the density still equals a preset; any other density is shown as typed.
  const [otherMaterial, setOtherMaterial] = useState(false);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useMaxRangeStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  // Memoised: the angle search flies the shot a couple of dozen times.
  const computed = useMemo(
    () =>
      calculateMaxRange({
        kind,
        bullet,
        sphere,
        muzzleSpeed,
        launchHeight,
        elevationDegrees,
        distanceUnit,
        atmosphere,
      }),
    [kind, bullet, sphere, muzzleSpeed, launchHeight, elevationDegrees, distanceUnit, atmosphere],
  );

  const number = (value: number, digits = 1) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const distance = (meters: number | undefined) =>
    meters === undefined ? '—' : `${number(fromMeters(meters, distanceUnit), 0)} ${distanceUnit}`;
  const speedPair = (metersPerSecond: number) =>
    `${number(metersPerSecond)} m/s / ${number(fromMetersPerSecond(metersPerSecond, 'fps'), 0)} fps`;
  const energyPair = (joules: number) =>
    `${number(joules, joules < 10 ? 2 : 0)} J / ${number(toFootPounds(joules), joules < 10 ? 2 : 0)} ft-lb`;

  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');
  const angleError = t('0 から 90 の間で入力してください。', 'Enter an angle between 0 and 90.');
  const coefficientError = t('0.01 から 2 の間で入力してください。', 'Enter a coefficient between 0.01 and 2.');
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

  // The same bounds as the saved settings, so a marked value is also one that is not saved.
  const inRange = (value: number, low: number, high: number) => Number.isFinite(value) && value >= low && value <= high;
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const coefficientInvalid = !inRange(bullet.ballisticCoefficient, 0.01, 2);
  const bulletMassInvalid = !positive(bullet.mass.value);
  const diameterInvalid = !positive(sphere.diameter.value);
  const densityInvalid = !positive(sphere.densityKgPerM3);
  const speedInvalid = !positive(muzzleSpeed.value);
  const elevationInvalid = !inRange(elevationDegrees, 0, 90);
  const heightInvalid = !Number.isFinite(launchHeight.value) || launchHeight.value < 0;
  const temperatureInvalid = !temperatureInRange(atmosphere.temperature.value, atmosphere.temperature.unit);
  const pressureInvalid = usesPressureReading(atmosphere.source) && !positive(atmosphere.pressure.value);
  const altitudeInvalid =
    usesAltitude(atmosphere.source) && !altitudeInRange(atmosphere.altitude.value, atmosphere.altitude.unit);
  // The elevation is left out: the maximum range does not depend on it.
  const inputInvalid =
    (kind === 'bullet' ? coefficientInvalid || bulletMassInvalid : diameterInvalid || densityInvalid) ||
    speedInvalid ||
    heightInvalid ||
    temperatureInvalid ||
    pressureInvalid ||
    altitudeInvalid;
  const result = inputInvalid ? null : computed;

  const cautionName = (key: MaxRangeCautionKey) =>
    ({
      muzzleSpeed: t('初速', 'the muzzle velocity'),
      mass: t('弾頭重量', 'the bullet weight'),
      diameter: t('粒の直径', 'the pellet diameter'),
      density: t('材質の密度', 'the density'),
      launchHeight: t('銃口の高さ', 'the muzzle height'),
    })[key];
  const cautionLimit = (caution: MaxRangeCaution) => {
    if (caution.key === 'muzzleSpeed')
      return `${number(fromMetersPerSecond(caution.limit, muzzleSpeed.unit), 0)} ${muzzleSpeed.unit === 'mps' ? 'm/s' : 'fps'}`;
    if (caution.key === 'mass')
      return `${number(fromKilograms(caution.limit, bullet.mass.unit), 2)} ${bullet.mass.unit}`;
    if (caution.key === 'diameter')
      return `${number(fromDiameterMeters(caution.limit, sphere.diameter.unit), 2)} ${sphere.diameter.unit}`;
    if (caution.key === 'density') return `${number(caution.limit, 0)} kg/m³`;
    return `${number(fromHeightMeters(caution.limit, launchHeight.unit), 0)} ${launchHeight.unit}`;
  };
  const cautionText = (caution: MaxRangeCaution) =>
    t(
      `${cautionName(caution.key)}が ${cautionLimit(caution)} を${caution.bound === 'below' ? '下回っています' : '超えています'}`,
      `${cautionName(caution.key)} is ${caution.bound === 'below' ? 'below' : 'above'} ${cautionLimit(caution)}`,
    );

  const emptyMessage = inputInvalid
    ? t('エラーのある欄を直してください。', 'Correct the fields with errors.')
    : t(
        'この入力では計算できません。発射物・初速・大気の値を確認してください。',
        'Cannot calculate with these values. Check the projectile, muzzle velocity and atmosphere.',
      );
  const summary =
    result?.maximum != null
      ? t(
          `最大到達距離 ${distance(result.maximum.flight.rangeMeters)}（仰角 ${number(result.maximum.angleDegrees)} 度）。仰角 ${number(elevationDegrees)} 度では ${distance(result.chosen?.rangeMeters)}。この先が安全という意味ではありません。`,
          `Maximum range ${distance(result.maximum.flight.rangeMeters)} at ${number(result.maximum.angleDegrees)} degrees. At ${number(elevationDegrees)} degrees: ${distance(result.chosen?.rangeMeters)}. Neither figure means anything beyond it is safe.`,
        )
      : emptyMessage;

  useEffect(() => {
    if (!ready) return;
    // Announce only once typing settles, so a screen reader is not read a new result on every keystroke.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  const flightRows: { key: string; label: string; value: (flight: Flight) => string }[] = [
    { key: 'range', label: t('到達距離', 'Range'), value: (flight) => distance(flight.rangeMeters) },
    {
      key: 'apex',
      label: t('最高到達高度', 'Maximum height'),
      value: (flight) => distance(flight.apexMeters),
    },
    {
      key: 'time',
      label: t('滞空時間', 'Time of flight'),
      value: (flight) => t(`${number(flight.flightSeconds)} 秒`, `${number(flight.flightSeconds)} s`),
    },
    {
      key: 'speed',
      label: t('落下時の速度', 'Impact velocity'),
      value: (flight) => speedPair(flight.impactSpeedMs),
    },
    {
      key: 'energy',
      label: t('落下時のエネルギー', 'Impact energy'),
      value: (flight) => energyPair(flight.impactEnergyJoules),
    },
    {
      key: 'angle',
      label: t('落下角（水平から下向き）', 'Impact angle (below horizontal)'),
      value: (flight) => t(`${number(flight.impactAngleDegrees)} 度`, `${number(flight.impactAngleDegrees)}°`),
    },
  ];

  const showsPressure = usesPressureReading(atmosphere.source);
  const showsAltitude = usesAltitude(atmosphere.source);
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
  const landing = result?.maximum?.flight ?? null;
  const presetMaterial = MATERIAL_DENSITIES.find((material) => material.density === sphere.densityKgPerM3);
  const material = otherMaterial || presetMaterial === undefined ? 'other' : presetMaterial.value;
  const energyDigits = (joules: number) => (joules < 10 ? 2 : 0);

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'projectile', label: t('発射物', 'Projectile') },
            { id: 'the-shot', label: t('初速と高さ', 'Velocity and height') },
            { id: 'results', label: t('届く距離', 'Range') },
            { id: 'atmosphere', label: t('大気', 'Atmosphere') },
            { id: 'distance-carried-at-each-elevation', label: t('仰角ごと', 'By elevation') },
            { id: 'method-and-source', label: t('計算方法', 'Method') },
            { id: 'notes', label: t('跳弾と法令', 'Ricochet and law') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('max-range').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '発射物、初速と高さ、仰角、大気の入力を初期値に戻します。',
                  en: 'Resets the projectile, velocity, height, elevation and atmosphere.',
                }}
                onReset={() => {
                  setOtherMaterial(false);
                  useMaxRangeStore.setState({ ...initialMaxRangeSettings, lastValidSettings: initialMaxRangeSettings });
                }}
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
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="projectile" className="text-xl font-medium">
                  {t('発射物', 'Projectile')}
                </h2>
                <SegmentedControl
                  legend={t('発射物の種類', 'Projectile type')}
                  value={kind}
                  onChange={(value) => setKind(value as ProjectileKind)}
                  options={[
                    { value: 'bullet', label: t('単一弾（ライフル弾・スラッグ）', 'Bullet or slug') },
                    { value: 'sphere', label: t('球（散弾の粒・丸弾）', 'Sphere (shot pellet or ball)') },
                  ]}
                />
                {kind === 'bullet' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <NumberField
                      label={t('弾道係数', 'Ballistic coefficient')}
                      hint={t('メーカーの公表値', 'The maker’s published figure')}
                      value={bullet.ballisticCoefficient}
                      onChange={(ballisticCoefficient) => setBullet({ ballisticCoefficient })}
                      units={{
                        value: bullet.dragModel,
                        label: t('抗力モデル', 'Drag model'),
                        options: [
                          { value: 'g1', label: 'G1' },
                          { value: 'g7', label: 'G7' },
                        ],
                        onChange: (dragModel: DragModel) => setBullet({ dragModel }),
                      }}
                      min={0.01}
                      max={2}
                      invalid={coefficientInvalid}
                      errorText={coefficientError}
                    />
                    <NumberField
                      label={t('弾頭重量', 'Bullet weight')}
                      value={bullet.mass.value}
                      onChange={(value) => setBullet({ mass: { ...bullet.mass, value } })}
                      units={{
                        value: bullet.mass.unit,
                        label: t('弾頭重量の単位', 'Bullet weight unit'),
                        options: [
                          { value: 'g', label: 'g' },
                          { value: 'grain', label: 'grain' },
                        ],
                        onChange: (unit: MassUnit) => setMassUnit(unit),
                      }}
                      min={0}
                      invalid={bulletMassInvalid}
                      errorText={positiveError}
                    />
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <NumberField
                      label={t('直径', 'Diameter')}
                      value={sphere.diameter.value}
                      onChange={(value) => setSphere({ diameter: { ...sphere.diameter, value } })}
                      units={{
                        value: sphere.diameter.unit,
                        label: t('直径の単位', 'Diameter unit'),
                        options: [
                          { value: 'mm', label: 'mm' },
                          { value: 'inch', label: 'inch' },
                        ],
                        onChange: (unit: DiameterUnit) => setDiameterUnit(unit),
                      }}
                      min={0}
                      invalid={diameterInvalid}
                      errorText={positiveError}
                    />
                    <SegmentedControl
                      legend={t('材質', 'Material')}
                      orientation="inline"
                      value={material}
                      onChange={(value) => {
                        const preset = MATERIAL_DENSITIES.find((entry) => entry.value === value);
                        setOtherMaterial(preset === undefined);
                        if (preset) setSphere({ densityKgPerM3: preset.density });
                      }}
                      options={[
                        { value: 'lead', label: t('鉛', 'Lead') },
                        { value: 'steel', label: t('鋼', 'Steel') },
                        { value: 'other', label: t('その他', 'Other') },
                      ]}
                    />
                    {material === 'other' && (
                      <NumberField
                        label={t('材質の密度', 'Material density')}
                        unit="kg/m³"
                        hint={t(
                          '純鉛 11 340、軟鋼 7 850。硬質散弾（アンチモン入り）は鉛よりやや小さい値',
                          'Pure lead 11 340, mild steel 7 850. Hardened (antimony) shot is slightly lower than lead.',
                        )}
                        value={sphere.densityKgPerM3}
                        onChange={(densityKgPerM3) => setSphere({ densityKgPerM3 })}
                        min={0}
                        invalid={densityInvalid}
                        errorText={positiveError}
                      />
                    )}
                  </div>
                )}
              </Card>

              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="the-shot" className="text-xl font-medium">
                  {t('初速と高さ', 'Velocity and height')}
                </h2>
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
                    label={t('銃口の高さ', 'Muzzle height')}
                    value={launchHeight.value}
                    onChange={setLaunchHeight}
                    units={{
                      value: launchHeight.unit,
                      label: t('高さの単位', 'Height unit'),
                      options: [
                        { value: 'm', label: 'm' },
                        { value: 'ft', label: 'ft' },
                      ],
                      onChange: (unit: HeightUnit) => setHeightUnit(unit),
                    }}
                    hint={t(
                      '立射で約 1.5 m。高台や櫓からは実際の高さ',
                      'About 1.5 m standing. From a high seat, enter the actual height.',
                    )}
                    min={0}
                    invalid={heightInvalid}
                    errorText={nonNegativeError}
                  />
                </div>
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="results" className="text-xl font-medium">
                {t('届く距離', 'How far it carries')}
              </h2>
              {result === null ? (
                <p className="text-sm text-destructive">{emptyMessage}</p>
              ) : (
                <>
                  <ResultPanel className="grid-cols-2">
                    <div className="col-span-2">
                      <ResultFigure
                        size="lead"
                        label={t('最大到達距離', 'Maximum range')}
                        value={result.maximum === null ? '—' : distance(result.maximum.flight.rangeMeters)}
                        note={
                          result.maximum === null
                            ? undefined
                            : t(
                                `仰角 ${number(result.maximum.angleDegrees)} 度`,
                                `At ${number(result.maximum.angleDegrees)} degrees elevation`,
                              )
                        }
                      />
                    </div>
                    <ResultFigure
                      label={t('そこでの落下速度', 'Impact velocity there')}
                      value={landing === null ? '—' : `${number(landing.impactSpeedMs)} m/s`}
                      note={
                        landing === null
                          ? undefined
                          : `${number(fromMetersPerSecond(landing.impactSpeedMs, 'fps'), 0)} fps`
                      }
                    />
                    <ResultFigure
                      label={t('そこでの落下エネルギー', 'Impact energy there')}
                      value={
                        landing === null
                          ? '—'
                          : `${number(landing.impactEnergyJoules, energyDigits(landing.impactEnergyJoules))} J`
                      }
                      note={
                        landing === null
                          ? undefined
                          : `${number(toFootPounds(landing.impactEnergyJoules), energyDigits(landing.impactEnergyJoules))} ft-lb`
                      }
                    />
                  </ResultPanel>
                  <p className="text-sm font-medium">
                    {t(
                      'ここまで届き得るという距離です。この先が安全という意味ではなく、安全距離の根拠にもなりません。矢先の確認、バックストップ、射線の管理の代わりにはなりません。',
                      'This is how far the shot can carry. It does not make anything beyond it safe and is not a basis for a safety distance. It does not replace checking beyond the target, a backstop or control of the line of fire.',
                    )}
                  </p>
                  {result.cautions.length > 0 && (
                    // The bounds are editorial rather than physical, so this reads as a caution.
                    <p role="status" className="text-sm text-on-surface-variant">
                      {t(
                        `実在の小火器の範囲外の入力があります（${result.cautions.map(cautionText).join('、')}）。単位を確認してください。`,
                        `Some values are outside the range of small arms (${result.cautions.map(cautionText).join(', ')}). Check the units.`,
                      )}
                    </p>
                  )}
                </>
              )}
              {/* Outside the result, so the unit can be chosen before there is anything to show in it. */}
              <SegmentedControl
                legend={t('距離の単位', 'Distance unit')}
                orientation="inline"
                value={distanceUnit}
                onChange={(value) => setDistanceUnit(value as DistanceUnit)}
                options={[
                  { value: 'm', label: 'm' },
                  { value: 'yd', label: 'yd' },
                ]}
              />
              {result !== null && result.journeeMeters !== null && Number.isFinite(result.journeeMeters) && (
                <p className="text-xs text-on-surface-variant">
                  {t(
                    `参考: 鉛の球の Journée の経験則では、この直径で ${distance(result.journeeMeters)}。`,
                    `For comparison, Journée's rule for lead shot gives ${distance(result.journeeMeters)} for this diameter.`,
                  )}
                </p>
              )}
            </Card>
          }
          secondary={
            <ConditionSection
              id="atmosphere"
              title={t('大気', 'Atmosphere')}
              summary={atmosphereSummary}
              forceOpen={temperatureInvalid || pressureInvalid || altitudeInvalid}
            >
              <SelectField
                label={t('気圧の求め方', 'Pressure reading')}
                value={atmosphere.source}
                onChange={(value) => setAtmosphere({ ...atmosphere, source: value as PressureSource })}
                options={[
                  { value: 'station', label: t('現地で測った気圧', 'Measured at the firing point') },
                  { value: 'sea-level', label: t('海面更正気圧と標高', 'Sea-level pressure and altitude') },
                  { value: 'altitude', label: t('標高のみ', 'Altitude only') },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {/* The units are the saved ones and cannot be changed here. */}
                <NumberField
                  label={t('気温', 'Temperature')}
                  unit={temperatureUnitLabel}
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
                    unit={atmosphere.pressure.unit === 'hpa' ? 'hPa' : 'inHg'}
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
                    unit={altitudeUnitLabel}
                    value={atmosphere.altitude.value}
                    onChange={(value) => setAtmosphere({ ...atmosphere, altitude: { ...atmosphere.altitude, value } })}
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
              <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="distance-carried-at-each-elevation" className="text-xl font-medium">
                  {t('仰角ごとの到達距離', 'Range by elevation')}
                </h2>
                <div className="max-w-xs">
                  <NumberField
                    label={t('仰角', 'Elevation')}
                    unit={t('度', 'degrees')}
                    hint={t(
                      '0 度は銃口の高さから水平、90 度は真上',
                      '0 is level from the muzzle height, 90 is straight up',
                    )}
                    value={elevationDegrees}
                    onChange={setElevation}
                    min={0}
                    max={90}
                    invalid={elevationInvalid}
                    errorText={angleError}
                  />
                </div>
                {result !== null && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        {t(
                          '指定した仰角と、最も遠くまで届く仰角での結果',
                          'At the set elevation and at the elevation of maximum range',
                        )}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className="py-2 text-left font-medium">
                            {t('項目', 'Item')}
                          </th>
                          <th scope="col" className="py-2 text-right font-medium">
                            {t(`仰角 ${number(elevationDegrees)} 度`, `At ${number(elevationDegrees)}°`)}
                          </th>
                          <th scope="col" className="py-2 text-right font-medium">
                            {result.maximum === null
                              ? t('最大', 'Maximum')
                              : t(
                                  `最大（仰角 ${number(result.maximum.angleDegrees)} 度）`,
                                  `Maximum (at ${number(result.maximum.angleDegrees)}°)`,
                                )}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {flightRows.map((row) => (
                          <tr key={row.key} className="border-t border-outline-variant align-top">
                            <th scope="row" className="py-2 text-left font-normal">
                              {row.label}
                            </th>
                            <td className="py-2 pl-2 text-right tabular-nums">
                              {result.chosen === null ? '—' : row.value(result.chosen)}
                            </td>
                            <td className="py-2 pl-2 text-right tabular-nums">
                              {result.maximum === null ? '—' : row.value(result.maximum.flight)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <table className="w-full text-sm">
                      <caption className="sr-only">{t('仰角ごとの到達距離', 'Range by elevation')}</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="py-2 text-left font-medium">
                            {t('仰角', 'Elevation')}
                          </th>
                          <th scope="col" className="py-2 text-right font-medium">
                            {t('到達距離', 'Range')}
                          </th>
                          <th scope="col" className="py-2 text-right font-medium">
                            {t('滞空時間', 'Time')}
                          </th>
                          <th scope="col" className="py-2 text-right font-medium">
                            {t('落下時の速度', 'Impact velocity')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.table.map((row) => (
                          <tr key={row.angleDegrees} className="border-t border-outline-variant">
                            <th scope="row" className="py-2 text-left font-normal tabular-nums">
                              {t(`${row.angleDegrees} 度`, `${row.angleDegrees}°`)}
                            </th>
                            <td className="py-2 text-right tabular-nums">
                              {row.flight === null ? '—' : distance(row.flight.rangeMeters)}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {row.flight === null
                                ? '—'
                                : t(`${number(row.flight.flightSeconds)} 秒`, `${number(row.flight.flightSeconds)} s`)}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {row.flight === null ? '—' : speedPair(row.flight.impactSpeedMs)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <ConditionSection
                id="method-and-source"
                title={t('計算方法と出典', 'Method and source')}
                summary={t(
                  '質点モデルと公表された抗力表で計算し、公表値と比べています。',
                  'Point-mass model with published drag tables, checked against published figures.',
                )}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '発射物を抗力と重力だけを受ける質点とし、2 次元で数値積分します。抗力係数は、単一弾では G1・G7 の標準抗力表を弾道係数で割った値、球では球の抗力表の値です。どちらも JBM Ballistics が配布する米陸軍弾道研究所（BRL）由来の数値です。',
                    'The projectile is a point mass under drag and gravity only, integrated numerically in two dimensions. For a bullet, drag comes from the G1 or G7 standard drag table divided by the ballistic coefficient; for a sphere, from the sphere drag table. Both tables are US Army Ballistic Research Laboratory (BRL) data distributed by JBM Ballistics.',
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '大気は ISO 2533 標準大気です。入力した気温・気圧を地表の値とし、高さごとの空気密度と音速を求めます。',
                    'The atmosphere is ISO 2533, starting from the entered temperature and pressure at the firing point; air density and the speed of sound are calculated at each height.',
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '公表値との比較: 12 番 #7 1/2（直径 0.095 インチ）の鉛の粒を初速 1200 fps で撃った場合、NRA Range Services の散弾計算書では最大 668 フィート（約 204 m）、仰角 23〜24 度、落下速度約 73 ft/s。このツールでは約 196 m、仰角約 24 度、落下速度約 74 ft/s です。7.62 mm NATO 級の弾（147 grain、初速 2750 fps、G7 0.200）では約 4.1 km で、米陸軍の射撃場安全基準 DA PAM 385-63 が 7.62 mm M80 に示す 4,100 m とほぼ同じです（同基準の距離は跳弾を含む）。',
                    'Comparison with published figures: for a 12 gauge #7½ lead pellet (0.095 inch) at 1200 fps, the NRA Range Services shotshell calculation gives 668 ft (about 204 m) at 23 to 24 degrees with an impact velocity of about 73 ft/s; this tool gives about 196 m at about 24 degrees and about 74 ft/s. For a 7.62 mm NATO class bullet (147 grain, 2750 fps, G7 0.200) it gives about 4.1 km, against the 4,100 m that the US Army range safety pamphlet DA PAM 385-63 lists for 7.62 mm M80 (that figure includes ricochet).',
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    'これらの資料は、示された距離の内側に弾を留めるよう射撃場や危険範囲を設計するためのものです。このツールは「どこまで届き得るか」を見積もるだけで、封じ込めを設計するための資料ではありません。',
                    'Both documents are for laying out ranges and danger areas so that shots stay within the distances they give. This tool only estimates how far a shot could carry; it is not for designing containment.',
                  )}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    'Journée の経験則（鉛の球の最大到達距離は、直径をインチで表した数の約 2200 倍のヤード数）は、20 世紀初めの実験による目安です。鋼など鉛以外の粒には当てはまりません。',
                    "Journée's rule (maximum range of lead shot in yards ≈ 2200 × pellet diameter in inches) comes from early 20th-century experiments. It does not apply to steel or other non-lead shot.",
                  )}
                </p>
              </ConditionSection>

              <ConditionSection
                id="notes"
                title={t('跳弾・地形と法令', 'Ricochet, terrain and the law')}
                summary={t('跳弾・風・地形は含みません。', 'Ricochet, wind and terrain are not included.')}
              >
                {storageAvailable && (
                  <p className="text-sm text-on-surface-variant" role="status">
                    {t('入力はこのブラウザーに保存されます。', 'Settings are saved in this browser.')}
                  </p>
                )}
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '弾は最後まで先端を前に向けて飛ぶと仮定しています。高い仰角の弾は落下中に横を向いたり回転したりするため、実際の到達距離は計算値より短くなりがちです。',
                      'The projectile is assumed to stay nose-forward. Fired steeply, it yaws or tumbles on the way down, so the real range tends to be shorter.',
                    )}
                  </li>
                  <li>
                    {t(
                      '跳弾は含みません。水面、凍った地面、硬い路面で跳ねた弾は速度を保って飛ぶため、跳弾があり得る場所ではこの計算は上限になりません。公表されている射撃場の危険範囲は跳弾を含んだ距離です。',
                      'Ricochet is not included. A shot that skips off water, frozen ground or a hard road keeps much of its speed, so where ricochet is possible this is not an upper bound. Published range danger areas include ricochet.',
                    )}
                  </li>
                  <li>
                    {t(
                      '風、地形、湿度、コリオリの効果は含みません。地面は射手の足元と同じ高さの平面なので、谷に向けて撃てば計算より遠くへ飛びます。',
                      'Wind, terrain, humidity and the Coriolis effect are not included. The ground is a flat plane level with the shooter’s feet, so a shot over a valley carries further.',
                    )}
                  </li>
                  {kind === 'sphere' && (
                    <li>
                      {t(
                        '球の抗力係数は直径 9/16 インチ（約 14.3 mm）の球で測られた値で、直径数ミリの粒には近似です。粒の変形や粒どうしの干渉は含みません。',
                        'The sphere drag coefficients were measured on a 9/16 inch (about 14.3 mm) sphere, so for pellets a few millimetres across they are an approximation. Pellet deformation and interaction are not included.',
                      )}
                    </li>
                  )}
                  <li>
                    {t(
                      '銃猟は鳥獣保護管理法、都道府県の規制、射撃場の規則に従ってください。住居が集合している地域や広場、道路などでの銃猟は法令で禁じられています。',
                      'Follow the law, prefectural rules and range rules. Shooting in built-up areas, public squares and roads is prohibited by law in Japan.',
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
