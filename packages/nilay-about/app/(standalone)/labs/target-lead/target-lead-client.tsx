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
import type { DistanceUnit } from '@/lib/schemas/sight-adjustment';
import { fromMeters } from '@/lib/sight-adjustment';
import {
  LEAD_TABLE_ANGLES_DEGREES,
  MAX_TILT_DEGREES,
  MS_PER_SECOND,
  calculateTargetLead,
  leadTable,
  type ProjectileSpeedUnit,
  type TargetSpeedUnit,
} from '@/lib/target-lead';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { rehydrateGear } from '../shotgun-gear/_store';
import { GearPicker } from '../shotgun-gear/gear-picker';

import { initialTargetLeadSettings, storageKey, useTargetLeadStore } from './_store';
import { LeadDiagrams } from './lead-diagrams';

export function TargetLeadClient() {
  const {
    targetSpeed,
    distance,
    crossingAngleDegrees,
    projectileSpeed,
    delaySeconds,
    elevationDegrees,
    climbDegrees,
    speedModel,
    pellet,
    setTargetSpeed,
    setDistance,
    setCrossingAngle,
    setProjectileSpeed,
    setDelay,
    setElevation,
    setClimb,
    setSpeedModel,
    setPellet,
  } = useTargetLeadStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useTargetLeadStore.persist.rehydrate(), rehydrateGear(), rehydrateLanguage()]).then(() =>
      setReady(true),
    );
  }, []);

  const drag = speedModel === 'drag';
  const settings = {
    targetSpeed,
    distance,
    crossingAngleDegrees,
    projectileSpeed,
    delaySeconds,
    elevationDegrees,
    climbDegrees,
    flight: drag
      ? {
          model: 'drag' as const,
          diameterMeters: pellet.diameterMm / 1000,
          densityKgPerM3: pellet.densityGcm3 * 1000,
        }
      : { model: 'average' as const },
  };
  const outcome = calculateTargetLead(settings);
  const result = outcome.kind === 'lead' ? outcome.result : null;
  // Valid inputs where the shot never catches the target: an answer, not an incomplete form.
  const unreachable = outcome.kind === 'unreachable';
  const rows = leadTable(settings);

  const targetSpeedInvalid = !Number.isFinite(targetSpeed.value) || targetSpeed.value < 0;
  const distanceInvalid = !Number.isFinite(distance.value) || distance.value <= 0;
  const angleInvalid = !Number.isFinite(crossingAngleDegrees) || crossingAngleDegrees < 0 || crossingAngleDegrees > 180;
  const projectileSpeedInvalid = !Number.isFinite(projectileSpeed.value) || projectileSpeed.value <= 0;
  const delayInvalid = !Number.isFinite(delaySeconds) || delaySeconds < 0;
  const tiltInvalid = (value: number) => !Number.isFinite(value) || Math.abs(value) > MAX_TILT_DEGREES;
  const diameterInvalid = !Number.isFinite(pellet.diameterMm) || pellet.diameterMm <= 0;
  const densityInvalid = !Number.isFinite(pellet.densityGcm3) || pellet.densityGcm3 <= 0;
  const tiltError = t(
    `-${MAX_TILT_DEGREES} から ${MAX_TILT_DEGREES} の範囲で入力してください。`,
    `Enter an angle between -${MAX_TILT_DEGREES} and ${MAX_TILT_DEGREES}.`,
  );
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');
  const angleError = t('0 から 180 の範囲で入力してください。', 'Enter an angle between 0 and 180.');

  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';

  const interceptShift = result
    ? Math.abs(fromMeters(result.interceptDistanceMeters - result.distanceMeters, distance.unit))
    : NaN;
  // At a square crossing the whole lead is across the line of sight, so that figure would repeat it.
  const showVertical = elevationDegrees !== 0 || climbDegrees !== 0 || drag;
  const showCrossLead = crossingAngleDegrees !== 90 || showVertical;
  const unreachableText = t(
    'この弾速では的に追いつきません。弾速・的の速度・交差角・射距離を見直してください。',
    'The shot never catches the target. Check the projectile speed, target speed, crossing angle and range.',
  );
  // Each invalid field is already marked beside itself.
  const incompleteText = t('エラーのある欄を直してください。', 'Correct the fields marked with an error.');
  const summary = result
    ? t(
        // The flight alone; the delay is shown separately.
        `リードは ${number(result.lead.meters)} m、弾の飛行時間は ${number(result.flightSeconds, 3)} 秒です。`,
        `Lead ${number(result.lead.meters)} m, flight time ${number(result.flightSeconds, 3)} s.`,
      )
    : unreachable
      ? unreachableText
      : incompleteText;

  useEffect(() => {
    if (!ready) return;
    // Announce once typing settles, not on every keystroke.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  const speedText = `${Number.isFinite(projectileSpeed.value) ? number(projectileSpeed.value, 0) : '—'} ${projectileSpeed.unit}`;
  const shotSummary = [
    drag
      ? t(
          `抗力で計算・${number(pellet.diameterMm)} mm・初速 ${speedText}`,
          `Drag, ${number(pellet.diameterMm)} mm, muzzle ${speedText}`,
        )
      : t(`平均 ${speedText}`, `Average ${speedText}`),
    Number.isFinite(delaySeconds) && delaySeconds > 0
      ? t(`遅れ ${number(delaySeconds, 3)} 秒`, `${number(delaySeconds, 3)} s delay`)
      : t('遅れなし', 'no delay'),
  ].join(t('・', ', '));

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('target-lead').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: 'すべての入力を初期値に戻します。',
                  en: 'All inputs return to their defaults.',
                }}
                onReset={() =>
                  useTargetLeadStore.setState({
                    ...initialTargetLeadSettings,
                    lastValidSettings: initialTargetLeadSettings,
                  })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty so the message is announced; separate from the result so it is not repeated. */}
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
              <h2 id="shot" className="text-xl font-medium">
                {t('的と距離', 'Target and range')}
              </h2>
              <div className="grid grid-cols-2 items-start gap-4">
                <NumberField
                  label={t('射距離', 'Distance')}
                  value={distance.value}
                  onChange={(value) => setDistance({ ...distance, value })}
                  units={{
                    value: distance.unit,
                    label: t('距離の単位', 'Distance unit'),
                    options: [
                      { value: 'm', label: 'm' },
                      { value: 'yd', label: 'yd' },
                    ],
                    onChange: (unit: DistanceUnit) => setDistance({ ...distance, unit }),
                  }}
                  min={0}
                  invalid={distanceInvalid}
                  errorText={positiveError}
                />
                <NumberField
                  label={t('交差角', 'Crossing angle')}
                  unit={t('度', 'degrees')}
                  value={crossingAngleDegrees}
                  onChange={setCrossingAngle}
                  min={0}
                  max={180}
                  invalid={angleInvalid}
                  errorText={angleError}
                  hint={t('0＝向かってくる、90＝真横、180＝遠ざかる', '0: incoming, 90: crossing, 180: going away')}
                />
                <NumberField
                  className="col-span-2 sm:col-span-1"
                  label={t('的の速度', 'Target speed')}
                  value={targetSpeed.value}
                  onChange={(value) => setTargetSpeed({ ...targetSpeed, value })}
                  units={{
                    value: targetSpeed.unit,
                    label: t('速度の単位', 'Speed unit'),
                    options: [
                      { value: 'km/h', label: 'km/h' },
                      { value: 'm/s', label: 'm/s' },
                      { value: 'mph', label: 'mph' },
                    ],
                    onChange: (unit: TargetSpeedUnit) => setTargetSpeed({ ...targetSpeed, unit }),
                  }}
                  min={0}
                  invalid={targetSpeedInvalid}
                  errorText={nonNegativeError}
                />
                <NumberField
                  label={t('的の高さ（仰角）', 'Target elevation')}
                  unit={t('度', 'degrees')}
                  value={elevationDegrees}
                  onChange={setElevation}
                  min={-MAX_TILT_DEGREES}
                  max={MAX_TILT_DEGREES}
                  invalid={tiltInvalid(elevationDegrees)}
                  errorText={tiltError}
                  hint={t(
                    '発砲時に的が見える角度。水平が 0、上がプラス。',
                    'Angle up to the target at the shot: 0 level, positive above.',
                  )}
                />
                <NumberField
                  label={t('的の上昇角', 'Target climb')}
                  unit={t('度', 'degrees')}
                  value={climbDegrees}
                  onChange={setClimb}
                  min={-MAX_TILT_DEGREES}
                  max={MAX_TILT_DEGREES}
                  invalid={tiltInvalid(climbDegrees)}
                  errorText={tiltError}
                  hint={t(
                    '的の飛ぶ向きの傾き。上昇がプラス、下降がマイナス。',
                    'Slope of the target’s path: positive climbing, negative dropping.',
                  )}
                />
              </div>
              <p className="text-xs text-on-surface-variant">
                {t('単位を変えても数値は換算しません。', 'Changing a unit does not convert the number.')}
              </p>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="lead" className="text-xl font-medium">
                {t('必要なリード', 'Lead')}
              </h2>
              <ResultPanel>
                <ResultFigure
                  size="lead"
                  label={t('リード（的の前方）', 'Lead ahead of the target')}
                  value={result ? `${number(result.lead.meters)} m` : '—'}
                  note={result && `${number(result.lead.feet)} ft / ${number(result.lead.inches, 1)} in`}
                />
                <div className="grid grid-cols-2 gap-4 border-t border-outline-variant pt-4">
                  <ResultFigure
                    label={t('銃口を振る角度', 'Swing angle')}
                    value={result ? `${number(result.angleDegrees)}°` : '—'}
                    note={result && `${number(result.moa, 1)} MOA / ${number(result.mil)} mil`}
                  />
                  <ResultFigure
                    label={t('弾の飛行時間', 'Time of flight')}
                    value={result ? number(result.flightSeconds, 3) : '—'}
                    unit={result && t('秒', 's')}
                    note={
                      result &&
                      // The flight alone, with the total beside it when there is a delay.
                      (result.delaySeconds > 0
                        ? t(
                            `${number(result.flightSeconds * MS_PER_SECOND, 0)} ms・遅れ込みで ${number(result.totalSeconds, 3)} 秒`,
                            `${number(result.flightSeconds * MS_PER_SECOND, 0)} ms; ${number(result.totalSeconds, 3)} s with the delay`,
                          )
                        : `${number(result.flightSeconds * MS_PER_SECOND, 0)} ms`)
                    }
                  />
                  {showCrossLead && (
                    <ResultFigure
                      label={t('視線を横切る分', 'Across the line of sight')}
                      value={result ? `${number(result.crossLead.meters)} m` : '—'}
                      note={result && `${number(result.horizontalDegrees)}° / ${number(result.crossLead.inches, 1)} in`}
                    />
                  )}
                  {showVertical && (
                    <ResultFigure
                      label={t('上下方向', 'Up or down')}
                      value={
                        result
                          ? `${number(Math.abs(result.verticalLead.meters))} m ${result.verticalLead.meters >= 0 ? t('上', 'up') : t('下', 'down')}`
                          : '—'
                      }
                      note={
                        result &&
                        `${number(Math.abs(result.verticalDegrees))}° / ${number(Math.abs(result.verticalLead.inches), 1)} in${
                          drag
                            ? t(
                                `（落下 ${number(result.dropMeters * 100, 1)} cm を含む）`,
                                ` (includes ${number(result.dropMeters * 100, 1)} cm of drop)`,
                              )
                            : ''
                        }`
                      }
                    />
                  )}
                  {drag && (
                    <ResultFigure
                      label={t('到達時の速度', 'Speed on arrival')}
                      value={result ? `${number(result.impactSpeedMps, 0)} m/s` : '—'}
                      note={
                        result &&
                        t(
                          `平均 ${number(result.averageSpeedMps, 0)} m/s`,
                          `average ${number(result.averageSpeedMps, 0)} m/s`,
                        )
                      }
                    />
                  )}
                  <ResultFigure
                    label={t('会合点までの距離', 'Range at impact')}
                    value={
                      result
                        ? `${number(fromMeters(result.interceptDistanceMeters, distance.unit))} ${distance.unit}`
                        : '—'
                    }
                    note={
                      result &&
                      // A closing target is met nearer than the range, an opening one further out.
                      (number(interceptShift) === number(0)
                        ? t('射距離とほぼ同じ', 'About the entered range')
                        : t(
                            `射距離より ${number(interceptShift)} ${distance.unit} ${result.interceptDistanceMeters < result.distanceMeters ? '近い' : '遠い'}`,
                            `${number(interceptShift)} ${distance.unit} ${result.interceptDistanceMeters < result.distanceMeters ? 'nearer than' : 'beyond'} the entered range`,
                          ))
                    }
                  />
                </div>
              </ResultPanel>
              {!result && <p className="text-sm text-destructive">{unreachable ? unreachableText : incompleteText}</p>}
            </Card>
          }
          secondary={
            <ConditionSection
              id="delay"
              title={t('弾速と発砲の遅れ', 'Projectile speed and delay')}
              summary={shotSummary}
              forceOpen={projectileSpeedInvalid || delayInvalid || (drag && (diameterInvalid || densityInvalid))}
            >
              <SegmentedControl
                legend={t('弾速の求め方', 'Shot speed')}
                value={speedModel}
                options={[
                  { value: 'drag', label: t('初速から抗力で計算', 'From muzzle velocity with drag') },
                  { value: 'average', label: t('平均速度を入力', 'Enter an average speed') },
                ]}
                onChange={(value) => setSpeedModel(value as 'drag' | 'average')}
              />
              {drag && (
                <>
                  <GearPicker
                    language={language}
                    kind="cartridge"
                    onPickCartridge={(cartridge) => {
                      setPellet({ diameterMm: cartridge.diameterMm, densityGcm3: cartridge.densityGcm3 });
                      if (cartridge.muzzleSpeedMps !== null)
                        setProjectileSpeed({ value: cartridge.muzzleSpeedMps, unit: 'm/s' });
                    }}
                  />
                  <div className="grid grid-cols-2 items-start gap-4">
                    <NumberField
                      label={t('粒の直径', 'Pellet diameter')}
                      unit="mm"
                      value={pellet.diameterMm}
                      onChange={(diameterMm) => setPellet({ ...pellet, diameterMm })}
                      min={0}
                      step={0.01}
                      invalid={diameterInvalid}
                      errorText={positiveError}
                    />
                    <NumberField
                      label={t('粒の密度', 'Pellet density')}
                      unit="g/cm³"
                      value={pellet.densityGcm3}
                      onChange={(densityGcm3) => setPellet({ ...pellet, densityGcm3 })}
                      min={0}
                      step={0.01}
                      invalid={densityInvalid}
                      errorText={positiveError}
                      hint={t('鉛 11.3・ビスマス 9.79・鉄 7.87', 'Lead 11.3, bismuth 9.79, iron 7.87')}
                    />
                  </div>
                </>
              )}
              <NumberField
                label={drag ? t('初速', 'Muzzle velocity') : t('平均弾速', 'Average speed')}
                value={projectileSpeed.value}
                onChange={(value) => setProjectileSpeed({ ...projectileSpeed, value })}
                units={{
                  value: projectileSpeed.unit,
                  label: t('弾速の単位', 'Projectile speed unit'),
                  options: [
                    { value: 'm/s', label: 'm/s' },
                    { value: 'fps', label: 'fps' },
                  ],
                  onChange: (unit: ProjectileSpeedUnit) => setProjectileSpeed({ ...projectileSpeed, unit }),
                }}
                min={0}
                invalid={projectileSpeedInvalid}
                errorText={positiveError}
                hint={
                  drag
                    ? undefined
                    : t(
                        '射距離までの平均速度。銃口初速ではリードが小さく出ます。',
                        'Average speed over the distance. A muzzle velocity gives too little lead.',
                      )
                }
              />
              <NumberField
                label={t('遅れ時間（任意）', 'Delay (optional)')}
                unit={t('秒', 'seconds')}
                value={delaySeconds}
                onChange={setDelay}
                min={0}
                invalid={delayInvalid}
                errorText={nonNegativeError}
                hint={t(
                  'ロックタイムと反応時間。飛行時間に足します。',
                  'Lock time plus reaction time. Added to the flight time.',
                )}
              />
            </ConditionSection>
          }
          extras={
            <>
              {result && (
                <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                  <h2 id="diagrams" className="text-xl font-medium">
                    {t('リードの図', 'Lead diagrams')}
                  </h2>
                  <LeadDiagrams
                    result={result}
                    crossingAngleDegrees={crossingAngleDegrees}
                    elevationDegrees={elevationDegrees}
                    climbDegrees={climbDegrees}
                    language={language}
                  />
                </Card>
              )}
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <div className="space-y-2">
                  <h2 id="table" className="text-xl font-medium">
                    {t('距離・交差角別のリード', 'Lead by range and angle')}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {rows.length
                      ? t(
                          '横方向のリード（m）。距離と交差角のほかは入力のまま。',
                          'Sideways lead (m). Everything but range and crossing angle as entered.',
                        )
                      : unreachable
                        ? t(
                            '弾が的に追いつかないため、表はありません。',
                            'No table: the shot never catches the target.',
                          )
                        : t(
                            'エラーのある欄を直すと表示します。',
                            'Correct the fields marked with an error to see the table.',
                          )}
                  </p>
                </div>
                {rows.length > 0 && (
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      {t(
                        '距離と交差角ごとの、視線を横切る分のリード（m）',
                        'Lead across the line of sight (m), by range and crossing angle',
                      )}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="py-2 text-left font-medium">
                          {t('距離', 'Range')}{' '}
                          <span className="font-normal text-on-surface-variant">({distance.unit})</span>
                        </th>
                        {LEAD_TABLE_ANGLES_DEGREES.map((angle) => (
                          <th key={angle} scope="col" className="py-2 text-right font-medium">
                            {angle}°
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.distanceMeters}
                          className={`border-t border-outline-variant${row.current ? ' bg-surface-container' : ''}`}
                        >
                          {/* The entered range is marked in weight as well as colour. */}
                          <th scope="row" className={`py-2 text-left tabular-nums ${row.current ? '' : 'font-normal'}`}>
                            {number(fromMeters(row.distanceMeters, distance.unit))}
                            {row.current && <span className="sr-only"> {t('入力した距離', 'the entered range')}</span>}
                          </th>
                          {row.cells.map((cell) => (
                            <td key={cell.angleDegrees} className="py-2 text-right tabular-nums">
                              {/* A dash where the shot never catches the target. */}
                              {cell.crossLeadMeters === null ? '—' : number(cell.crossLeadMeters)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!drag && (
                  <p className="text-xs text-on-surface-variant">
                    {t(
                      'どの行も入力した平均速度で計算するため、遠い距離ほどリードは小さく出ます。',
                      'Every row uses the average speed you entered, so longer ranges read low.',
                    )}
                  </p>
                )}
              </Card>

              <ConditionSection
                id="notes"
                title={t('計算方法', 'How it is calculated')}
                summary={t('等速で直進する的へのリード', 'Lead on a target flying straight at a steady speed')}
              >
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      'リード = 的の速度 ×（弾の飛行時間 + 遅れ時間）',
                      'Lead = target speed × (time of flight + delay)',
                    )}
                  </li>
                  <li>
                    {t(
                      '振る角度は、リードのうち視線を横切る分に対応します。0° と 180° では 0 で、遅れ時間が 0 なら射距離によらず的と弾の速度比で決まります。',
                      'The swing angle covers the part of the lead across the line of sight. It is 0 at 0° and 180°, and with no delay it depends only on the ratio of the two speeds.',
                    )}
                  </li>
                  <li>
                    {t(
                      '90° 未満では的が近づいて飛行時間が短く、90° を超えると長くなります。',
                      'Below 90° the target closes and the flight is shorter; above 90° it is longer.',
                    )}
                  </li>
                  <li>
                    {t(
                      '的の高さ（仰角）と上昇角を入れると、リードを横方向と上下方向に分けます。上昇する的には上に、下降する的には下にリードが必要です。',
                      'With an elevation and a climb, the lead splits into a sideways and an up-or-down part. A climbing target needs lead above it, a dropping one below.',
                    )}
                  </li>
                  <li>
                    {t(
                      '「初速から抗力で計算」では、米国陸軍弾道研究所の球の抗力表、重力、海面の標準大気で 1 粒を銃口の向きに飛ばし、減速と落下を入れて会合点を求めます。撃ち上げ・撃ち下ろしでは重力の弾道方向の成分も減速・加速に入ります。落下の分だけ上を狙う点に含めます。粒の変形、粒どうしの干渉、チョークとワッズは入りません。「平均速度を入力」では弾は入力した速度で直進し、落下しません。',
                      'From muzzle velocity with drag flies one pellet with the US Army Ballistic Research Laboratory sphere drag table, gravity and the sea-level standard atmosphere, along the line the muzzle points on, so the shot slows and falls, and the aiming point is raised by the drop. Up or down a slope, the part of gravity along that line slows or speeds the pellet too. Pellet deformation, interaction between pellets, choke and wad are not included. With an average speed, the shot flies straight at that speed and does not fall.',
                    )}
                  </li>
                  <li>
                    {t(
                      '的の減速・進路の変化、風、散弾の弾列の長さは扱いません。',
                      'Target slowdown, a change of course, wind and shot-string length are not included.',
                    )}
                  </li>
                  <li>
                    {t(
                      'MOA は 1/60 度、mil はミリラジアン（1/1000 ラジアン）です。',
                      'MOA is 1/60 of a degree; mil is a milliradian (1/1000 radian).',
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
