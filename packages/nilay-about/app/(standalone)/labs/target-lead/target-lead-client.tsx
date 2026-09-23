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
  MS_PER_SECOND,
  calculateTargetLead,
  leadTable,
  type ProjectileSpeedUnit,
  type TargetSpeedUnit,
} from '@/lib/target-lead';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialTargetLeadSettings, storageKey, useTargetLeadStore } from './_store';

export function TargetLeadClient() {
  const {
    targetSpeed,
    distance,
    crossingAngleDegrees,
    projectileSpeed,
    delaySeconds,
    setTargetSpeed,
    setDistance,
    setCrossingAngle,
    setProjectileSpeed,
    setDelay,
  } = useTargetLeadStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useTargetLeadStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const settings = { targetSpeed, distance, crossingAngleDegrees, projectileSpeed, delaySeconds };
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
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');
  const angleError = t('0 から 180 の範囲で入力してください。', 'Enter an angle between 0 and 180.');

  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';

  const interceptShift = result
    ? Math.abs(fromMeters(result.interceptDistanceMeters - result.distanceMeters, distance.unit))
    : NaN;
  // At a square crossing the whole lead is across the line of sight, so that figure would repeat it.
  const showCrossLead = crossingAngleDegrees !== 90;
  const unreachableText = t(
    'この弾速では的に追いつきません。弾速・的の速度・交差角を見直してください。',
    'The shot never catches the target. Check the projectile speed, target speed and crossing angle.',
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

  const shotSummary = [
    `${Number.isFinite(projectileSpeed.value) ? number(projectileSpeed.value, 0) : '—'} ${projectileSpeed.unit}`,
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
                      note={result && `${number(result.crossLead.feet)} ft / ${number(result.crossLead.inches, 1)} in`}
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
              forceOpen={projectileSpeedInvalid || delayInvalid}
            >
              <NumberField
                label={t('弾速', 'Projectile speed')}
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
                hint={t(
                  '射距離までの平均速度。銃口初速ではリードが小さく出ます。',
                  'Average speed over the distance. A muzzle velocity gives too little lead.',
                )}
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
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <div className="space-y-2">
                  <h2 id="table" className="text-xl font-medium">
                    {t('距離・交差角別のリード', 'Lead by range and angle')}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {rows.length
                      ? t(
                          '視線を横切る分のリード（m）。距離と角度のほかは入力のまま。',
                          'Lead across the line of sight (m). Everything but range and angle as entered.',
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
                <p className="text-xs text-on-surface-variant">
                  {t(
                    'どの行も入力した平均速度で計算するため、遠い距離ほどリードは小さめに出ます。',
                    'Every row uses the average speed you entered, so longer ranges read low.',
                  )}
                </p>
              </Card>

              <ConditionSection
                id="notes"
                title={t('計算方法', 'How it is calculated')}
                summary={t(
                  '等速で直進する的への幾何的なリード。実射で確かめてください。',
                  'Geometric lead on a target flying straight at a steady speed. Confirm it by shooting.',
                )}
              >
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      'リード = 的の速度 ×（弾の飛行時間 + 遅れ時間）。クレーにも鳥にも、撃ち方（維持リード・追い越しなど）を問わず同じです。',
                      'Lead = target speed × (time of flight + delay). The same for clays and birds, and for sustained lead, swing-through or any other technique.',
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
                      '弾の落下、的の減速、風、散弾の弾列の長さは扱いません。',
                      'Drop, target slowdown, wind and shot-string length are not included.',
                    )}
                  </li>
                  <li>
                    {t(
                      'MOA は 1/60 度、mil はミリラジアン（1/1000 ラジアン）です。',
                      'MOA is 1/60 of a degree; mil is a milliradian (1/1000 radian).',
                    )}
                  </li>
                  <li>
                    {t(
                      '射撃は法令と射撃場の規則に従い、安全な方向・射座で行ってください。',
                      'Follow the law and the range rules, and shoot in a safe direction from a safe position.',
                    )}
                  </li>
                </ul>
                {storageAvailable && (
                  <p className="text-xs text-on-surface-variant">
                    {t('入力はこのブラウザーに保存されます。', 'Inputs are saved in this browser.')}
                  </p>
                )}
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
