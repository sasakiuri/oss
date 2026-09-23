'use client';

import Link from 'next/link';
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
  SectionNav,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import {
  altitudeInRange,
  altitudeRange,
  temperatureInRange,
  temperatureRange,
  usesAltitude,
  usesPressureReading,
  type AltitudeUnit,
  type AtmosphereSetting,
  type PressureSource,
  type PressureUnit,
  type TemperatureUnit,
} from '@/lib/schemas/trajectory';
import { MAX_TARGET_STABILITY, MIN_TARGET_STABILITY } from '@/lib/schemas/twist-stability';
import {
  ADEQUATE_STABILITY,
  BENCHREST_STABILITY,
  COLD_WEATHER_STABILITY,
  MARGINAL_STABILITY,
  VELOCITY_FLOOR_FPS,
  bulletFromMillimeters,
  calculateTwistStability,
  convertSpeed,
  massFromKilograms,
  type BulletLengthUnit,
  type MassUnit,
  type SpeedUnit,
  type StabilityBand,
  type TwistCaution,
  type TwistCautionKey,
} from '@/lib/twist-stability';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialTwistStabilitySettings, storageKey, useTwistStabilityStore } from './_store';

export function TwistStabilityClient() {
  const {
    bulletUnit,
    twistUnit,
    massUnit,
    speedUnit,
    diameter,
    length,
    mass,
    twist,
    muzzleSpeed,
    targetStability,
    atmosphere,
    setBulletUnit,
    setTwistUnit,
    setMassUnit,
    setSpeedUnit,
    setSettings,
  } = useTwistStabilityStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useTwistStabilityStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const result = calculateTwistStability({
    bulletUnit,
    twistUnit,
    massUnit,
    speedUnit,
    diameter,
    length,
    mass,
    twist,
    muzzleSpeed,
    targetStability,
    atmosphere,
  });

  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';

  const bulletUnitLabel = bulletUnit === 'mm' ? 'mm' : 'inch';
  const twistUnitLabel = twistUnit === 'mm' ? 'mm' : 'inch';
  const massUnitLabel = massUnit === 'g' ? 'g' : 'grain';
  const speedUnitLabel = speedUnit === 'mps' ? 'm/s' : 'fps';
  // The limits are held in °C and metres and shown in the unit the reading is typed in.
  const temperatureUnitLabel = atmosphere.temperature.unit === 'c' ? '°C' : '°F';
  const altitudeUnitLabel = atmosphere.altitude.unit === 'm' ? 'm' : 'ft';
  const temperatureBounds = temperatureRange(atmosphere.temperature.unit);
  const altitudeBounds = altitudeRange(atmosphere.altitude.unit);

  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const targetError = t(
    `${MIN_TARGET_STABILITY} 以上 ${MAX_TARGET_STABILITY} 以下の数値を入力してください。`,
    `Enter a number between ${MIN_TARGET_STABILITY} and ${MAX_TARGET_STABILITY}.`,
  );
  const targetInvalid =
    !Number.isFinite(targetStability) ||
    targetStability < MIN_TARGET_STABILITY ||
    targetStability > MAX_TARGET_STABILITY;

  const temperatureInvalid = !temperatureInRange(atmosphere.temperature.value, atmosphere.temperature.unit);
  const showsPressure = usesPressureReading(atmosphere.source);
  const showsAltitude = usesAltitude(atmosphere.source);
  const pressureInvalid = showsPressure && !positive(atmosphere.pressure.value);
  const altitudeInvalid = showsAltitude && !altitudeInRange(atmosphere.altitude.value, atmosphere.altitude.unit);

  const setAtmosphere = (next: AtmosphereSetting) => setSettings({ atmosphere: next });

  const bandLabel = (band: StabilityBand) =>
    ({
      unstable: t('不安定', 'Unstable'),
      marginal: t('限界', 'Marginal'),
      adequate: t('十分', 'Adequate'),
    })[band];

  const bandText = (band: StabilityBand) =>
    ({
      unstable: t(
        `安定係数が ${MARGINAL_STABILITY.toFixed(1)} 未満です。弾は安定して飛びません。`,
        `Below ${MARGINAL_STABILITY.toFixed(1)}. The bullet will not fly point forward.`,
      ),
      marginal: t(
        `安定はしますが、推奨の ${ADEQUATE_STABILITY.toFixed(1)} に届きません（最低でも ${BENCHREST_STABILITY.toFixed(1)}）。`,
        `Stable, but below the ${ADEQUATE_STABILITY.toFixed(1)} recommended for most uses (${BENCHREST_STABILITY.toFixed(1)} at the very least).`,
      ),
      adequate: t(
        `${ADEQUATE_STABILITY.toFixed(1)} 以上あり、十分です。寒冷地では ${COLD_WEATHER_STABILITY.toFixed(1)} 以上が目安です。`,
        `At or above ${ADEQUATE_STABILITY.toFixed(1)}, enough for most uses. Aim for ${COLD_WEATHER_STABILITY.toFixed(1)} in cold weather.`,
      ),
    })[band];

  const cautionName = (key: TwistCautionKey) =>
    ({
      diameter: t('弾頭の直径', 'the bullet diameter'),
      mass: t('弾頭の重量', 'the bullet weight'),
      twist: t('ツイスト', 'the twist'),
      velocity: t('初速', 'the muzzle velocity'),
      lengthCalibers: t('口径に対する弾長', 'the length in calibers'),
      density: t('寸法と重量から求めた密度', 'the implied density'),
    })[key];

  const cautionLimit = (caution: TwistCaution) => {
    if (caution.key === 'diameter')
      return `${number(bulletFromMillimeters(caution.limit, bulletUnit))} ${bulletUnitLabel}`;
    if (caution.key === 'twist') return `${number(bulletFromMillimeters(caution.limit, twistUnit))} ${twistUnitLabel}`;
    if (caution.key === 'mass') return `${number(massFromKilograms(caution.limit, massUnit), 3)} ${massUnitLabel}`;
    if (caution.key === 'velocity')
      return `${number(convertSpeed(caution.limit, 'mps', speedUnit), 0)} ${speedUnitLabel}`;
    if (caution.key === 'density') return `${number(caution.limit)} g/cm³`;
    return `${number(caution.limit, 1)}`;
  };

  const cautionText = (caution: TwistCaution) =>
    t(
      `${cautionName(caution.key)}が ${cautionLimit(caution)} を${caution.bound === 'below' ? '下回っています' : '超えています'}`,
      `${cautionName(caution.key)} is ${caution.bound === 'below' ? 'below' : 'above'} ${cautionLimit(caution)}`,
    );

  const missingText = t('エラーのある欄を直してください。', 'Correct the fields with errors.');

  const summary = result
    ? t(
        `安定係数 ${number(result.stability)}（${bandLabel(result.band)}）。${bandText(result.band)}`,
        `Stability factor ${number(result.stability)} (${bandLabel(result.band).toLowerCase()}). ${bandText(result.band)}`,
      )
    : missingText;

  useEffect(() => {
    if (!ready) return;
    // Announce only once typing settles, so a screen reader is not read a new result on every keystroke.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  const steps: { key: string; label: string; value: string }[] = result
    ? [
        {
          key: 'standard',
          label: t('基準条件の安定係数', 'Sg at reference conditions'),
          value: number(result.standardStability),
        },
        {
          key: 'velocity',
          label: t('速度補正', 'Velocity correction'),
          value: `×${number(result.velocityFactor, 4)}`,
        },
        {
          key: 'atmosphere',
          label: t('大気補正', 'Air density correction'),
          value: `×${number(result.atmosphereFactor, 4)}`,
        },
      ]
    : [];

  const pressureSourceLabel: Record<PressureSource, string> = {
    station: t('現地で測った気圧', 'Measured at the firing point'),
    'sea-level': t('海面更正気圧（予報値）と標高', 'Sea-level pressure and altitude'),
    altitude: t('標高のみ（標準大気）', 'Altitude only (standard atmosphere)'),
  };

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
    .join(t('・', ' · '));

  const lengthUnits = {
    value: bulletUnit,
    label: t('弾頭の寸法の単位', 'Bullet measurement unit'),
    options: [
      { value: 'mm', label: 'mm' },
      { value: 'inch', label: 'inch' },
    ],
    onChange: (unit: BulletLengthUnit) => setBulletUnit(unit),
  } as const;

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'bullet', label: t('弾頭', 'Bullet') },
            { id: 'barrel-and-shot', label: t('銃身と初速', 'Barrel and velocity') },
            { id: 'results', label: t('安定係数', 'Stability') },
            { id: 'atmosphere', label: t('大気', 'Atmosphere') },
            { id: 'method-and-source', label: t('計算方法', 'Method') },
            { id: 'notes', label: t('弾の種類と確認', 'Bullet types') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('twist-stability').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '弾頭、銃身と初速、大気の入力を初期値に戻します。',
                  en: 'Resets the bullet, barrel, velocity and atmosphere.',
                }}
                onReset={() =>
                  useTwistStabilityStore.setState({
                    ...initialTwistStabilitySettings,
                    lastValidSettings: initialTwistStabilitySettings,
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
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('計算結果', 'Results')}
          primary={
            <>
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="bullet" className="text-xl font-medium">
                  {t('弾頭', 'Bullet')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label={t('弾頭の直径', 'Bullet diameter')}
                    units={lengthUnits}
                    hint={t(
                      '呼び口径ではなく弾頭の実寸（.308 なら 7.82 mm）',
                      'The bullet itself, not the nominal calibre (.308 is 7.82 mm)',
                    )}
                    value={diameter}
                    onChange={(value) => setSettings({ diameter: value })}
                    min={0}
                    invalid={!positive(diameter)}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('弾頭の長さ', 'Bullet length')}
                    unit={bulletUnitLabel}
                    hint={t('先端から底面まで', 'Nose to base')}
                    value={length}
                    onChange={(value) => setSettings({ length: value })}
                    min={0}
                    invalid={!positive(length)}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('弾頭の重量', 'Bullet weight')}
                    units={{
                      value: massUnit,
                      label: t('弾頭の重量の単位', 'Bullet weight unit'),
                      options: [
                        { value: 'g', label: 'g' },
                        { value: 'grain', label: 'grain' },
                      ],
                      onChange: (unit: MassUnit) => setMassUnit(unit),
                    }}
                    hint={t('装弾全体ではなく弾頭のみ', 'Bullet only, not the cartridge')}
                    value={mass}
                    onChange={(value) => setSettings({ mass: value })}
                    min={0}
                    invalid={!positive(mass)}
                    errorText={positiveError}
                  />
                </div>
                {result && (
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      `弾長 ${number(result.lengthCalibers)} 口径・密度 ${number(result.cylinderDensity)} g/cm³`,
                      `Length ${number(result.lengthCalibers)} calibers · density ${number(result.cylinderDensity)} g/cm³`,
                    )}
                  </p>
                )}
              </Card>

              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="barrel-and-shot" className="text-xl font-medium">
                  {t('銃身と初速', 'Barrel and velocity')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label={t('ツイスト（1 回転する長さ）', 'Twist (one turn in)')}
                    units={{
                      value: twistUnit,
                      label: t('ツイストの単位', 'Twist unit'),
                      options: [
                        { value: 'inch', label: 'inch' },
                        { value: 'mm', label: 'mm' },
                      ],
                      onChange: (unit: BulletLengthUnit) => setTwistUnit(unit),
                    }}
                    hint={t('1:10 インチなら 10', 'For 1:10 inch, enter 10')}
                    value={twist}
                    onChange={(value) => setSettings({ twist: value })}
                    min={0}
                    invalid={!positive(twist)}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('初速', 'Muzzle velocity')}
                    units={{
                      value: speedUnit,
                      label: t('初速の単位', 'Velocity unit'),
                      options: [
                        { value: 'mps', label: 'm/s' },
                        { value: 'fps', label: 'fps' },
                      ],
                      onChange: (unit: SpeedUnit) => setSpeedUnit(unit),
                    }}
                    hint={t('実測値か、箱の表示値', 'Measured, or the figure on the box')}
                    value={muzzleSpeed}
                    onChange={(value) => setSettings({ muzzleSpeed: value })}
                    min={0}
                    invalid={!positive(muzzleSpeed)}
                    errorText={positiveError}
                  />
                </div>
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="results" className="text-xl font-medium">
                {t('安定係数', 'Stability')}
              </h2>
              {result ? (
                <>
                  {/* Coloured by the band, which is also named in words. */}
                  <ResultPanel>
                    <ResultFigure
                      size="lead"
                      tone={result.band === 'unstable' ? 'bad' : result.band === 'adequate' ? 'good' : 'neutral'}
                      label={t('ジャイロ安定係数 Sg', 'Gyroscopic stability factor (Sg)')}
                      value={number(result.stability)}
                      unit={t(`（${bandLabel(result.band)}）`, `(${bandLabel(result.band).toLowerCase()})`)}
                      note={bandText(result.band)}
                    />
                    <div className="grid gap-4 border-t border-outline-variant pt-4 sm:grid-cols-2">
                      <ResultFigure
                        label={t(
                          `Sg ${number(targetStability, 1)} に必要なツイスト`,
                          `Twist for Sg ${number(targetStability, 1)}`,
                        )}
                        value={`1:${number(bulletFromMillimeters(result.requiredTwistMm, twistUnit), 2)}`}
                        unit={t(`${twistUnitLabel} 以下`, `${twistUnitLabel} or tighter`)}
                        note={t(
                          `いまの銃は 1:${number(twist, 2)} ${twistUnitLabel}`,
                          `Current barrel: 1:${number(twist, 2)} ${twistUnitLabel}`,
                        )}
                      />
                      <ResultFigure
                        label={t('同じ重量で安定する最大の弾長', 'Longest stable bullet at this weight')}
                        value={number(
                          bulletFromMillimeters(result.maxLengthMm, bulletUnit),
                          bulletUnit === 'mm' ? 1 : 3,
                        )}
                        unit={bulletUnitLabel}
                        note={t(
                          `いまの銃で Sg ${number(targetStability, 1)} を保てる長さ`,
                          `Keeps Sg ${number(targetStability, 1)} in the current barrel`,
                        )}
                      />
                    </div>
                  </ResultPanel>
                </>
              ) : (
                <p className="text-sm text-destructive">{missingText}</p>
              )}
              {/* Outside the result, so it does not vanish when cleared. */}
              <NumberField
                label={t('目標とする安定係数', 'Target stability factor')}
                unit="Sg"
                hint={t(
                  `${BENCHREST_STABILITY.toFixed(1)} ベンチレスト、${ADEQUATE_STABILITY.toFixed(1)} 一般、${COLD_WEATHER_STABILITY.toFixed(1)} 寒冷地`,
                  `${BENCHREST_STABILITY.toFixed(1)} benchrest, ${ADEQUATE_STABILITY.toFixed(1)} most uses, ${COLD_WEATHER_STABILITY.toFixed(1)} cold weather`,
                )}
                value={targetStability}
                onChange={(value) => setSettings({ targetStability: value })}
                min={MIN_TARGET_STABILITY}
                max={MAX_TARGET_STABILITY}
                step={0.1}
                invalid={targetInvalid}
                errorText={targetError}
              />
              {result && (
                <>
                  <table className="w-full text-sm">
                    <caption className="py-2 text-left text-sm font-medium">
                      {t('Sg の内訳', 'How Sg is made up')}
                    </caption>
                    <tbody>
                      {steps.map((row) => (
                        <tr key={row.key} className="border-t border-outline-variant align-top">
                          <th scope="row" className="py-2 text-left font-normal">
                            {row.label}
                          </th>
                          <td className="py-2 text-right tabular-nums">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.velocityFloorApplied && (
                    <p role="status" className="text-sm text-on-surface-variant">
                      {t(
                        `初速が音速（${VELOCITY_FLOOR_FPS} fps）未満のため、速度補正は ${VELOCITY_FLOOR_FPS} fps の値です。`,
                        `Below the speed of sound (${VELOCITY_FLOOR_FPS} fps), the velocity correction uses the ${VELOCITY_FLOOR_FPS} fps value.`,
                      )}
                    </p>
                  )}
                  {result.cautions.length > 0 && (
                    // A caution, not an error: the bounds are editorial. Announced because it appears
                    // without the reader touching the field.
                    <p role="status" className="text-sm text-on-surface-variant">
                      {t(
                        `実在の弾と銃の範囲外の入力があります（${result.cautions.map(cautionText).join('、')}）。単位を確認してください。`,
                        `Some values are outside the range of real bullets and barrels (${result.cautions.map(cautionText).join(', ')}). Check the units.`,
                      )}
                    </p>
                  )}
                </>
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
                label={t('気圧の求め方', 'Pressure from')}
                value={atmosphere.source}
                onChange={(value) => setAtmosphere({ ...atmosphere, source: value as PressureSource })}
                options={(['station', 'sea-level', 'altitude'] as const).map((value) => ({
                  value,
                  label: pressureSourceLabel[value],
                }))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Switching the unit rereads the number; it does not convert it. */}
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
                  invalid={temperatureInvalid}
                  errorText={t(
                    `${temperatureBounds.min} から ${temperatureBounds.max} ${temperatureUnitLabel} の範囲で入力してください。`,
                    `Enter a temperature between ${temperatureBounds.min} and ${temperatureBounds.max} ${temperatureUnitLabel}.`,
                  )}
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
                    onChange={(value) => setAtmosphere({ ...atmosphere, pressure: { ...atmosphere.pressure, value } })}
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
                    onChange={(value) => setAtmosphere({ ...atmosphere, altitude: { ...atmosphere.altitude, value } })}
                    invalid={altitudeInvalid}
                    errorText={t(
                      `${altitudeBounds.min} から ${altitudeBounds.max} ${altitudeUnitLabel} の範囲で入力してください。`,
                      `Enter an altitude between ${altitudeBounds.min} and ${altitudeBounds.max} ${altitudeUnitLabel}.`,
                    )}
                  />
                )}
              </div>
            </ConditionSection>
          }
          extras={
            <>
              <ConditionSection
                id="method-and-source"
                title={t('計算方法と出典', 'Method and source')}
                summary={t(
                  'Don Miller の経験式（2005 年）による銃口での値。詳細な計算より約 7 % 低めに出ます。',
                  'Don Miller’s rule (2005), at the muzzle. Reads about 7 % below a detailed calculation.',
                )}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    'Sg は弾が先端を前にして飛ぶだけの回転があるかを表し、1.0 未満では首を振ります。飛翔中は大きくなるので、最も小さい銃口での値を計算します。',
                    'Sg shows whether a bullet spins fast enough to fly point forward; below 1.0 it yaws. It rises in flight, so the muzzle value, the lowest, is calculated.',
                  )}
                </p>
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>{t('Sg = 30 m /（t² d³ l（1 + l²））', 'Sg = 30 m / (t² d³ l (1 + l²))')}</li>
                  <li>
                    {t(
                      'm: 弾頭重量（grain）、d: 直径（inch）、l: 弾長（口径数）、t: ツイスト（口径数）',
                      'm: bullet weight (grains), d: diameter (inches), l: length (calibers), t: twist (calibers per turn)',
                    )}
                  </li>
                  <li>
                    {t(
                      '速度補正 =（初速 ÷ 2800 fps）の 3 乗根。音速（1120 fps）未満は 1120 fps の値',
                      'Velocity correction = (velocity ÷ 2800 fps)^(1/3); below the speed of sound (1120 fps), the 1120 fps value',
                    )}
                  </li>
                  <li>
                    {t(
                      '大気補正 =（絶対温度 ÷ 288.15 K）×（750 mmHg ÷ 気圧）',
                      'Air density correction = (absolute temperature ÷ 288.15 K) × (750 mmHg ÷ pressure)',
                    )}
                  </li>
                </ul>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '出典: Don Miller「A New Rule for Estimating Rifling Twist: An Aid to Choosing Bullets and Rifles」（Precision Shooting 誌 2005 年 3 月号 43-48 頁、式）、同「How Good Are Simple Rules For Estimating Rifling Twist」（同誌 2009 年 6 月号 48-52 頁、14 種類の弾・40 例との比較）。',
                    'Sources: Don Miller, "A New Rule for Estimating Rifling Twist: An Aid to Choosing Bullets and Rifles", Precision Shooting, March 2005, 43-48 (the rule); Don Miller, "How Good Are Simple Rules For Estimating Rifling Twist", Precision Shooting, June 2009, 48-52 (comparison with 40 published cases for 14 bullets).',
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '米陸軍弾道研究所が測った 39 個の弾の慣性モーメントと転倒モーメントの相関を、厳密な安定性の式に当てはめた経験式で、著者は「おおよその見当」としています。2009 年の比較では他の簡易式より良く合い、詳細な計算より約 7 % 低め（安全側）でした。',
                    'A semi-empirical rule: the moments of inertia and overturning moments of 39 projectiles measured at the US Army Ballistic Research Laboratory, fitted into the exact stability equation. The author calls it a ballpark guide. In the 2009 comparison it matched better than other simple rules and read about 7 % below a detailed calculation (the safe side).',
                  )}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '定数 30 は grain・inch 単位での値なので、入力を grain と inch に換算して計算します。基準は Army Standard Metro（59 °F、750 mmHg、湿度 78 %）と初速 2800 fps です。ISO 2533 標準大気（15 °C、1013.25 hPa）では大気補正は約 0.987 になり、29.92 inHg 基準の計算機は同じ弾で約 1.3 % 高く出ます。',
                    'The constant 30 holds only in grains and inches, so inputs are converted to them for the calculation. The reference is Army Standard Metro (59 °F, 750 mmHg, 78 % humidity) at 2800 ft/s. At the ISO 2533 atmosphere (15 °C, 1013.25 hPa) the air correction is about 0.987, so calculators referenced to 29.92 inHg read about 1.3 % higher for the same bullet.',
                  )}
                </p>
              </ConditionSection>
              <ConditionSection
                id="notes"
                title={t('弾の種類と弾痕での確認', 'Bullet types and checking on target')}
                summary={t(
                  'ジャイロ安定のみの計算です。実際に安定しているかは弾痕の形で確認してください。',
                  'Gyroscopic stability only. Check the bullet holes on the target.',
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
                      '材質は重量に表れるので、鉛芯のジャケット弾も銅の単一素材弾も同じ式で計算できます（出典では密度 2.8 のアルミニウム合金弾でも誤差 2 %）。',
                      'Material shows in the weight, so lead-core, jacketed and solid copper bullets use the same rule (the source found a 2 % error even for an aluminium alloy projectile of density 2.8).',
                    )}
                  </li>
                  <li>
                    {t(
                      '非鉛弾は同じ重量でも鉛の弾より長く、長さは安定係数に最も強く効きます。同じ重量の銅弾に替えるときは、弾長を測って入力し直してください。',
                      'A non-lead bullet is longer than a lead one of the same weight, and length matters most here. When switching to a copper bullet of the same weight, measure its length and enter it again.',
                    )}
                  </li>
                  <li>
                    {t(
                      '樹脂チップ付きの弾はこの式の前提外です。軽いチップも長さとして扱われ、安定係数が低めに出ます。',
                      'Plastic-tipped bullets fall outside this rule: the light tip counts as length, so the factor reads low.',
                    )}
                  </li>
                  <li>
                    {t(
                      '飛翔中に姿勢が収まるか（動的安定）はこの式では分かりません。推奨値の 1.3〜2.0 はその余裕を見た値です。',
                      'Dynamic stability (whether the bullet settles in flight) is not covered; the recommended 1.3 to 2.0 leaves room for it.',
                    )}
                  </li>
                  <li>
                    {t('落差・風偏・残存エネルギーは', 'For drop, wind drift and retained energy, use ')}
                    <Link href="/labs/trajectory" className="underline">
                      {labsTool('trajectory').title[language]}
                    </Link>
                    {t('で計算します（スピンドリフトは含みません）。', ' (spin drift not included).')}
                  </li>
                  <li>
                    {t(
                      '弾痕が丸ければ安定しています。横長の穴は弾が首を振っています。',
                      'A round hole means the bullet is stable; an elongated one means it is yawing.',
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
    </AppLayout>
  );
}
